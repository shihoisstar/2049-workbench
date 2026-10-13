import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import type { GenerationView, NativeCaptionReviewValue } from '@wb/contracts';
import { listGenerations, nativeCaptionReview } from '../../services/generation';
import { marketingTaskState, marketingWorkTitle, studioDate } from '../../services/marketing-presentation';
import { MobilePage, openStudioPage } from '../../features/studio/MobilePage';
import { BottomNav, Icon } from '../../features/studio/shared';

export default function StudioWorks() {
  const [items, setItems] = useState<GenerationView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState<Record<string, NativeCaptionReviewValue | null>>({});
  const [visible, setVisible] = useState(true);
  const busy = useRef(false);
  async function load(more = false) {
    if (busy.current || (more && !cursor)) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const page = await listGenerations(more ? cursor! : undefined);
      setItems(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setLoaded(true);
      const active = page.items.filter(item => item.status === 'accepted' && item.durationSec === 10 && item.actualCredits !== null);
      const values = await Promise.allSettled(active.map(async item => [item.id, await nativeCaptionReview(item.id)] as const));
      setReviews(previous => ({ ...(more ? previous : {}), ...Object.fromEntries(values.flatMap(value => value.status === 'fulfilled' ? [value.value] : [])) }));
    } catch { setError('作品暂时无法加载，请稍后重试。'); }
    finally { busy.current = false; setLoading(false); void Taro.stopPullDownRefresh(); }
  }
  useDidShow(() => { setVisible(true); void load(); }); useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible || !items.some(item => item.status === 'accepted')) return;
    const timer = setTimeout(() => { void load(); }, 10000); return () => clearTimeout(timer);
  }, [visible, items]);
  usePullDownRefresh(() => { void load(); });
  useReachBottom(() => { if (!error) void load(true); });
  return <MobilePage notice="我的创作 · 任务与成片自动保存"><View className="studio-screen studio-works">
    <View className="studio-works-heading"><Text className="studio-display">我的作品</Text><Text className="studio-subtitle">制作进度、字幕核对和成片，都在这里继续。</Text></View>
    <View className="studio-works-toolbar"><Text>营销视频</Text><Button className="studio-text-button" disabled={loading} onClick={() => { void load(); }}>刷新</Button></View>
    {error && <View className="studio-preview-feedback" id="works-error"><Text>{error}</Text><Button onClick={() => { void load(); }}>重新加载</Button></View>}
    {loading && !loaded && <View id="works-loading" className="marketing-loading"><Text>正在读取你的作品…</Text><View /><View /></View>}
    {!error && loaded && !items.length && <View id="works-empty" className="studio-works-empty"><Icon name="play" /><Text className="studio-field-heading">第一部作品，从一个想法开始</Text><Text className="studio-small">创建视频后，可在这里查看进度与成片。</Text><Button className="studio-hero-button" onClick={() => openStudioPage('marketing')}>开始创作 →</Button></View>}
    <View id="works-list">{items.map(item => { const task = marketingTaskState(item, reviews[item.id]); return <Button key={item.id} className="studio-work-card" id={`work-${item.id}`} onClick={() => { void Taro.navigateTo({ url: `/pages/studio-progress/index?id=${item.id}` }); }}>
      <View className={`studio-work-symbol studio-work-symbol--${item.status}`}><Icon name={item.status === 'succeeded' ? 'play' : item.status === 'failed' ? 'refresh' : 'grid'} /></View>
      <View className="studio-work-copy"><View className="marketing-work-meta"><Text>{item.category === 'store_visit' ? '探店视频' : '剧情带货'}</Text><Text className={`marketing-status ${item.status}`}>{task.label}</Text></View><Text className="studio-work-prompt">{marketingWorkTitle(item.prompt)}</Text><Text className="studio-small">{studioDate(item.createdAt)} · {item.resolution.toUpperCase()} · {item.durationSec}秒</Text><Text className="studio-small">{item.actualCredits !== null ? `已消耗 ${item.actualCredits} 积分` : item.status === 'failed' ? '预留积分已退还' : `已预留 ${item.reservedCredits} 积分`}</Text><Text className="marketing-work-next">{task.action} →</Text></View>
    </Button>; })}</View>
    {loading && loaded && <Text className="studio-works-footer">正在更新作品…</Text>}
    {!loading && !error && cursor && <Button className="studio-text-button studio-works-footer" onClick={() => { void load(true); }}>加载更多</Button>}
    {!loading && !error && loaded && items.length > 0 && !cursor && <Text className="studio-works-footer">已显示全部作品{items.some(item => item.status === 'accepted') ? ' · 制作状态会自动更新' : ''}</Text>}
    <BottomNav active="作品" onNavigate={openStudioPage} />
  </View></MobilePage>;
}
