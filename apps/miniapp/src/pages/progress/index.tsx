import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { Video } from '@tarojs/components';

import type { GenerationTask } from '@wb/contracts';

import { cancelTask, createTask, ensureSession, getTask } from '../../services/api';

import './index.scss';

const STEPS: Array<{ key: string; label: string; states: string[] }> = [
  { key: 'queued', label: '排队中', states: ['queued'] },
  { key: 'running', label: '生成中', states: ['running'] },
  { key: 'done', label: '完成', states: ['succeeded'] },
];

const STATUS_TEXT: Record<string, string> = {
  created: '提交中…',
  queued: '排队中,前面还有一点小任务',
  running: 'AI 正在生成你的视频…',
  succeeded: '生成完成',
  failed: '生成失败',
  canceled: '已取消',
};

const POLL_INTERVAL_MS = 2000;

/** 生成进度页(T2.3):状态机可视化 + 失败即时退提示 + 成片预览。V0 轮询,SSE/WS 随后续评估。 */
export default function Progress() {
  const router = useRouter();
  const taskId = router.params.taskId ?? '';
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const t = await getTask(taskId);
      setTask(t);
      if (t.status === 'succeeded' || t.status === 'failed' || t.status === 'canceled') stop();
    } catch (e) {
      setError((e as Error).message);
      stop();
    }
  }, [taskId, stop]);

  useEffect(() => {
    if (!taskId) return;
    void ensureSession();
    void refresh();
    timerRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return stop;
  }, [taskId, refresh, stop]);

  const onCancel = useCallback(async () => {
    if (!taskId) return;
    try {
      const t = await cancelTask(taskId);
      setTask(t);
      Taro.showToast({ title: '已取消,积分已退回', icon: 'none' });
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '取消失败', icon: 'none' });
    }
  }, [taskId]);

  const activeStep = task
    ? STEPS.findIndex((s) => s.states.includes(task.status === 'created' ? 'queued' : task.status))
    : -1;
  const isTerminal = task && ['succeeded', 'failed', 'canceled'].includes(task.status);
  const canCancel = task && ['queued', 'running'].includes(task.status);

  if (!taskId) {
    return (
      <View className="progress-page">
        <Text className="progress-error-text">缺少任务 ID</Text>
      </View>
    );
  }

  return (
    <View className="progress-page">
      <View className="progress-card">
        <Text className="progress-title">{task ? STATUS_TEXT[task.status] : '加载中…'}</Text>

        {!isTerminal && (
          <View className="progress-steps">
            {STEPS.map((s, i) => (
              <View key={s.key} className="progress-step">
                <View className={`progress-step-dot ${i <= activeStep ? 'active' : ''} ${i === activeStep && task?.status === 'running' ? 'pulse' : ''}`} />
                <Text className={`progress-step-label ${i <= activeStep ? 'active' : ''}`}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {task?.status === 'failed' && (
          <View className="progress-fail">
            <Text className="progress-fail-text">{task.errorMessage ?? '生成失败'}</Text>
            <Text className="progress-refund-text">本次冻结的 {task.estimateCredits} 积分已自动退回,不会扣一分</Text>
          </View>
        )}
        {task?.status === 'canceled' && (
          <View className="progress-fail">
            <Text className="progress-refund-text">已取消,冻结的 {task.estimateCredits} 积分已退回</Text>
          </View>
        )}

        {task?.status === 'succeeded' && task.videoUrl && (
          <View className="progress-result">
            <View className="progress-ttl">
              <Text className="progress-ttl-text">成片保存期 7 天,到期自动清理,请及时下载</Text>
            </View>
            <Video className="progress-video" src={task.videoUrl} controls />
            <Text
              className="progress-copy"
              onClick={() => {
                void Taro.setClipboardData({ data: task.videoUrl ?? '' });
              }}
            >
              复制成片链接
            </Text>
          </View>
        )}

        {error && <Text className="progress-error-text">{error}</Text>}
      </View>

      {canCancel && (
        <View className="progress-cancel" onClick={() => void onCancel()}>
          <Text className="progress-cancel-text">取消任务(积分将退回)</Text>
        </View>
      )}
      {task?.status === 'failed' && (
        <View
          className="progress-again"
          onClick={async () => {
            try {
              await ensureSession();
              const next = await createTask({
                prompt: task.prompt,
                aspectRatio: task.aspectRatio,
                resolution: task.resolution,
                durationSec: task.durationSec,
              });
              Taro.redirectTo({ url: `/pages/progress/index?taskId=${next.id}` });
            } catch (e) {
              Taro.showToast({ title: (e as Error).message || '重试失败', icon: 'none' });
            }
          }}
        >
          <Text className="progress-again-text">一键重试(原参数,重新冻结积分)</Text>
        </View>
      )}
      {task?.status === 'succeeded' && (
        <View className="progress-again" onClick={() => Taro.redirectTo({ url: '/pages/create/index' })}>
          <Text className="progress-again-text">再来一条</Text>
        </View>
      )}
    </View>
  );
}
