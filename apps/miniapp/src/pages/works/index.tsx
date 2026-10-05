import { useCallback, useEffect, useState } from 'react';
import { View, Text, Video } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Tag } from '@nutui/nutui-react-taro';

import type { GenerationTask } from '@wb/contracts';

import { downloadOrSaveVideo, ensureSession, listMyTasks } from '../../services/api';

import './index.scss';

/** 成片保存期(与 api VIDEO_TTL_DAYS 对齐)。 */
const TTL_DAYS = 7;

function remainingDays(finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const deadline = new Date(finishedAt).getTime() + TTL_DAYS * 24 * 3600_000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 3600_000)));
}

function isExpired(t: GenerationTask): boolean {
  return t.status === 'succeeded' && !t.videoUrl && !!t.finishedAt;
}

/** 我的作品(T3.2 成片管理闭环):列表/预览/TTL 剩余/保存相册/分享。 */
export default function Works() {
  const [tasks, setTasks] = useState<GenerationTask[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');

  useShareAppMessage(() => ({
    title: '2049出片 · 一句话生成营销短视频',
    path: '/pages/index/index',
  }));

  const load = useCallback(async () => {
    try {
      await ensureSession();
      setTasks(await listMyTasks());
    } catch (e) {
      setError((e as Error).message || '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(async (t: GenerationTask) => {
    if (!t.videoUrl || saving) return;
    setSaving(t.id);
    try {
      const r = await downloadOrSaveVideo(t.videoUrl);
      Taro.showToast({ title: r === 'saved' ? '已保存到相册' : '已在新页面打开', icon: 'none' });
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    } finally {
      setSaving('');
    }
  }, [saving]);

  const works = (tasks ?? []).filter((t) => ['succeeded', 'failed'].includes(t.status));

  return (
    <View className="works-page">
      <View className="works-head">
        <Text className="works-title">我的作品</Text>
        <Text className="works-count">{works.filter((t) => t.status === 'succeeded' && t.videoUrl).length} 条成片</Text>
      </View>

      {error ? (
        <View className="works-empty"><Text className="works-empty-text">{error}</Text></View>
      ) : tasks === null ? (
        <View className="works-empty"><Text className="works-empty-text">加载中…</Text></View>
      ) : works.length === 0 ? (
        <View className="works-empty">
          <Text className="works-empty-text">还没有作品,去首页挑个模板开始吧</Text>
        </View>
      ) : (
        works.map((t) => {
          const left = remainingDays(t.finishedAt);
          const expired = isExpired(t);
          return (
            <View key={t.id} className="works-card">
              <View className="works-card-head">
                <Text className="works-card-title">{t.prompt.slice(0, 24)}{t.prompt.length > 24 ? '…' : ''}</Text>
                {expired ? <Tag>已过期</Tag> : t.status === 'succeeded' ? <Tag type="success">可下载</Tag> : <Tag type="danger">已失败</Tag>}
              </View>
              <Text className="works-card-meta">
                {t.resolution} · {t.durationSec}s · {new Date(t.createdAt).toLocaleDateString()}
                {t.status === 'succeeded' && left !== null ? ` · 剩余 ${left} 天` : ''}
              </Text>
              {t.status === 'failed' && (
                <Text className="works-card-fail">{t.errorMessage ?? '生成失败(积分已退)'}</Text>
              )}
              {expired && (
                <Text className="works-card-fail">成片已过 7 天保存期,重新生成即可</Text>
              )}
              {t.status === 'succeeded' && t.videoUrl && (
                <View className="works-card-actions">
                  <Video className="works-card-video" src={t.videoUrl} controls />
                  <View
                    className={`works-save ${saving === t.id ? 'disabled' : ''}`}
                    onClick={() => void onSave(t)}
                  >
                    <Text className="works-save-text">{saving === t.id ? '保存中…' : '保存到相册'}</Text>
                  </View>
                </View>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}
