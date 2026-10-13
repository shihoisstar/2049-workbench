import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import type { DramaProjectViewValue } from '@wb/contracts';
import { generationWallet, listDramaProjects } from '../../services/generation';
import catClouds from '../../assets/studio/cat-clouds.png';
import { BottomNav, Cover, Icon, previewNotice, SectionTitle, type StudioScreen } from './shared';

export function HomeScreen({ onNavigate }: { onNavigate: (screen: StudioScreen) => void }) {
  const [chooseDrama, setChooseDrama] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [project, setProject] = useState<DramaProjectViewValue | null>(null);
  const [jobsMessage, setJobsMessage] = useState('正在读取项目…');
  async function refreshAccount() {
    await Promise.allSettled([
      generationWallet().then(wallet => setBalance(wallet.balance)).catch(() => setBalance(null)),
      listDramaProjects().then(page => {
        setProject(page.items[0] ?? null); setJobsMessage('还没有漫剧项目，从一个想法开始。');
      }).catch(() => { setProject(null); setJobsMessage('暂时无法读取项目，请重试。'); }),
    ]);
  }
  useDidShow(() => { void refreshAccount(); });
  async function createDrama(mode: 'idea' | 'script') {
    setChooseDrama(false);
    try { await Taro.navigateTo({ url: `/pages/studio-drama-create/index?mode=${mode}` }); }
    catch { previewNotice('页面打开失败，请重试'); }
  }
  return <View className="studio-screen studio-home ui-v2" data-testid="studio-home">
    <View className="studio-home-content">
      <View className="studio-brand-row"><Text className="v2-brand">2049出片<Text className="v2-dot">•</Text></Text>
        <Button className="studio-credit" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-mine/index' }); }}>◉ 积分 {balance ?? '—'} ›</Button></View>
      <Text className="v2-eyebrow">每一个脑洞，都值得开场</Text><Text className="v2-headline">你的脑洞，{'\n'}现在开场。</Text>
      <View className="v2-hero"><Cover src={catClouds} /><View className="v2-hero-shade" /><View className="v2-hero-copy"><Text className="v2-tag">灵感故事</Text><Text className="v2-hero-title">云海飞行日记</Text><Text className="v2-hero-caption">今天的目的地，是想象力之外。</Text></View></View>
      <View className="v2-actions"><Button id="studio-create-drama" className="v2-primary" onClick={() => setChooseDrama(true)}>✦ 开始创作 <Icon name="arrow" /></Button><Button className="v2-outline" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-library/index' }); }}><Icon name="file" />我的剧本</Button></View>
      <Text className="v2-hint">写一句想法，或带上你的剧本。</Text>
      <SectionTitle detail="全部项目" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-projects/index' }); }}>继续制作</SectionTitle>
      {project ? <Button className="v2-project" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-project/index?id=${project.id}` }); }}><View className="v2-project-symbol"><Icon name={project.activeVersion ? 'file' : 'edit'} /></View><View className="v2-project-copy"><Text>{project.title}</Text><Text className="studio-small">{!project.activeVersion ? '想法项目 · 继续制作' : project.confirmedVersionId ? '剧本已确认 · 继续制作' : project.activeVersion.parse.status === 'parsed' ? '剧本已保存 · 待确认' : '剧本需要修复'}</Text><Text className="studio-small">{project.look} · {project.episodeCount} 集</Text></View><Icon name="arrow" /></Button>
        : <View className="v2-empty"><Text className="studio-small">{jobsMessage}</Text><Button className="studio-text-button" onClick={() => { void refreshAccount(); }}>刷新</Button></View>}
      <SectionTitle>让灵感先起飞</SectionTitle><View className="v2-case"><Cover src={catClouds} /><Text className="v2-case-tag">故事示例 · 非成片</Text></View>
      <Text className="v2-case-title">小猫也有大宇宙</Text><Text className="v2-hint">一封来自月亮的信，一段意外的旅程。</Text>
      <Button className="v2-same" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-drama-create/index?mode=idea&template=cat-clouds' }); }}>使用故事灵感 ↗</Button>
      <Button className="v2-works-link" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-works/index' }); }}>查看我的视频作品 <Icon name="arrow" /></Button>
    </View><BottomNav onNavigate={onNavigate} active="漫剧" />
    {chooseDrama && <View className="studio-mode-overlay" catchMove onClick={() => setChooseDrama(false)}><View className="studio-mode-sheet" onClick={event => event.stopPropagation()}>
      <View className="studio-field-title"><Text className="studio-field-heading">从哪里开始？</Text><Button className="studio-mode-close" onClick={() => setChooseDrama(false)}>关闭</Button></View>
      <Button id="studio-mode-idea" className="studio-mode-idea" onClick={() => { void createDrama('idea'); }}><Text className="studio-tool-title">✦ 我有一个想法</Text><Text className="studio-small">写下灵感，从剧本开始</Text><Text>开始 →</Text></Button>
      <Button id="studio-mode-script" className="studio-mode-script" onClick={() => { void createDrama('script'); }}><Text className="studio-tool-title">▤ 我已经有剧本</Text><Text className="studio-small">粘贴内容，检查后继续制作</Text><Text>开始 →</Text></Button>
    </View></View>}
  </View>;
}
