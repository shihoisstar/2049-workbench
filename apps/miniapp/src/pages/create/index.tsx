import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Textarea, Image } from '@tarojs/components';
import { Tag } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';

import type { GenerationTask } from '@wb/contracts';

import { ApiError, createTask, ensureSession, generateImage, polishCopy, uploadImage } from '../../services/api';

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

/** 创作表单(T2.3+V1):视频/绘画双模式;字段对标 S17-S18,差异化=积分估算条+AI 帮我写。 */
export default function Create() {
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [ratio, setRatio] = useState('9:16');
  const [resolution, setResolution] = useState('480p');
  const [duration, setDuration] = useState(5);
  const [blockedHits, setBlockedHits] = useState<string[]>([]);
  const [fromTemplate, setFromTemplate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [polishing, setPolishing] = useState(false);
  // V1 绘画模式:'video' | 'paint'(AI 绘画/改图)
  const [mode, setMode] = useState<'video' | 'paint'>('video');
  const [paintResult, setPaintResult] = useState<string | null>(null);

  // T3.2「生成同款」:读取模板预填(一次性,读后即清)
  useEffect(() => {
    const prefill = Taro.getStorageSync('wb_prefill') as { promptTemplate?: string; title?: string } | '';
    if (prefill && prefill.promptTemplate) {
      setPrompt(prefill.promptTemplate);
      setFromTemplate(prefill.title ?? '');
      Taro.removeStorageSync('wb_prefill');
    }
  }, []);

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
    // 选图即上传(传图生成/改图);失败仅提示,不阻塞表单
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
      // 绘画模式:同步生成,结果就地展示(不走任务系统/不冻结积分,V1 免费体验)
      if (mode === 'paint') {
        const { imageUrl } = await generateImage({
          prompt: prompt.trim(),
          imageUrls: imageUrls.length ? imageUrls : undefined,
          aspectRatio: ratio.includes(':') ? ratio : '1:1',
        });
        setPaintResult(imageUrl);
        Taro.showToast({ title: '绘画完成', icon: 'success' });
        return;
      }
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
  }, [canSubmit, prompt, ratio, resolution, duration, mode, imageUrls]);

  const savePaint = useCallback(async () => {
    if (!paintResult) return;
    try {
      if (process.env.TARO_ENV === 'weapp') {
        const dl = await Taro.downloadFile({ url: paintResult });
        await Taro.saveImageToPhotosAlbum({ filePath: dl.tempFilePath });
        Taro.showToast({ title: '已保存到相册', icon: 'success' });
      } else {
        await Taro.setClipboardData({ data: paintResult });
        Taro.showToast({ title: '图片链接已复制', icon: 'none' });
      }
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    }
  }, [paintResult]);

  return (
    <View className="create-page">
      {/* 模式切换(V1):生成视频 / AI 绘画 */}
      <View className="create-modes">
        <View className={`create-mode ${mode === 'video' ? 'active' : ''}`} onClick={() => setMode('video')}>
          <Text className={`create-mode-text ${mode === 'video' ? 'active' : ''}`}>🎬 生成视频</Text>
        </View>
        <View className={`create-mode ${mode === 'paint' ? 'active' : ''}`} onClick={() => setMode('paint')}>
          <Text className={`create-mode-text ${mode === 'paint' ? 'active' : ''}`}>🎨 AI 绘画</Text>
        </View>
      </View>

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
        {mode === 'paint' && imageUrls.length > 0 && (
          <Text className="create-edit-hint">已上传参考图 → 将使用改图模型(Seedream Edit)</Text>
        )}
      </View>

      <View className="create-card">
        {mode === 'video' ? (
          <>
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
          </>
        ) : (
          <>
            <Text className="create-label">画面比例</Text>
            <View className="create-options">
              {['1:1', '9:16', '16:9'].map((r) => (
                <View key={r} className={`create-option ${ratio === r ? 'active' : ''}`} onClick={() => setRatio(r)}>
                  <Text className={`create-option-text ${ratio === r ? 'active' : ''}`}>{r}</Text>
                </View>
              ))}
            </View>
            <Text className="create-edit-hint">上传参考图即自动改图(Seedream Edit);不传为文生图</Text>
          </>
        )}
      </View>

      {/* 差异化点(MKV-01/D11):生成前估算透明;绘画 V1 免费体验 */}
      <View className="create-estimate">
        <Text className="create-estimate-label">{mode === 'paint' ? 'AI 绘画' : '本次预计消耗'}</Text>
        {mode === 'paint' ? (
          <Text className="create-estimate-value">免费体验</Text>
        ) : (
          <Text className="create-estimate-value">{ESTIMATE_CREDITS} 积分</Text>
        )}
        <Text className="create-estimate-note">
          {mode === 'paint' ? 'V1 体验期免费,正式定价随 BIZ 档位' : '生成前冻结,失败即时退 · 不多扣一分'}
        </Text>
      </View>

      {paintResult && (
        <View className="create-paint-result">
          <Image className="create-paint-img" src={paintResult} mode="aspectFit" />
          <View className="create-paint-save" onClick={() => void savePaint()}>
            <Text className="create-paint-save-text">保存图片(复制链接)</Text>
          </View>
        </View>
      )}

      <View
        className={`create-submit ${canSubmit ? '' : 'disabled'}`}
        onClick={() => void onSubmit()}
      >
        <Text className="create-submit-text">
          {submitting ? '提交中…' : mode === 'paint' ? '开始绘画(约 10-30 秒)' : '开始生成'}
        </Text>
      </View>
    </View>
  );
}
