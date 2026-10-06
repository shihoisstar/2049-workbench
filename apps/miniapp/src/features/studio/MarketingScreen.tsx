import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { Button, Text, Textarea, View } from '@tarojs/components';
import type { GenerationQuote } from '@wb/contracts';
import { generationWallet, newRequestKey, pendingGeneration, quoteGeneration, submitGeneration } from '../../services/generation';
import { Action, art, Cover, Icon, PageHeader, previewNotice } from './shared';

export function MarketingScreen({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState('剧情带货');
  const [prompt, setPrompt] = useState(
    '以「在忙碌的城市中，也记得取悦自己」为主题，拍一支女性向的香水短视频。氛围温暖高级，突出产品质感，传递自信、独立、优雅的生活态度。',
  );
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const duration = 5;
  const [material, setMaterial] = useState(true);
  const [quote, setQuote] = useState<GenerationQuote | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingGeneration);
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    setQuote(null);
    setQuoteError(false);
    void quoteGeneration({ resolution, aspectRatio: ratio, durationSec: duration }).then(
      result => { if (active) setQuote(result); },
      () => { if (active) setQuoteError(true); },
    );
    return () => { active = false; };
  }, [resolution, ratio, duration, quoteRetry]);
  // A previous response must not be displayed while new settings are being quoted.
  const currentQuote = quote?.resolution === resolution && quote.aspectRatio === ratio ? quote : null;
  useEffect(() => {
    if (quote?.available) void generationWallet().then(wallet => setBalance(wallet.balance), () => setMessage('账户连接失败，提交时可重试'));
  }, [quote?.available]);
  async function generate() {
    if (busy || !currentQuote?.available) return;
    setBusy(true); setMessage('');
    try {
      const request = pending ?? { resolution: currentQuote.resolution, aspectRatio: currentQuote.aspectRatio, durationSec: currentQuote.durationSec,
        prompt, requestKey: await newRequestKey(), quoteVersion: currentQuote.version };
      const job = await submitGeneration(request);
      setPending(null);
      await Taro.navigateTo({ url: `/pages/studio-progress/index?id=${job.id}` });
    } catch (error) {
      const retained = pendingGeneration(); setPending(retained);
      setMessage(error instanceof ApiError && error.status === 402 ? '积分不足，请选择480P或补充积分后再试' : retained ? '提交结果待确认，请点击继续确认；不会重复预留积分' : '未能提交，请检查网络或重新获取报价');
    } finally { setBusy(false); }
  }
  return (
    <View className="studio-screen studio-marketing" data-testid="studio-marketing">
      <PageHeader title="营销视频创作" onBack={onBack} detail="ⓘ 使用帮助" />
      <View className="studio-form-body" style={{ pointerEvents: busy || pending ? 'none' : undefined }}>
        {currentQuote?.available && <View className="studio-preview-feedback">当前为文字生成，下面的示例图片不会作为生成素材。{balance !== null ? `账户可用 ${balance} 积分。` : ''}</View>}
        {message && <View className="studio-preview-feedback">{message}</View>}
        <View className="studio-category-tabs">
          {['剧情带货', '探店视频'].map((value) => (
            <Button
              key={value}
              className={category === value ? 'is-active' : ''}
              onClick={() => {
                setCategory(value);
              }}
            >
              {value}
            </Button>
          ))}
        </View>
        <View className="studio-field-title">
          <Text>
            商品素材 <Text className="studio-small studio-inline-note">选填</Text>
          </Text>
          <Text className="studio-small">预览素材 · 不会上传文件</Text>
        </View>
        <View className="studio-materials">
          {material && (
            <View className="studio-material">
              <Cover src={category === '剧情带货' ? art.perfume : art.cafe} />
              <Button
                className="studio-remove"
                aria-label="移除示例素材"
                onClick={() => setMaterial(false)}
              >
                ×
              </Button>
            </View>
          )}
          <Button
            className="studio-add-material"
            onClick={() => {
              setMaterial(true);
              previewNotice('已添加示例素材，未上传文件');
            }}
          >
            <Icon name="plus" />
            <Text>添加素材</Text>
          </Button>
        </View>
        <View className="studio-field-title">
          <Text>
            创意描述 <Text className="studio-red">*</Text>
          </Text>
          <Button
            className="studio-polish"
            onClick={() => {
              setPrompt(
                '清晨的微光落在香水瓶上。镜头缓缓推进，花瓣轻轻飘落。为忙碌的日常留一点浪漫，取悦自己，从此刻开始。',
              );
              previewNotice('已填入润色示例，未调用 AI');
            }}
          >
            <Icon name="edit" />
            AI 润色
          </Button>
        </View>
        <View className="studio-prompt-box">
          <Textarea
            className="studio-prompt"
            value={prompt}
            maxlength={3000}
            nativeProps={{
              style: {
                width: '100%',
                height: '86px',
                minHeight: '86px',
                padding: '0',
                font: 'inherit',
                lineHeight: '1.7',
                color: 'inherit',
                background: 'transparent',
                border: '0',
                resize: 'none',
                boxSizing: 'border-box',
              },
            }}
            onInput={(event) => {
              setPrompt(event.detail.value);
            }}
            placeholder="描述你的产品、故事或想要的画面…"
            data-testid="studio-prompt"
          />
          <Text className="studio-character-count">{prompt.length}/3000</Text>
        </View>
        <Text className="studio-field-heading">画面设置</Text>
        <View className="studio-setting">
          <Text className="studio-setting-label">清晰度</Text>
          <View className="studio-options">
            {['480p', '720p'].map((value) => (
              <Button
                key={value}
                className={`studio-option ${resolution === value ? 'is-active' : ''}`}
                onClick={() => setResolution(value)}
              >
                {value.toUpperCase()}
              </Button>
            ))}
          </View>
        </View>
        <View className="studio-setting">
          <Text className="studio-setting-label">画面比例</Text>
          <View className="studio-options">
            {['9:16', '16:9', '1:1'].map((value) => (
              <Button
                key={value}
                className={`studio-option studio-ratio ${ratio === value ? 'is-active' : ''}`}
                onClick={() => setRatio(value)}
              >
                <View
                  className={`studio-ratio-icon studio-ratio-icon--${value === '9:16' ? 'portrait' : value === '16:9' ? 'wide' : 'square'}`}
                />
                {value}
              </Button>
            ))}
          </View>
        </View>
        <View className="studio-setting">
          <Text className="studio-setting-label">视频时长</Text>
          <View className="studio-options">
            <Button
              className="studio-option studio-duration"
              onClick={() => previewNotice('当前创作流程支持5秒视频')}
            >
              5秒<Text>⌄</Text>
            </Button>
          </View>
        </View>
        <View className="studio-field-title studio-effect-label">
          <Text>效果预览</Text>
          <Text className="studio-small">示例画面 · 非实时生成</Text>
        </View>
        <Button
          className="studio-effect"
          onClick={() => previewNotice('这是效果参考图，尚未生成视频')}
        >
          <Cover src={category === '剧情带货' ? art.perfume : art.cafe} />
          <View className="studio-effect-shade" />
          <View className="studio-corners" />
          <Text className="studio-effect-copy">取悦自己{'\n'}是终身浪漫的开始</Text>
          <View className="studio-play-circle">
            <Icon name="play" />
          </View>
          <Text className="studio-watermark">2049 —</Text>
        </Button>
      </View>
      <View className="studio-bottom-action">
        <View>
          <View className="studio-price">
            {quoteError ? '报价暂不可用' : currentQuote ? <>预计消耗 <Text>{currentQuote.credits}</Text> 积分</> : '正在获取报价…'}
          </View>
          <Text className="studio-small">
            {quoteError ? '请检查连接后重试' : currentQuote?.available ? '生成前预留 · 失败退还积分' : currentQuote ? '服务端报价 · 当前未开放生成' : '以服务端返回为准'}
          </Text>
        </View>
        <Action id="studio-generate-video" disabled={busy || (!quoteError && (!currentQuote?.available || (!pending && !prompt.trim())))} onClick={() => {
          if (quoteError) setQuoteRetry(value => value + 1); else void generate();
        }}>
          {busy ? '正在提交…' : quoteError ? '重新获取报价' : pending ? '继续确认任务' : currentQuote?.available ? '生成视频' : '生成暂未开放'} <Icon name="arrow" />
        </Action>
      </View>
    </View>
  );
}
