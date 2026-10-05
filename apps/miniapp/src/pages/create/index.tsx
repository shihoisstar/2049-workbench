import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Textarea, Image } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';

import type { GenerationTask } from '@wb/contracts';

import { ApiError, createTask, ensureSession, polishCopy, uploadImage } from '../../services/api';

import './index.scss';

/** 与 apps/api ESTIMATE_CREDITS 对齐(V0 常量;T1.4 定价时改为估算端点)。 */
const ESTIMATE_CREDITS = 10;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const RATIOS = [
  { value: '9:16', label: '竖屏 9:16' },
  { value: '16:9', label: '横屏 16:9' },
  { value: '1:1', label: '方形 1:1' },
];
const RESOLUTIONS = [
  { value: '480p', label: '480P', badge: '免费' },
  { value: '720p', label: '720P', badge: '' },
  { value: '1080p', label: '1080P', badge: '' },
];
const DURATIONS = [
  { value: 5, label: '5 秒' },
  { value: 10, label: '10 秒' },
];

/** 创作表单(T2.3):字段对标 S17-S18(灵感描述/参考图/比例/清晰度/时长),差异化=积分估算条。 */
export default function Create() {
  const [prompt, setPrompt] = useState('');

  // T3.2「生成同款」:读取模板预填(一次性,读后即清)
  useEffect(() => {
    const prefill = Taro.getStorageSync('wb_prefill') as { promptTemplate?: string; title?: string } | '';
    if (prefill && prefill.promptTemplate) {
      setPrompt(prefill.promptTemplate);
      setFromTemplate(prefill.title ?? '');
      Taro.removeStorageSync('wb_prefill');
    }
  }, []);
  const [images, setImages] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [ratio, setRatio] = useState('9:16');
  const [resolution, setResolution] = useState('480p');
  const [duration, setDuration] = useState(5);
  const [blockedHits, setBlockedHits] = useState<string[]>([]);
  const [fromTemplate, setFromTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [polishing, setPolishing] = useState(false);

  const canSubmit = useMemo(() => prompt.trim().length > 0 && !submitting, [prompt, submitting]);

  const pickImage = useCallback(async () => {
    const res = await Taro.chooseImage({ count: MAX_IMAGES - images.length, sizeType: ['compressed'] });
    const oversized = res.tempFilePaths.some((path: string, i: number) => (res.tempFiles?.[i]?.size ?? 0) > MAX_IMAGE_BYTES);
    if (oversized) {
      Taro.showToast({ title: '单张图片需小于 10M', icon: 'none' });
      return;
    }
    const localPaths = [...images, ...res.tempFilePaths].slice(0, MAX_IMAGES);
    setImages(localPaths);
    // 选图即上传(V1 传图生成);失败仅提示,不阻塞表单
    try {
      await ensureSession();
      const urls: string[] = [];
      for (const path of res.tempFilePaths) {
        urls.push(await uploadImage(path));
      }
      setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '图片上传失败', icon: 'none' });
    }
  }, [images.length]);

  const onSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setBlockedHits([]);
    try {
      await ensureSession();
      const task: GenerationTask = await createTask({
        prompt: prompt.trim(),
        imageUrls: imageUrls.length ? imageUrls : undefined,
        aspectRatio: ratio,
        resolution,
        durationSec: duration,
      });
      Taro.redirectTo({ url: `/pages/progress/index?taskId=${task.id}` });
    } catch (e) {
      if (e instanceof ApiError && e.code === 5001) {
        setBlockedHits(e.details?.hits ?? []);
        Taro.showToast({ title: '内容包含违规词,请修改', icon: 'none' });
      } else if (e instanceof ApiError && e.code === 3001) {
        Taro.showModal({
          title: '积分不足',
          content: '本次预计消耗 10 积分,余额不够啦,去充值?',
          confirmText: '去充值',
          success: (r) => r.confirm && Taro.navigateTo({ url: '/pages/store/index' }),
        });
      } else {
        Taro.showToast({ title: (e as Error).message || '提交失败', icon: 'none' });
      }
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, prompt, ratio, resolution, duration]);

  return (
    <View className="create-page">
      <View className="create-card">
        {fromTemplate && <Tag type="warning">来自模板:{fromTemplate}</Tag>}
        <Text className="create-label">灵感描述</Text>
        <View className={`create-textarea-wrap ${blockedHits.length ? 'blocked' : ''}`}>
          <Textarea
            className="create-textarea"
            value={prompt}
            maxlength={3000}
            placeholder="一句话描述你的创意,例如:一只柯基在雨后的便利店门口摇尾巴…"
            onInput={(e) => setPrompt(e.detail.value)}
          />
          <Text className="create-count">{prompt.length}/3000</Text>
        </View>
        {blockedHits.length === 0 && prompt.trim().length >= 2 && (
          <View
            className={`create-polish ${polishing ? 'disabled' : ''}`}
            onClick={async () => {
              if (polishing) return;
              setPolishing(true);
              try {
                await ensureSession();
                const text = await polishCopy(prompt.trim());
                setPrompt(text);
                Taro.showToast({ title: 'AI 文案已生成(可再编辑)', icon: 'none' });
              } catch (e) {
                Taro.showToast({ title: (e as Error).message || '文案服务暂不可用', icon: 'none' });
              } finally {
                setPolishing(false);
              }
            }}
          >
            <Text className="create-polish-text">{polishing ? '✦ AI 写作中…' : '✦ AI 帮我写'}</Text>
          </View>
        )}
        {blockedHits.length > 0 && (
          <View className="create-blocked">
            <Text className="create-blocked-text">
              包含违规词:{blockedHits.map((h) => `「${h}」`).join(' ')} —— 修改后再试
            </Text>
          </View>
        )}

        <Text className="create-label">参考图(可选,≤3 张,单张 10M 内)</Text>
        <View className="create-images">
          {images.map((src) => (
            <Image key={src} className="create-image" src={src} mode="aspectFill" />
          ))}
          {images.length < MAX_IMAGES && (
            <View className="create-image add" onClick={() => void pickImage()}>
              <Text className="create-image-add">＋</Text>
            </View>
          )}
        </View>
      </View>

      <View className="create-card">
        <Text className="create-label">画面比例</Text>
        <View className="create-options">
          {RATIOS.map((o) => (
            <View
              key={o.value}
              className={`create-option ${ratio === o.value ? 'active' : ''}`}
              onClick={() => setRatio(o.value)}
            >
              <Text className={`create-option-text ${ratio === o.value ? 'active' : ''}`}>{o.label}</Text>
            </View>
          ))}
        </View>

        <Text className="create-label">清晰度</Text>
        <View className="create-options">
          {RESOLUTIONS.map((o) => (
            <View
              key={o.value}
              className={`create-option ${resolution === o.value ? 'active' : ''}`}
              onClick={() => setResolution(o.value)}
            >
              <Text className={`create-option-text ${resolution === o.value ? 'active' : ''}`}>{o.label}</Text>
              {!!o.badge && <Text className="create-option-badge">{o.badge}</Text>}
            </View>
          ))}
        </View>

        <Text className="create-label">时长</Text>
        <View className="create-options">
          {DURATIONS.map((o) => (
            <View
              key={o.value}
              className={`create-option ${duration === o.value ? 'active' : ''}`}
              onClick={() => setDuration(o.value)}
            >
              <Text className={`create-option-text ${duration === o.value ? 'active' : ''}`}>{o.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 差异化点(MKV-01/D11):生成前估算透明 */}
      <View className="create-estimate">
        <Text className="create-estimate-label">本次预计消耗</Text>
        <Text className="create-estimate-value">{ESTIMATE_CREDITS} 积分</Text>
        <Text className="create-estimate-note">生成前冻结,失败即时退 · 不多扣一分</Text>
      </View>

      <View
        className={`create-submit ${canSubmit ? '' : 'disabled'}`}
        onClick={() => void onSubmit()}
      >
        <Text className="create-submit-text">{submitting ? '提交中…' : '开始生成'}</Text>
      </View>
    </View>
  );
}
