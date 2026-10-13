import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import type { MarketingCategoryValue, MarketingCopyJobValue, MarketingCopyQuoteValue, SubmitMarketingCopyValue } from '@wb/contracts';
import { getMarketingCopy, latestMarketingCopy, newRequestKey, pendingMarketingCopy, quoteMarketingCopy, submitMarketingCopy } from '../../services/generation';

export function MarketingCopyAssistant({ category, sourceText, adoptedJobId, disabled, onAdopt, onReset, durationSec = 5 }: {
  category: MarketingCategoryValue; durationSec?: 5 | 10; sourceText: string; adoptedJobId?: string; disabled: boolean;
  onAdopt: (jobId: string, text: string) => void; onReset: (text: string) => void;
}) {
  const [job, setJob] = useState<MarketingCopyJobValue | null>(null);
  const [source, setSource] = useState(sourceText);
  const [quote, setQuote] = useState<MarketingCopyQuoteValue | null>(null);
  const [pending, setPending] = useState<SubmitMarketingCopyValue | null>(null);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const requesting = useRef(false);
  const generation = useRef(0);
  async function refresh() {
    const epoch = generation.current;
    try {
      const adopted = adoptedJobId ? await getMarketingCopy(adoptedJobId) : null;
      const original = adopted?.sourceText ?? sourceText;
      const current = await latestMarketingCopy(category); const request = await pendingMarketingCopy(category);
      const offer = original.trim().length >= 2 && current?.status !== 'accepted' ? await quoteMarketingCopy({ category, durationSec, text: original }) : null;
      if (epoch !== generation.current) return;
      setSource(original); setJob(current ?? adopted); setPending(request); setQuote(offer);
    } catch { if (epoch === generation.current) setMessage('文案状态暂时无法读取，已有输入保留。'); }
  }
  useEffect(() => {
    setJob(null); setShowOriginal(false);
  }, [category, durationSec]);
  useEffect(() => {
    generation.current++; setQuote(null); setPending(null); setSource(sourceText); setMessage('');
    const timer = setTimeout(() => { void refresh(); }, 350);
    return () => { clearTimeout(timer); generation.current++; };
  }, [category, sourceText, adoptedJobId, durationSec]);
  useDidShow(() => { setVisible(true); void refresh(); }); useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible || job?.status !== 'accepted') return;
    const timer = setInterval(() => { void refresh(); }, 2500); return () => clearInterval(timer);
  }, [visible, job?.status]);
  async function generate() {
    if (requesting.current || disabled || job?.status === 'accepted') return;
    generation.current++;
    requesting.current = true; setBusy(true); setMessage('');
    try {
      let request = await pendingMarketingCopy(category);
      if (!request) {
        const current = await quoteMarketingCopy({ category, durationSec, text: source }); setQuote(current);
        if (current.mode === 'disabled' || !current.version) { setMessage('文案助手暂未开放，可以使用自己的描述制作视频。'); return; }
        const confirmed = await Taro.showModal({ title: '帮你写一版文案？', content: current.mode === 'mock' ? '开发模拟建议，不调用真实AI、不扣积分；只用于检查操作流程。' : `本次文案预留 ${current.credits} 积分，不包含视频费用。成功后结算，失败退还。原资料保留，建议由你确认后采用。` });
        if (!confirmed.confirm) return;
        request = { category, durationSec, text: source, quoteVersion: current.version, requestKey: await newRequestKey() };
      }
      setJob(await submitMarketingCopy(request)); setPending(null);
    } catch { setPending(await pendingMarketingCopy(category)); setMessage('未能确认本次结果，请刷新核对原任务。'); }
    finally { requesting.current = false; setBusy(false); void refresh(); }
  }
  const current = !!job && job.category === category && job.sourceText === source && (job.durationSec ?? 5) === durationSec;
  const adopted = !!job && adoptedJobId === job.id;
  const edited = adopted && sourceText !== job?.result?.text;
  return <View className="marketing-copy-assistant">
    <View className="studio-field-title"><Text>文案助手 <Text className="studio-small">选用</Text></Text>
      <Button className="studio-text-button copy-generate" disabled={disabled || busy || job?.status === 'accepted' || (!pending && (!quote || quote.mode === 'disabled'))} onClick={() => { void generate(); }}>{busy ? '正在确认…' : job?.status === 'accepted' ? job.submissionStatus === 'unknown' ? '结果核对中' : '文案制作中…' : pending ? '核对原任务' : '帮我写文案'}</Button>
    </View>
    {quote && <Text className="studio-small">{quote.mode === 'disabled' ? '可先使用自己的描述制作视频。' : quote.mode === 'mock' ? '开发模拟 · 不扣积分' : `文案 ${quote.credits} 积分 · 视频另行报价`}</Text>}
    {job?.status === 'failed' && <Text className="studio-small">这次文案未完成，资料保留{job.billingStatus === 'refunded' ? `，已退还 ${job.reservedCredits} 积分` : ''}。可以重新确认后再试。</Text>}
    {job?.result && <View className="copy-result"><Text>{adopted ? '这版文案已采用' : job.provider === 'mock' ? '开发模拟原始建议（只读）' : 'AI 原始建议（只读）'}</Text>
      {(!adopted || showOriginal) && <Text className="copy-result-text">{job.result.text}</Text>}
      <Text id="copy-adoption-state" className="studio-small">{adopted ? edited ? '已采用后修改 · 当前制作稿以上方输入框为准，原始建议保留供对照。' : '已采用 · 当前制作稿与这份原始建议一致，可在上方编辑。' : current ? '尚未采用 · 采用前请核对商品或店铺信息。' : '这版对应之前的资料，当前输入已变化。'}</Text>
      {adopted ? <Button id="copy-toggle-original" className="studio-text-button" onClick={() => setShowOriginal(value => !value)}>{showOriginal ? '收起原始建议' : '查看原始建议作对照'}</Button> : <Button className="studio-text-button copy-adopt" disabled={disabled || busy || !current} onClick={() => onAdopt(job.id, job.result!.text)}>采用这版文案</Button>}
    </View>}
    {adoptedJobId && <Button className="studio-text-button" disabled={disabled || busy} onClick={() => { void Taro.showModal({ title: '恢复原资料？', content: '将替换上方的当前制作稿，请先保留你需要的修改。' }).then(result => { if (result.confirm) onReset(source); }); }}>恢复原资料</Button>}
    {message && <Text className="studio-small">{message}</Text>}
    <Button className="studio-text-button copy-refresh" disabled={busy} onClick={() => { void refresh(); }}>刷新文案状态</Button>
  </View>;
}
