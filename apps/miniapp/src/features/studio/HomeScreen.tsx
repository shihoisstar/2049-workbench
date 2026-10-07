import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { generationWallet, listGenerations } from '../../services/generation';
import { useState } from 'react';
import {
  art,
  BottomNav,
  Cover,
  Icon,
  previewNotice,
  SectionTitle,
  type StudioScreen,
} from './shared';

export function HomeScreen({ onNavigate }: { onNavigate: (screen: StudioScreen) => void }) {
  const [chooseDrama, setChooseDrama] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [lastJob, setLastJob] = useState('');
  const [jobsMessage, setJobsMessage] = useState('正在读取任务…');
  async function refreshAccount() {
    try { setBalance((await generationWallet()).balance); }
    catch { setBalance(null); }
    try { setLastJob((await listGenerations()).items[0]?.id ?? ''); setJobsMessage('还没有视频任务，从上方入口开始创作。'); }
    catch { setLastJob(''); setJobsMessage('暂时无法读取任务，请进入作品页重试。'); }
  }
  useDidShow(() => { void refreshAccount(); });
  async function createDrama(mode: 'idea' | 'script') {
    setChooseDrama(false);
    try { await Taro.navigateTo({ url: `/pages/studio-drama-create/index?mode=${mode}` }); }
    catch { previewNotice('页面打开失败，请重试'); }
  }
  return (
    <View className="studio-screen studio-home" data-testid="studio-home">
      <View className="studio-home-content">
        <View className="studio-brand-row">
          <Text className="studio-brand">
            2049<Text className="studio-brand-cn">出片</Text>
          </Text>
          <Button
            className="studio-credit"
            onClick={() => { void refreshAccount(); }}
          >
            <Text className="studio-credit-coin">◉</Text> 积分 {balance ?? '—'} <Text>›</Text>
          </Button>
        </View>
        <View className="studio-manifesto">
          <View>
            <Text className="studio-display">把灵感，拍成作品</Text>
            <Text className="studio-subtitle">营销短视频 · AI漫剧</Text>
          </View>
          <Text className="studio-micro">
            IDEAS{'\n'}TO MOVIES{'\n'}TO TOMORROW
          </Text>
        </View>
        <View className="studio-hero">
          <Cover src={art.rain} />
          <View className="studio-hero-shade" />
          <View className="studio-corners" />
          <View className="studio-hero-copy">
            <Text className="studio-handwriting">每一个想法{'\n'}都值得被看见</Text>
            <Text className="studio-hero-caption">用 AI，把灵感变成{'\n'}打动世界的画面</Text>
            <Button className="studio-hero-button" onClick={() => onNavigate('marketing')}>
              开始创作 <Icon name="arrow" />
            </Button>
          </View>
          <Text className="studio-watermark">2049 —</Text>
        </View>
        <View className="studio-entry-grid">
          <Button className="studio-entry" onClick={() => onNavigate('marketing')}>
            <Cover src={art.perfume} />
            <View className="studio-entry-fade" />
            <View className="studio-entry-copy">
              <Text className="studio-entry-title">营销短视频</Text>
              <Text>让好产品，被更多人看见</Text>
              <Text className="studio-entry-note">AI 帮你拍出专业级营销视频</Text>
            </View>
            <View className="studio-round-arrow">
              <Icon name="arrow" />
            </View>
          </Button>
          <Button id="studio-create-drama" className="studio-entry" onClick={event => { event.stopPropagation(); setChooseDrama(true); }}>
            <Cover src={art.fantasy} />
            <View className="studio-entry-fade" />
            <View className="studio-entry-copy">
              <Text className="studio-entry-title">AI漫剧</Text>
              <Text>用 AI 讲述你的故事</Text>
              <Text className="studio-entry-note">打造专属的动漫短剧</Text>
            </View>
            <View className="studio-round-arrow">
              <Icon name="arrow" />
            </View>
          </Button>
        </View>
        <View className="studio-tool-grid">
          {(
            [
              { icon: 'edit', title: 'AI绘画', note: '一键生成精美画面' },
              { icon: 'file', title: '剧本库', note: '海量灵感，开箱即用' },
            ] as const
          ).map((item) => (
            <Button className="studio-tool" key={item.title} onClick={() => previewNotice()}>
              <Icon name={item.icon} />
              <View>
                <Text className="studio-tool-title">{item.title}</Text>
                <Text className="studio-small">{item.note}</Text>
              </View>
              <Icon name="arrow" />
            </Button>
          ))}
        </View>
        <SectionTitle detail="全部作品" onClick={() => { void Taro.navigateTo({ url: '/pages/studio-works/index' }); }}>
          继续创作
        </SectionTitle>
        {lastJob ? <Button id="last-generated-video" className="studio-project" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-progress/index?id=${lastJob}` }); }}>
          <Icon name="play" /><View className="studio-project-copy"><Text className="studio-tool-title">我的视频任务</Text><Text className="studio-small">查看进度、成片与保存</Text></View><Icon name="arrow" />
        </Button> : <Text className="studio-small">{jobsMessage}</Text>}
        <SectionTitle>漫剧功能预览</SectionTitle>
        <Button className="studio-project" onClick={() => onNavigate('storyboard')}>
          <Cover src={art.rain} />
          <View className="studio-project-copy">
            <Text className="studio-tool-title">雨夜来信</Text>
            <Text className="studio-small">AI漫剧 · 第一集</Text>
            <Text className="studio-red studio-small">● 分镜制作中</Text>
          </View>
          <Text className="studio-ellipsis">⋮</Text>
        </Button>
        <SectionTitle detail="更多" onClick={() => previewNotice()}>
          灵感片场
        </SectionTitle>
        <View className="studio-inspiration-grid">
          <Button className="studio-inspiration" onClick={() => onNavigate('marketing')}>
            <Cover src={art.cafe} />
            <View className="studio-inspiration-shade" />
            <Text className="studio-inspiration-title">一杯好咖啡{'\n'}唤醒更好的自己</Text>
            <Text className="studio-inspiration-note">生活，也可以很有电影感</Text>
          </Button>
          <Button className="studio-inspiration" onClick={() => onNavigate('storyboard')}>
            <Cover src={art.fantasy} />
            <View className="studio-inspiration-shade" />
            <Text className="studio-inspiration-title">念念不忘{'\n'}终有回响</Text>
            <Text className="studio-inspiration-note">用 AI，续写心中的故事</Text>
          </Button>
        </View>
      </View>
      <BottomNav onNavigate={onNavigate} />
      {chooseDrama && <View className="studio-mode-overlay" catchMove onClick={() => setChooseDrama(false)}>
        <View className="studio-mode-sheet" onClick={event => event.stopPropagation()}>
          <View className="studio-field-title"><Text className="studio-field-heading">选择创作方式</Text>
            <Button className="studio-mode-close" onClick={() => setChooseDrama(false)}>关闭</Button></View>
          <Button id="studio-mode-idea" className="studio-mode-idea" onClick={event => { event.stopPropagation(); void createDrama('idea'); }}>
            <Text className="studio-tool-title">输入想法</Text><Text className="studio-small">还没有剧本？从人物、背景和故事灵感开始。</Text><Text className="studio-red">开始 →</Text>
          </Button>
          <Button id="studio-mode-script" className="studio-mode-script" onClick={event => { event.stopPropagation(); void createDrama('script'); }}>
            <Text className="studio-tool-title">已有剧本</Text><Text className="studio-small">准备好了故事？粘贴剧本，配置你的漫剧。</Text><Text className="studio-red">开始 →</Text>
          </Button>
        </View>
      </View>}
    </View>
  );
}
