import { useEffect, useRef, useState } from 'react';
import { Button, Text, Video, View } from '@tarojs/components';
import type { DramaExportJobViewValue } from '@wb/contracts';
import { createPlanExport, dramaExportMedia, listPlanExports } from '../../services/generation';
import { downloadOrSaveVideo } from '../../services/api';
export function PlanExports(props: { projectId: string; planId: string; revision: number; episodes: number[]; disabled: boolean; visible: boolean }) {
  const [jobs, setJobs] = useState<DramaExportJobViewValue[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [url, setUrl] = useState(''); const operation = useRef(false);
  async function load() { try { setJobs(await listPlanExports(props.planId)); } catch { setMessage('导出记录暂不可用，请刷新。'); } }
  useEffect(() => { if (props.visible) void load(); }, [props.planId, props.visible]);
  useEffect(() => { if (!props.visible || !jobs.some(job => job.status === 'accepted')) return; const timer = setInterval(() => { void load(); }, 5000); return () => clearInterval(timer); }, [props.visible, jobs.some(job => job.status === 'accepted')]);
  async function exportEpisode(number: number) {
    if (operation.current || props.disabled) return; operation.current = true; setBusy(true);
    try { await createPlanExport(props.projectId, props.planId, props.revision, number); await load(); setMessage('本集导出任务已保存，其他集分别保留。'); }
    catch { setMessage('导出结果暂未确认，或本集仍有镜头未完成。请刷新；再次导出沿用原请求。'); }
    finally { operation.current = false; setBusy(false); }
  }
  return <View className="prep-card plan-exports"><Text className="studio-field-heading">逐集预览</Text><Text className="prep-note">每集单独导出。当前为静音开发预览，字幕来自剧本，尚未验证配音同步和正式成片质量。</Text>
    <Text className="prep-note">修改前的预览会保留；改动后请重新导出本集。</Text>
    {props.episodes.map(number => { const job = jobs.find(item => item.episodeNumber === number); return <View key={number}><Text>第 {number} 集 · {job?.status === 'succeeded' ? '预览已完成' : job?.status === 'accepted' ? '合成中' : job?.status === 'failed' ? '合成失败' : '待导出'}</Text>
      <Button className="plan-export-generate" disabled={busy || props.disabled || job?.status === 'accepted'} onClick={() => { void exportEpisode(number); }}>{job ? '重新导出本集预览' : '导出本集预览'}</Button>
      {job?.status === 'succeeded' && <><Button className="plan-export-play" disabled={busy} onClick={() => { void dramaExportMedia(job.id).then(media => setUrl(media.url), () => setMessage('预览暂不可用或已到期。')); }}>播放第 {number} 集预览</Button><Button className="plan-export-save" disabled={busy} onClick={() => { setBusy(true); void dramaExportMedia(job.id).then(media => downloadOrSaveVideo(media.url)).then(result => setMessage(result === 'saved' ? '本集预览已保存相册。' : '已打开本集预览。'), () => setMessage('保存未完成；请检查相册权限或稍后重试。')).finally(() => setBusy(false)); }}>保存第 {number} 集预览</Button></>}
    </View>; })}
    {url && <Video src={url} controls />}{message && <Text className="prep-note">{message}</Text>}<Button className="studio-text-button" disabled={busy} onClick={() => { void load(); }}>刷新导出记录</Button>
  </View>;
}
