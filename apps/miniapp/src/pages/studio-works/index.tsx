import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import type { GenerationView } from '@wb/contracts';
import { listGenerations } from '../../services/generation';
import { MobilePage, openStudioPage } from '../../features/studio/MobilePage';
import { BottomNav, Icon } from '../../features/studio/shared';

const labels = { accepted: '生成中', succeeded: '已完成', failed: '生成失败' };
export default function StudioWorks() {
  const [items, setItems] = useState<GenerationView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  async function load(more = false) {
    if (busy.current || (more && !cursor)) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const page = await listGenerations(more ? cursor! : undefined);
      setItems(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setLoaded(true);
    } catch { setError('作品暂时无法加载，请稍后重试。'); }
    finally { busy.current = false; setLoading(false); void Taro.stopPullDownRefresh(); }
  }
  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });
  useReachBottom(() => { if (!error) void load(true); });
  return <MobilePage notice="我的创作 · 任务与成片自动保存"><View className="studio-screen studio-works">
    <View className="studio-works-heading"><Text className="studio-display">我的作品</Text><Text className="studio-subtitle">每一次灵感，都有迹可循</Text></View>
    <View className="studio-works-toolbar"><Text>营销视频</Text><Button className="studio-text-button" disabled={loading} onClick={() => { void load(); }}>刷新</Button></View>
    {error && <View className="studio-preview-feedback" id="works-error"><Text>{error}</Text><Button onClick={() => { void load(); }}>重新加载</Button></View>}
    {!error && loaded && !items.length && <View id="works-empty" className="studio-works-empty"><Icon name="play" /><Text className="studio-field-heading">第一部作品，从一个想法开始</Text><Text className="studio-small">创建视频后，可在这里查看进度与成片。</Text><Button className="studio-hero-button" onClick={() => openStudioPage('marketing')}>开始创作 →</Button></View>}
    <View id="works-list">{items.map(item => <Button key={item.id} className="studio-work-card" id={`work-${item.id}`} onClick={() => { void Taro.navigateTo({ url: `/pages/studio-progress/index?id=${item.id}` }); }}>
      <View className={`studio-work-symbol studio-work-symbol--${item.status}`}><Icon name={item.status === 'succeeded' ? 'play' : item.status === 'failed' ? 'refresh' : 'grid'} /></View>
      <View className="studio-work-copy"><Text className="studio-work-prompt">{item.prompt}</Text><Text className="studio-small">{item.createdAt.slice(0, 10)} · {item.resolution.toUpperCase()} · {item.durationSec}秒</Text><Text className="studio-small">{item.status === 'succeeded' ? `已消耗 ${item.actualCredits} 积分` : item.status === 'failed' ? '预留积分已退还' : `已预留 ${item.reservedCredits} 积分`}</Text></View>
      <Text className="studio-work-status">{labels[item.status]} ›</Text>
    </Button>)}</View>
    {loading && <Text className="studio-works-footer">正在加载作品…</Text>}
    {!loading && !error && cursor && <Button className="studio-text-button studio-works-footer" onClick={() => { void load(true); }}>加载更多</Button>}
    {!loading && !error && loaded && items.length > 0 && !cursor && <Text className="studio-works-footer">已显示全部作品 · 下拉刷新任务状态</Text>}
    <BottomNav active="作品" onNavigate={openStudioPage} />
  </View></MobilePage>;
}
