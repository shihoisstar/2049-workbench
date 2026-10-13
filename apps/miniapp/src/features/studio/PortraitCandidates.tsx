import { useEffect, useRef, useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PortraitJobViewValue, PortraitQuoteValue } from '@wb/contracts';
import { ApiError } from '@wb/api-client';
import { listPortraits, materialAccess, pendingPortrait, quotePortrait, submitPortrait } from '../../services/generation';

export function PortraitCandidates(props: { projectId: string; roleKey: string; revision: number; disabled: boolean; visible: boolean; onSelect: (id: string) => Promise<void> }) {
  const [jobs, setJobs] = useState<PortraitJobViewValue[]>([]); const [quote, setQuote] = useState<PortraitQuoteValue | null>(null);
  const [cursor, setCursor] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [previews, setPreviews] = useState<Record<string, string>>({}); const loaded = useRef(new Set<string>());
  const previewExpires = useRef<Record<string, number>>({});
  const operation = useRef(false); const current = useRef(props); current.current = props;
  async function load(more = false) {
    try {
      const page = await listPortraits(props.projectId, props.roleKey, more ? cursor ?? undefined : undefined);
      setJobs(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items); setCursor(page.nextCursor);
      for (const job of page.items) if (job.materialId) {
        const materialId = job.materialId;
        if (previewExpires.current[materialId] <= Date.now() + 30000) loaded.current.delete(materialId);
        if (loaded.current.has(materialId)) continue;
        loaded.current.add(materialId);
        void materialAccess(materialId).then(access => {
          previewExpires.current[materialId] = Date.parse(access.urlExpiresAt);
          setPreviews(old => ({ ...old, [job.id]: access.url }));
        }, () => { loaded.current.delete(materialId); setMessage('部分候选图片暂时无法显示，请刷新重试。'); });
      }
    } catch { setMessage('候选暂时无法读取，请稍后刷新。'); }
  }
  useEffect(() => {
    if (!props.visible) return;
    void load();
    if (props.revision > 0 && !props.disabled) void quotePortrait(props.projectId, props.roleKey, props.revision).then(setQuote, () => setQuote(null));
    // Reload on saved preparation changes; local edits never trigger generation.
  }, [props.projectId, props.roleKey, props.revision, props.visible, props.disabled]);
  useEffect(() => {
    if (!props.visible || !jobs.some(job => job.status === 'accepted')) return;
    const timer = setInterval(() => { void load(); }, 5000); return () => clearInterval(timer);
  }, [props.visible, jobs.some(job => job.status === 'accepted')]);
  async function generate() {
    if (operation.current || current.current.disabled) return;
    operation.current = true; setBusy(true); setMessage('');
    try {
      const pending = pendingPortrait(props.projectId, props.roleKey);
      const price = pending ? null : await quotePortrait(props.projectId, props.roleKey, props.revision);
      if (current.current.disabled) { setMessage('准备内容有修改，请先保存。'); return; }
      if (!pending) {
        setQuote(price);
        if (!price || price.mode === 'disabled' || !price.version) { setMessage('AI形象生成暂未开放，可先选择自己的参考图。'); return; }
        const consent = await Taro.showModal({ title: price.mode === 'mock' ? '开发模拟候选' : '生成一张角色候选？', content: price.mode === 'mock'
          ? `开发模拟将预留 ${price.credits} 测试积分，生成占位图用于验证流程，不调用真实AI。`
          : `本次预留 ${price.credits} 积分，生成一张形象候选。成功后结算，技术失败退还；结果未知时保留任务核对。生成后由你选择是否采用。` });
        if (!consent.confirm || current.current.disabled) return;
      }
      await submitPortrait(props.projectId, pending ?? { roleKey: props.roleKey, preparationRevision: props.revision, quoteVersion: price!.version! });
      setMessage('任务已受理，离开页面后也可回来查看。'); await load();
    } catch (error) { setMessage(error instanceof ApiError && error.status === 402 ? '积分不足，任务没有创建。' : '暂未确认结果，请刷新；继续提交会沿用原请求。'); }
    finally { operation.current = false; setBusy(false); }
  }
  const pending = !!pendingPortrait(props.projectId, props.roleKey);
  return <View className="portrait-candidates">
    <View className="prep-section-heading"><Text className="studio-field-heading">AI 形象候选</Text><Button className="studio-text-button" disabled={busy} onClick={() => { void load(); }}>刷新</Button></View>
    <Text className="prep-note">{props.disabled ? '先保存准备内容，再生成候选。' : quote?.mode === 'disabled' ? 'AI形象生成暂未开放，已生成候选仍可查看。' : quote?.credits ? `单张 ${quote.credits} 积分 · 生成后由你选择` : '生成前获取报价并确认。'}</Text>
    {jobs.map(job => <View className="portrait-candidate" key={job.id}>
      {previews[job.id] && <Image className="prep-reference-image" mode="aspectFit" src={previews[job.id]} onClick={() => { if (job.materialId) void materialAccess(job.materialId).then(access => Taro.previewImage({ urls: [access.url], current: access.url }), () => setMessage('图片暂时无法预览，请刷新重试。')); }} onError={() => { if (job.materialId) loaded.current.delete(job.materialId); setPreviews(old => ({ ...old, [job.id]: '' })); setMessage('图片暂时无法显示，请刷新重试。'); }} />}
      <Text>{job.provider === 'mock' ? '开发模拟 · ' : ''}{job.status === 'accepted' ? job.submissionStatus === 'unknown' ? '结果待核对，请勿重复生成' : '正在生成…' : job.status === 'failed' ? '本次失败，预留积分已退还' : job.expiresAt && Date.parse(job.expiresAt) <= Date.now() ? '候选已过期' : '候选已生成'}</Text>
      {!job.current && <Text className="prep-note">角色描述或画风已变化，这张候选不能直接用于当前准备。</Text>}
      {job.status === 'succeeded' && <Button disabled={props.disabled || busy || !job.current || !job.materialId || !previews[job.id] || !!job.expiresAt && Date.parse(job.expiresAt) <= Date.now()} onClick={() => { void props.onSelect(job.id); }}>选择这张参考图</Button>}
    </View>)}
    {cursor && <Button className="studio-text-button" onClick={() => { void load(true); }}>查看更多候选</Button>}
    {message && <Text className="prep-note">{message}</Text>}
    <Button className="prep-add" disabled={props.disabled || busy || jobs.some(job => job.status === 'accepted') || (!pending && quote?.mode === 'disabled')} onClick={() => { void generate(); }}>{busy ? '正在提交…' : pending ? '继续确认提交' : '生成一张候选'}</Button>
  </View>;
}
