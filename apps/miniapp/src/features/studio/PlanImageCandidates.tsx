import { useEffect, useRef, useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { ErrorBody, ErrorCode } from '@wb/contracts';
import type { PlanImageValue, PlanImageQuoteValue, DramaImageAccessValue } from '@wb/contracts';
import { dramaImageMedia, listPlanImages, pendingPlanImage, quotePlanImage, selectPlanImage, submitPlanImage } from '../../services/generation';
import { PlanVideo } from './PlanVideo';
export function PlanImageCandidates(props: { planId: string; shotKey: string; revision: number; disabled: boolean; reviewed: boolean; visible: boolean }) {
  const [items, setItems] = useState<PlanImageValue[]>([]); const [quote, setQuote] = useState<PlanImageQuoteValue | null>(null);
  const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [previews, setPreviews] = useState<Record<string, DramaImageAccessValue>>({}); const cache = useRef<Record<string, DramaImageAccessValue>>({}); const fetching = useRef(new Set<string>());
  const operation = useRef(false); const current = useRef(props); current.current = props;
  async function load(more = false) {
    try {
      const page = await listPlanImages(props.planId, props.shotKey, more ? cursor ?? undefined : undefined); setCursor(page.nextCursor);
      setItems(old => more ? [...old, ...page.items.filter(item => !old.some(previous => previous.candidateId === item.candidateId))] : page.items);
      for (const item of page.items) if (item.status === 'succeeded' && item.expiresAt && Date.parse(item.expiresAt) > Date.now() && !fetching.current.has(item.jobId) && (!cache.current[item.jobId] || Date.parse(cache.current[item.jobId].urlExpiresAt) <= Date.now() + 30000)) {
        fetching.current.add(item.jobId);
        void dramaImageMedia(item.jobId).then(access => { cache.current[item.jobId] = access; setPreviews(old => ({ ...old, [item.jobId]: access })); }, () => setMessage('部分候选预览暂不可用，请刷新重试。')).finally(() => fetching.current.delete(item.jobId));
      }
    } catch { setMessage('画面候选暂时无法读取，请刷新。'); }
  }
  useEffect(() => {
    if (!props.visible) return;
    void load();
    if (props.reviewed && !props.disabled) void quotePlanImage(props.planId, props.shotKey, props.revision).then(setQuote, error => {
      setQuote(null); const detail = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null; if (detail?.success) setMessage(detail.data.message);
    });
  }, [props.planId, props.shotKey, props.revision, props.disabled, props.reviewed, props.visible]);
  useEffect(() => {
    if (!props.visible || !items.some(item => item.status === 'accepted')) return;
    const timer = setInterval(() => { void load(); }, 5000); return () => clearInterval(timer);
  }, [props.visible, items.some(item => item.status === 'accepted')]);
  async function generate() {
    if (operation.current || current.current.disabled || !current.current.reviewed) return;
    operation.current = true; setBusy(true); setMessage('');
    try {
      const pending = pendingPlanImage(props.planId, props.shotKey);
      const price = pending ? null : await quotePlanImage(props.planId, props.shotKey, props.revision);
      if (!pending) {
        setQuote(price);
        if (!price?.version || price.mode !== 'mock') { setMessage('分镜图片生成暂未开放，草稿已保留。'); return; }
        const decision = await Taro.showModal({ title: '生成一张模拟画面？', content: `本次预留 ${price.credits} 测试积分，生成占位图验证流程，不调用真实AI。成功结算，技术失败退还。不会自动替换已选图片。` });
        if (!decision.confirm) return;
      }
      if (current.current.disabled || !current.current.reviewed) { setMessage('镜头有修改，请先保存并核对。'); return; }
      await submitPlanImage(props.planId, pending ?? { shotKey: props.shotKey, planRevision: props.revision, quoteVersion: price!.version! });
      setMessage('任务已保存，可离开后回来查看。'); await load();
    } catch (error) {
      const detail = error instanceof ApiError ? ErrorBody.safeParse(error.body) : null;
      setMessage(error instanceof ApiError && error.status === 402 ? '测试积分不足，本次未创建新候选。'
        : detail?.success && detail.data.code === ErrorCode.GENERATION_UNAVAILABLE ? '图片生成暂未开放，本次未创建新候选。'
          : error instanceof ApiError && detail?.success && [400, 403, 404, 409].includes(error.status) ? '镜头或报价状态已变化，本次未受理。请刷新并核对后再提交。'
            : '提交结果暂未确认，请刷新；再次提交沿用原请求。');
    }
    finally { operation.current = false; setBusy(false); }
  }
  async function choose(item: PlanImageValue) {
    if (operation.current || current.current.disabled || !current.current.reviewed) return;
    operation.current = true; setBusy(true);
    try { await selectPlanImage(item.candidateId, props.revision); await load(); setMessage('已选定这一镜的图片，其他候选仍保留。'); }
    catch { setMessage('图片或镜头状态已变化，请刷新后重新选择。'); }
    finally { operation.current = false; setBusy(false); }
  }
  if (!props.reviewed && !items.length && !message) return null;
  const pending = !!pendingPlanImage(props.planId, props.shotKey);
  return <View className="plan-images">
    <View className="prep-section-heading"><Text className="studio-field-heading">画面候选</Text><Button className="studio-text-button plan-image-refresh" disabled={busy} onClick={() => { void load(); }}>刷新</Button></View>
    <Text className="prep-note">{props.disabled || !props.reviewed ? '请先保存并核对镜头，原有图片保留。' : quote?.mode === 'mock' ? `开发模拟 · 单张 ${quote.credits} 测试积分` : quote?.mode === 'disabled' ? '真实画面生成暂未开放。' : '生成前获取报价并确认。'}</Text>
    {items.map(item => <View className="portrait-candidate plan-image-item" key={item.candidateId}>
      <Text className="studio-small">开发模拟{item.selectedAt ? item.current ? ' · 已选定' : ' · 曾选定' : ''}</Text>
      {previews[item.jobId] && <Image className="prep-reference-image" src={previews[item.jobId].url} mode="aspectFit" onClick={() => { void dramaImageMedia(item.jobId).then(access => Taro.previewImage({ current: access.url, urls: [access.url] }), () => setMessage('图片暂时无法预览，请刷新重试。')); }} onError={() => { delete cache.current[item.jobId]; setPreviews(old => { const next = { ...old }; delete next[item.jobId]; return next; }); setMessage('图片未能显示，请刷新。'); }} />}
      <Text>{item.status === 'accepted' ? '正在生成…' : item.status === 'failed' ? '生成失败，预留测试积分已退还' : item.expiresAt && Date.parse(item.expiresAt) <= Date.now() ? '图片已过期' : '候选已生成'}</Text>
      {!item.current && <Text className="prep-note">镜头内容或角色已变化，请使用新内容的候选。</Text>}
      {item.status === 'succeeded' && <Button className="plan-image-select" disabled={props.disabled || busy || !item.current || !previews[item.jobId] || !!item.expiresAt && Date.parse(item.expiresAt) <= Date.now()} onClick={() => { void choose(item); }}>{item.selectedAt ? '已选定此图' : '选用这张图片'}</Button>}
      {item.selectedAt && <PlanVideo candidateId={item.candidateId} revision={props.revision} disabled={props.disabled || busy || !item.current} visible={props.visible} />}
    </View>)}
    {cursor && <Button className="studio-text-button" disabled={busy} onClick={() => { void load(true); }}>查看更多候选</Button>}
    {message && <Text className="prep-note">{message}</Text>}
    <Button className="prep-add plan-image-generate" disabled={props.disabled || !props.reviewed || busy || items.some(item => item.status === 'accepted') || !pending && quote?.mode === 'disabled'} onClick={() => { void generate(); }}>{busy ? '正在处理…' : pending ? '继续确认提交' : '生成一张候选'}</Button>
  </View>;
}
