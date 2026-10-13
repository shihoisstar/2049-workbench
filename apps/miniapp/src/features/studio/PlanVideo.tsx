import { useEffect, useRef, useState } from 'react';
import { Button, Text, Video, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { DramaShotVideoJobViewValue } from '@wb/contracts';
import { dramaShotVideoMedia, latestPlanVideo, pendingPlanVideo, quotePlanVideo, submitPlanVideo } from '../../services/generation';
export function PlanVideo(props: { candidateId: string; revision: number; disabled: boolean; visible: boolean }) {
  const [job, setJob] = useState<DramaShotVideoJobViewValue | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [url, setUrl] = useState('');
  const operation = useRef(false); const current = useRef(props); current.current = props;
  const [pending, setPending] = useState(false);
  async function load() { try { setJob(await latestPlanVideo(props.candidateId)); setPending(!!await pendingPlanVideo(props.candidateId)); } catch { setMessage('视频进度暂不可用，请刷新。'); } }
  useEffect(() => { if (props.visible) void load(); }, [props.candidateId, props.visible]);
  useEffect(() => { if (!props.visible || job?.status !== 'accepted') return; const timer = setInterval(() => { void load(); }, 5000); return () => clearInterval(timer); }, [props.visible, job?.status]);
  async function generate() {
    if (operation.current || current.current.disabled) return; operation.current = true; setBusy(true);
    try {
      const pending = await pendingPlanVideo(props.candidateId); const quote = pending ? null : await quotePlanVideo(props.candidateId, props.revision);
      if (!pending && (!quote?.version || quote.mode !== 'mock')) { setMessage('真实逐镜视频尚未开放。'); return; }
      if (!pending && !(await Taro.showModal({ title: '制作模拟镜头？', content: `预留 ${quote!.credits} 测试积分，生成5秒占位视频，不调用真实AI，不代表正式画面。技术失败退还。` })).confirm) return;
      if (current.current.disabled) return;
      setJob(await submitPlanVideo(props.candidateId, pending ?? { planRevision: props.revision, quoteVersion: quote!.version! })); setMessage('任务已保存，可离开后回来查看。');
    } catch { setMessage('提交结果暂未确认；再次提交会沿用原请求。'); }
    finally { operation.current = false; setBusy(false); }
  }
  return <View className="plan-video"><Text className="prep-note">开发模拟视频 · 真正的画面与配音仍待接入</Text>
    {job && <Text className="prep-note">{job.status === 'accepted' ? '镜头制作中…' : job.status === 'succeeded' ? '模拟镜头已完成' : '制作失败，测试积分已退还'}</Text>}
    {url && <Video src={url} controls />}
    {job?.status === 'succeeded' && <Button className="plan-video-preview" disabled={busy} onClick={() => { void dramaShotVideoMedia(job.id).then(media => setUrl(media.url), () => setMessage('预览暂不可用，请刷新重试。')); }}>预览模拟镜头</Button>}
    <Button className="plan-video-generate" disabled={props.disabled || busy || job?.status === 'accepted' && !pending} onClick={() => { void generate(); }}>{busy ? '处理中…' : pending ? '继续确认原提交' : job ? '重做此镜头' : '制作模拟镜头'}</Button>
    {message && <Text className="prep-note">{message}</Text>}
    <Button className="studio-text-button" disabled={busy} onClick={() => { void load(); }}>刷新视频进度</Button>
  </View>;
}
