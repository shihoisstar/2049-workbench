import type { GenerationView, NativeCaptionReviewValue, WalletEntry } from '@wb/contracts';

export function marketingTaskState(job: GenerationView | null, review?: NativeCaptionReviewValue | null) {
  if (!job) return { step: 0, title: '正在读取制作进度', label: '读取中', action: '查看进度' };
  if (job.status === 'failed') return { step: 0, title: '本次制作未完成', label: '未完成', action: '查看原因' };
  if (job.status === 'succeeded') return { step: 3, title: '你的成片已就绪', label: '已完成', action: '播放与保存' };
  if (job.durationSec !== 10 || job.actualCredits === null) return { step: 0, title: '正在生成视频', label: '视频制作中', action: '查看进度' };
  if (review?.issue) return { step: review.state === 'ready' ? 2 : 1, title: '原视频已保留，可以继续处理', label: '需要继续处理', action: '继续处理' };
  if (review?.state === 'review') return { step: 1, title: '视频已生成，请核对字幕', label: '待核对字幕', action: '核对字幕' };
  if (review?.state === 'ready') return { step: 2, title: '字幕已确认，正在完成成片', label: '成片处理中', action: '查看进度' };
  return { step: 1, title: '视频已生成，正在准备字幕', label: '字幕准备中', action: '查看进度' };
}

export function marketingWorkTitle(prompt: string) {
  return prompt.split(/\r?\n/).map(line => line.trim()).find(Boolean)?.replace(/^(口播|画面|商品|店铺)\s*[:：]\s*/, '').slice(0, 80) || '营销视频';
}

export function studioDate(iso: string) {
  const date = new Date(iso); const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function walletEntryAmount(entry: WalletEntry) {
  if (entry.type === 'settle' && entry.amount === 0) return '已结算';
  return `${entry.amount > 0 ? '+' : ''}${entry.amount}`;
}
