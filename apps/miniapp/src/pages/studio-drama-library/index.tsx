import { useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, usePullDownRefresh, useReachBottom } from '@tarojs/taro';
import type { DramaScriptViewValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { Icon } from '../../features/studio/shared';
import { listDramaScripts } from '../../services/generation';

export default function DramaLibrary() {
  const [items, setItems] = useState<DramaScriptViewValue[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);

  async function load(more = false) {
    if (busy.current || (more && !cursor)) return;
    busy.current = true; setLoading(true); setError('');
    try {
      const page = await listDramaScripts(more ? cursor! : undefined);
      setItems(previous => more ? [...previous, ...page.items.filter(item => !previous.some(old => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setLoaded(true);
    } catch { setError('剧本库暂时无法加载，请检查网络后重试。'); }
    finally { busy.current = false; setLoading(false); void Taro.stopPullDownRefresh(); }
  }

  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });
  useReachBottom(() => { if (!error) void load(true); });

  return <MobilePage notice="云端剧本库 · 手动修复会保留全部历史版本"><View className="studio-screen studio-drama-library">
    <View className="studio-library-heading"><Text className="studio-display">剧本库</Text><Text className="studio-subtitle">你的故事，随时继续创作</Text></View>
    <View className="studio-library-toolbar"><Text>云端剧本</Text><View className="studio-library-actions"><Button className="studio-text-button" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-projects/index' }); }}>我的项目</Button><Button className="studio-text-button" disabled={loading} onClick={() => { void load(); }}>刷新</Button></View></View>
    {error && <View className="studio-preview-feedback"><Text>{error}</Text><Button className="studio-text-button" onClick={() => { void load(); }}>重新加载</Button></View>}
    {!error && loaded && !items.length && <View className="studio-works-empty"><Icon name="file" /><Text className="studio-field-heading">还没有云端剧本</Text><Text className="studio-small">粘贴已有剧本并保存后，会在这里建立可修复版本。</Text><Button className="studio-hero-button" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-create/index?mode=script' }); }}>导入剧本 →</Button></View>}
    <View>{items.map(item => {
      const parsed = item.latestVersion.parse.status === 'parsed';
      return <Button key={item.id} className="studio-drama-card" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-repair/index?id=${item.id}` }); }}>
        <View className={`studio-drama-card-symbol ${parsed ? 'is-parsed' : 'needs-repair'}`}><Icon name={parsed ? 'file' : 'edit'} /></View>
        <View className="studio-work-copy"><Text className="studio-work-prompt">{item.title}</Text><Text className="studio-small">版本 {item.latestVersion.ordinal} · {item.latestVersion.source === 'imported' ? '导入剧本' : item.latestVersion.source === 'mock_generated' ? '开发模拟剧本' : '人工修复'}</Text><Text className="studio-small">{item.latestVersion.createdAt.slice(0, 10)} · {parsed ? `已解析 ${item.latestVersion.parse.episodes.length} 集` : `${item.latestVersion.parse.diagnostics.length} 个格式问题`}</Text></View>
        <Text className={`studio-status ${parsed ? 'studio-status--done' : 'studio-status--working'}`}>{parsed ? '可继续' : '待修复'} ›</Text>
      </Button>;
    })}</View>
    {loading && <Text className="studio-works-footer">正在加载剧本…</Text>}
    {!loading && !error && cursor && <Button className="studio-text-button studio-works-footer" onClick={() => { void load(true); }}>加载更多</Button>}
    {!loading && !error && loaded && items.length > 0 && !cursor && <Text className="studio-works-footer">已显示全部云端剧本</Text>}
  </View></MobilePage>;
}
