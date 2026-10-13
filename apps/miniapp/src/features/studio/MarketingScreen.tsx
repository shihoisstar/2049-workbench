import { useEffect, useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { Button, Text, Textarea, View } from '@tarojs/components';
import type { GenerationQuote, MarketingCategoryValue, NativeMarketingQuoteValue } from '@wb/contracts';
import { MATERIAL_MAX_COUNT, ErrorBody, ErrorCode } from '@wb/contracts';
import { generationWallet, loadMarketingDrafts, materialAccess, newRequestKey, pendingGeneration, quoteGeneration, quoteNativeMarketing, saveMarketingDraft, submitGeneration, uploadMaterial } from '../../services/generation';
import type { MarketingDrafts, PendingVideoRequest } from '../../services/generation';
import { Action, Cover, Icon, PageHeader } from './shared';
import { MarketingCopyAssistant } from './MarketingCopyAssistant';
import { MarketingTimingNote } from './ProductionPlanCard';

const categories = { commerce: '剧情带货', store_visit: '探店视频' } as const;
const examples = {
  commerce: '商品是橘猫图案的帆布袋。拍一段出门前的轻松小故事，展示猫咪图案和装东西的过程。不要添加价格、优惠或未提供的产品承诺。',
  store_visit: '这是一家有木桌、绿植和窗边座位的咖啡店。用走进店内、坐在窗边的镜头呈现环境。不要添加地址、价格或虚构顾客评价。',
};

export function MarketingScreen({ onBack }: { onBack: () => void }) {
  const [category, setCategory] = useState<MarketingCategoryValue>(() => pendingGeneration()?.category ?? 'commerce');
  const [drafts, setDrafts] = useState<MarketingDrafts>({ commerce: { prompt: '', materialIds: [] }, store_visit: { prompt: '', materialIds: [] } });
  const draftsRef = useRef(drafts);
  const [draftsReady, setDraftsReady] = useState(false);
  const owner = useRef('');
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [resolution, setResolution] = useState<string>(() => pendingGeneration()?.resolution ?? '720p');
  const [ratio, setRatio] = useState<string>(() => pendingGeneration()?.aspectRatio ?? '9:16');
  const [reviewing, setReviewing] = useState(false);
  const [bottomClearance, setBottomClearance] = useState(0);
  const [more, setMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [quote, setQuote] = useState<GenerationQuote | NativeMarketingQuoteValue | null>(null);
  const [quoteKey, setQuoteKey] = useState('');
  const [quoteError, setQuoteError] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [createdJobId, setCreatedJobId] = useState('');
  const submitting = useRef(false);
  const uploadingRef = useRef(false);
  const [pending, setPending] = useState(pendingGeneration);
  const duration = pending?.durationSec ?? 10;
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [draftStatus, setDraftStatus] = useState('两种创作的草稿分别保留。');
  const prompt = pending?.prompt ?? drafts[category].prompt;
  const materials = pending?.materialIds ?? drafts[category].materialIds;
  const inputKey = JSON.stringify({ category, prompt, materials, copyJobId: drafts[category].copyJobId, duration, resolution, ratio });
  const readQuote = () => duration === 5 ? quoteGeneration({ resolution, aspectRatio: ratio, durationSec: 5 }) : quoteNativeMarketing({ category, prompt, materialIds: [...materials], ...(drafts[category].copyJobId ? { copyJobId: drafts[category].copyJobId } : {}), resolution: '720p', aspectRatio: '9:16', durationSec: 10 });
  const locked = busy || !!pending || !!createdJobId || uploading || !draftsReady;
  useEffect(() => {
    if (draftsReady) return;
    let active = true;
    void loadMarketingDrafts().then(result => {
      if (!active) return;
      owner.current = result.userId; draftsRef.current = result.drafts; setDrafts(result.drafts); setDraftsReady(true); setPending(pendingGeneration());
    }, () => { if (active) setMessage('草稿暂时无法读取，请检查连接后重试。'); });
    return () => { active = false; };
  }, [quoteRetry]);
  useEffect(() => { if (process.env.TARO_ENV === 'weapp') void Taro.setNavigationBarTitle({ title: reviewing ? '确认制作内容' : '营销视频创作' }); }, [reviewing]);
  useEffect(() => {
    let active = true;
    setQuote(null); setQuoteError(false); if (!draftsReady || !prompt.trim()) return;
    const timer = setTimeout(() => { void readQuote().then(
      result => { if (active) { setQuote(result); setQuoteKey(inputKey); } },
      error => { if (active) { setQuoteError(true); const parsed = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
        if (parsed?.success && parsed.data.code === ErrorCode.NATIVE_MATERIAL_UNSUPPORTED) setMessage('请换一张尺寸合适的素材：宽高均为300–6000像素，避免过长的横图或竖图。');
        else if (parsed?.success && parsed.data.code === ErrorCode.MATERIAL_EXPIRED) setMessage('有素材即将到期或已过期，请重新上传后获取报价。');
      } },
    ); }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [inputKey, quoteRetry, draftsReady]);
  const currentQuote = quoteKey === inputKey ? quote : null;
  const trialUnavailable = process.env.TARO_APP_MARKETING_PILOT === '1' && currentQuote?.available === false;
  useEffect(() => {
    let active = true;
    const measure = () => {
      void Taro.nextTick(() => {
        Taro.createSelectorQuery().select('.studio-mobile-page .studio-marketing .studio-bottom-action').boundingClientRect(rect => {
          if (active && rect && !Array.isArray(rect)) setBottomClearance(Math.max(0, Taro.getWindowInfo().windowHeight - rect.top) + 24);
        }).exec();
      });
    };
    measure(); Taro.onWindowResize(measure);
    return () => { active = false; Taro.offWindowResize(measure); };
  }, [reviewing, currentQuote, quoteError, pending, createdJobId, busy]);
  useEffect(() => {
    if (quote?.available) void generationWallet().then(wallet => setBalance(wallet.balance), () => setMessage('账户连接失败，请重试。'));
  }, [quote?.available]);
  const materialKey = materials.join(',');
  useEffect(() => {
    let active = true;
    for (const id of materials) {
      void materialAccess(id).then(access => {
        if (active) setPaths(current => ({ ...current, [id]: access.url }));
      }, () => { if (active) setMessage('有素材暂时无法预览，可能已到期；可移除后重新上传。'); });
    }
    return () => { active = false; };
  }, [materialKey]);

  function updateDraft(value: Partial<MarketingDrafts[MarketingCategoryValue]>) {
    const next = { ...draftsRef.current[category], ...value };
    draftsRef.current = { ...draftsRef.current, [category]: next }; setDrafts(draftsRef.current);
    try { saveMarketingDraft(owner.current, category, next); setDraftStatus('修改已保存在本机，两种创作分别保留。'); }
    catch { setDraftStatus('当前修改尚未保存，请保留本页。'); setMessage('本机草稿未能保存，请保留当前页面后重试。'); }
  }
  async function addMaterials() {
    if (locked || uploadingRef.current || materials.length >= MATERIAL_MAX_COUNT) return;
    uploadingRef.current = true; setUploading(true); setMessage('');
    try {
      const chosen = await Taro.chooseImage({ count: MATERIAL_MAX_COUNT - materials.length, sizeType: ['compressed'] }).catch(() => null);
      const ids = [...materials];
      for (const path of chosen?.tempFilePaths ?? []) {
        const material = await uploadMaterial(path); ids.push(material.id);
        setPaths(current => ({ ...current, [material.id]: path }));
        updateDraft({ materialIds: [...ids] });
      }
    } catch { setMessage('部分素材上传失败，已上传的素材保留，请重试。'); }
    finally { uploadingRef.current = false; setUploading(false); }
  }
  async function useExample() {
    if (locked) return;
    if (prompt.trim()) {
      const result = await Taro.showModal({ title: '替换为描述示例？', content: '示例只供参考，使用前请改成你的真实商品或店铺资料。' });
      if (!result.confirm) return;
    }
    updateDraft({ prompt: examples[category], copyJobId: undefined });
  }
  async function generate() {
    if (submitting.current || uploadingRef.current || (!createdJobId && !pending && (!draftsReady || !currentQuote?.available || !prompt.trim()))) return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      if (createdJobId) { await Taro.navigateTo({ url: `/pages/studio-progress/index?id=${createdJobId}` }); return; }
      let request: PendingVideoRequest | null = pending;
      if (!request) {
        const current = await readQuote(); setQuote(current); setQuoteKey(inputKey);
        if (!current.available || !current.version) { setMessage('生成暂未开放，输入已保存。'); return; }
        const result = await Taro.showModal({ title: `生成${categories[category]}？`, content: 'mode' in current && current.mode === 'mock' ? `开发模拟：使用固定样片体验字幕核对和成片，预留 ${current.credits} 测试积分，样片可预览后结算一次，不调用付费模型。` : `本次制作 1 条 ${current.durationSec} 秒、${current.resolution.toUpperCase()}、${current.aspectRatio} 视频，预留 ${current.credits} 积分。${current.durationSec === 10 ? '视频可预览后结算一次，包含原声、字幕和成片；改字幕及合成重试免费。' : '成片完成后结算。'}生成失败退还。` });
        if (!result.confirm) return;
        const common = { category, prompt, materialIds: [...materials], ...(drafts[category].copyJobId ? { copyJobId: drafts[category].copyJobId } : {}), requestKey: await newRequestKey(), quoteVersion: current.version };
        request = current.durationSec === 10 ? { ...common, resolution: '720p', aspectRatio: '9:16', durationSec: 10 } : { ...common, resolution: current.resolution, aspectRatio: current.aspectRatio, durationSec: 5 };
      }
      const job = await submitGeneration(request); setPending(null); setCreatedJobId(job.id);
      await Taro.navigateTo({ url: `/pages/studio-progress/index?id=${job.id}` }).catch(() => { setMessage('任务已受理，请点击查看制作进度。'); });
    } catch (error) {
      const retained = pendingGeneration(); setPending(retained);
      if (error instanceof ApiError && error.status === 402) setBalance(null);
      setMessage(createdJobId ? '进度页暂时无法打开，可从作品找回任务。' : error instanceof ApiError && error.status === 402 ? duration === 10 ? '积分不足，输入已保存。请返回“我的”查看可用积分。' : '积分不足，输入已保存。可选择省钱档或补充积分。' : retained ? '提交结果待确认，请继续确认；不会重复预留积分。' : '未能提交，请检查素材有效期、网络或重新获取报价。');
    } finally { submitting.current = false; setBusy(false); }
  }
  return <View className="studio-screen studio-marketing ui-v2" data-testid="studio-marketing">
    <PageHeader title={reviewing ? '确认制作内容' : '营销视频创作'} onBack={() => reviewing ? setReviewing(false) : onBack()} />
    <View id="marketing-flow" className="marketing-flow"><Text className={reviewing ? 'is-done' : 'is-current'}>{reviewing ? '✓' : '1'} 填写资料</Text><Text className={reviewing ? 'is-current' : ''}>2 核对并确认费用</Text><Text>3 制作与保存</Text></View>
    {reviewing ? <View className="studio-form-body" style={bottomClearance ? { paddingBottom: `${bottomClearance}px` } : undefined}>
      <Text className="v2-eyebrow">{categories[category]} · {duration}秒 · {resolution.toUpperCase()} · {ratio}</Text>
      <Text className="studio-field-heading">核对这次要拍的内容</Text>
      <View className="v2-marketing-review"><Text>{prompt}</Text></View>
      <View className="studio-materials">{materials.map(id => <View className="studio-material" key={id}>{paths[id] ? <Cover src={paths[id]} /> : <Text>素材预览</Text>}</View>)}</View>
      <Text className="v2-hint">请核对商品或门店资料、画面描述和口播文字。修改后会重新报价。</Text>
      {currentQuote && 'mode' in currentQuote && currentQuote.mode === 'mock' && <View className="studio-preview-feedback">开发模拟：使用固定样片体验字幕核对和成片，不调用付费模型。</View>}
      {currentQuote && 'mode' in currentQuote && currentQuote.mode !== 'disabled' && <Text id="marketing-cost-note" className="prep-note">{currentQuote.mode === 'mock' ? '固定样片可预览后结算一次测试积分，包含字幕核对和成片，不调用付费模型。' : '视频可预览后结算一次，包含10秒原声、字幕核对和成片。'}改字幕与合成重试免费；重做画面需重新确认费用。</Text>}
      {message && <View className="studio-preview-feedback">{message}</View>}
      <Button id="marketing-back-edit" className="studio-text-button" disabled={busy} onClick={() => setReviewing(false)}>返回修改</Button>
    </View> : <View className="studio-form-body" style={bottomClearance ? { paddingBottom: `${bottomClearance}px` } : undefined}>
      <Text className="v2-marketing-headline">{category === 'commerce' ? '让好商品，被看见。' : '把你的店，拍进故事里。'}</Text>
      <Text className="marketing-intro">写清真实资料和拍摄想法，下一步核对内容与费用。</Text>
      <View className="studio-category-tabs">{(Object.keys(categories) as MarketingCategoryValue[]).map(value => <Button key={value} disabled={locked} className={category === value ? 'is-active' : ''} onClick={() => { setCategory(value); setMessage(''); }}>{categories[value]}</Button>)}</View>
      {message && <View className="studio-preview-feedback">{message}</View>}
      {!draftsReady && message && <Button id="marketing-retry-draft" className="studio-text-button" onClick={() => { setMessage(''); setQuoteRetry(value => value + 1); }}>重新读取草稿</Button>}
      {pending && <View className="studio-preview-feedback">有一笔提交结果待确认，继续时将核对原任务及原报价。</View>}
      <View className="studio-field-title"><Text>{category === 'commerce' ? '商品与创意描述' : '店铺与拍摄想法'} <Text className="studio-red">*</Text></Text><Button className="studio-polish" disabled={locked} onClick={() => { void useExample(); }}>看看示例</Button></View>
      <View className="studio-prompt-box"><Textarea className="studio-prompt" aria-label={category === 'commerce' ? '商品与创意描述，必填' : '店铺与拍摄想法，必填'} value={prompt} disabled={locked} maxlength={3000} onInput={event => updateDraft({ prompt: event.detail.value })} placeholder={category === 'commerce' ? '商品是什么？有哪些真实卖点？想拍什么故事？' : '店里有什么特色？有哪些实拍素材？想呈现什么氛围？'} data-testid="studio-prompt" /><Text className="studio-character-count">{prompt.length}/3000</Text></View>
      <Text className="v2-hint">价格、优惠、地址和产品承诺，请以你的真实资料为准。</Text>
      <View className="studio-field-title"><Text>{category === 'commerce' ? '商品参考图' : '店铺参考图'} <Text className="studio-small studio-inline-note">选填</Text></Text><Text className="studio-small">最多{MATERIAL_MAX_COUNT}张 · 7天内有效</Text></View>
      <View className="studio-materials">
        {materials.map(id => <View key={id} className="studio-material">{paths[id] ? <Cover src={paths[id]} /> : <Text className="studio-small">素材预览</Text>}<Button className="studio-remove" disabled={locked} aria-label="移除素材" onClick={() => updateDraft({ materialIds: materials.filter(item => item !== id) })}>×</Button></View>)}
        {materials.length < MATERIAL_MAX_COUNT && <Button className="studio-add-material" disabled={locked} onClick={() => { void addMaterials(); }}><Icon name="plus" /><Text>{uploading ? '上传中…' : '添加素材'}</Text></Button>}
      </View>
      {drafts[category].copyJobId && <Text id="marketing-current-copy" className="v2-hint">当前制作稿以上方输入框为准，可继续编辑；确认页和视频制作使用这份稿件。</Text>}
      <MarketingCopyAssistant category={category} durationSec={duration} sourceText={prompt} adoptedJobId={drafts[category].copyJobId} disabled={locked} onAdopt={(jobId, text) => updateDraft({ prompt: text, copyJobId: jobId })} onReset={text => updateDraft({ prompt: text, copyJobId: undefined })} />
      <MarketingTimingNote category={category} text={prompt} visible={draftsReady} durationSec={duration} />
      {duration === 10 ? <View className="v2-marketing-settings"><Text>720P · 9:16 · 10秒</Text><Text>标准短片</Text></View> : <Button className="v2-marketing-settings" disabled={locked} onClick={() => setMore(value => !value)}><Text>{resolution.toUpperCase()} · {ratio} · {duration}秒</Text><Text>{more ? '收起设置' : '更多设置'} {more ? '−' : '+'}</Text></Button>}
      {more && duration === 5 && <View className="v2-marketing-more">
        <View className="studio-setting"><Text className="studio-setting-label">清晰度</Text><View className="studio-options">{['480p', '720p'].map(value => <Button key={value} disabled={locked} className={`studio-option ${resolution === value ? 'is-active' : ''}`} onClick={() => setResolution(value)}>{value === '480p' ? '480P · 省钱' : '720P · 高清'}</Button>)}</View></View>
        <View className="studio-setting"><Text className="studio-setting-label">画面比例</Text><View className="studio-options">{['9:16', '16:9', '1:1'].map(value => <Button key={value} disabled={locked} className={`studio-option ${ratio === value ? 'is-active' : ''}`} onClick={() => setRatio(value)}>{value}</Button>)}</View></View>
      </View>}
      <Text id="marketing-draft-state" className="v2-hint">{draftsReady ? draftStatus : message ? '草稿尚未读取，请重新读取。' : '正在读取本机草稿…'}</Text>
    </View>}
    <View className="studio-bottom-action">
      <View className="marketing-action-summary"><View className="studio-price">{!draftsReady ? message ? '草稿暂不可用' : '正在读取草稿…' : pending ? '核对原任务' : createdJobId ? '任务已受理' : !prompt.trim() ? '先填写创作内容' : quoteError ? '报价暂不可用' : currentQuote?.credits === null ? trialUnavailable ? '试用额度暂不可用' : '生成暂未开放' : currentQuote ? <>预计 <Text>{currentQuote.credits}</Text> 积分</> : '正在获取报价…'}</View><Text className="studio-small">{pending || createdJobId ? '继续原任务' : !reviewing ? '下一步不扣积分' : currentQuote?.available ? `确认后制作${balance !== null ? ` · 可用 ${balance}` : ''}` : trialUnavailable ? '已有作品仍可保存' : '当前输入已保留'}</Text></View>
      <Action id="studio-generate-video" disabled={busy || uploading || (!createdJobId && !pending && (!draftsReady || !prompt.trim() || reviewing && !quoteError && !trialUnavailable && !currentQuote?.available))} onClick={() => { if (!pending && !createdJobId && !reviewing) setReviewing(true); else if ((quoteError || trialUnavailable) && !pending && !createdJobId) setQuoteRetry(value => value + 1); else void generate(); }}>{busy ? '正在确认…' : createdJobId ? '查看制作进度' : pending ? '继续确认任务' : !reviewing ? '下一步 · 确认内容' : quoteError ? '重新获取报价' : trialUnavailable ? '刷新试用额度' : !currentQuote ? '正在获取报价…' : currentQuote.available ? '确认并开始制作' : '生成暂未开放'} <Icon name="arrow" /></Action>
    </View>
  </View>;
}
