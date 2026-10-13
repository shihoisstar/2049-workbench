import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import type { DramaProjectViewValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { Icon } from '../../features/studio/shared';
import { listDramaProjects } from '../../services/generation';

export default function DramaProjects() {
  const [items, setItems] = useState<DramaProjectViewValue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function load(more = false) {
    if (busy.current || (more && !cursor)) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const page = await listDramaProjects(more ? cursor! : undefined);
      setItems(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setLoaded(true);
    } catch { setError('项目暂时无法加载，请检查网络后重试。'); }
    finally { busy.current = false; setLoading(false); void Taro.stopPullDownRefresh(); }
  }

  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });
  useReachBottom(() => { if (!error) void load(true); });

  return <MobilePage notice="云端项目 · 每个项目固定引用创建时的剧本版本"><View className="studio-screen studio-drama-library">
    <View className="studio-library-heading"><Text className="studio-display">我的漫剧</Text><Text className="studio-subtitle">从想法到成片，都在同一项目中继续</Text></View>
    <View className="studio-library-toolbar"><Text>云端项目</Text><Button className="studio-text-button" disabled={loading} onClick={() => { void load(); }}>刷新</Button></View>
    {error && <View className="studio-preview-feedback"><Text>{error}</Text><Button className="studio-text-button" onClick={() => { void load(); }}>重新加载</Button></View>}
    {!error && loaded && !items.length && <View className="studio-works-empty"><Icon name="grid" /><Text className="studio-field-heading">还没有漫剧项目</Text><Text className="studio-small">输入想法或导入剧本后，会在这里保存项目。</Text><Button className="studio-hero-button" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-create/index?mode=idea' }); }}>开始创作 →</Button></View>}
    <View>{items.map(item => <Button key={item.id} className="studio-drama-card" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-project/index?id=${item.id}` }); }}>
      <View className={`studio-drama-card-symbol ${item.mode === 'script' ? 'is-parsed' : 'needs-repair'}`}><Icon name={item.mode === 'script' ? 'file' : 'edit'} /></View>
      <View className="studio-work-copy"><Text className="studio-work-prompt">{item.title}</Text><Text className="studio-small">{item.activeVersion ? `剧本版本 ${item.activeVersion.ordinal} · ${item.confirmedVersionId ? '已确认' : '待确认'}` : '想法项目 · 查看进度'}</Text><Text className="studio-small">{item.createdAt.slice(0, 10)} · {item.look} · {item.aspectRatio} · {item.episodeCount} 集</Text></View>
      <Text className="studio-work-status">查看 ›</Text>
    </Button>)}</View>
    {loading && <Text className="studio-works-footer">正在加载项目…</Text>}
    {!loading && !error && cursor && <Button className="studio-text-button studio-works-footer" onClick={() => { void load(true); }}>加载更多</Button>}
    {!loading && !error && loaded && items.length > 0 && !cursor && <Text className="studio-works-footer">已显示全部云端项目</Text>}
  </View></MobilePage>;
}
