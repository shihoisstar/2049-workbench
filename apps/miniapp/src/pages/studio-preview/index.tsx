import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Text, View } from '@tarojs/components';
import { HomeScreen } from '../../features/studio/HomeScreen';
import { MarketingScreen } from '../../features/studio/MarketingScreen';
import { StoryboardScreen } from '../../features/studio/StoryboardScreen';
import type { StudioScreen } from '../../features/studio/shared';
import '../../features/studio/studio.scss';

export default function StudioPreview() {
  const [screen, setScreen] = useState<StudioScreen>('home');
  const [wide, setWide] = useState(() => Taro.getWindowInfo().windowWidth >= 1100);
  useEffect(() => {
    const resize = () => setWide(Taro.getWindowInfo().windowWidth >= 1100);
    Taro.onWindowResize(resize);
    return () => Taro.offWindowResize(resize);
  }, []);
  // Native form controls must mount with measurable geometry; hidden initial
  // Textarea mounts in Taro H5 can leave the inner element at one line high.
  return (
    <View className="studio-preview">
      <View className="studio-preview-toolbar">
        <View>
          <Text className="studio-preview-kicker">2049 / DESIGN PREVIEW</Text>
          <Text className="studio-preview-disclaimer">界面联调 · 报价来自后端，其余为示例，不会生成或扣费</Text>
        </View>
        <View className="studio-preview-switch">
          {(
            [
              { value: 'home', label: '创作首页' },
              { value: 'marketing', label: '营销创作' },
              { value: 'storyboard', label: '漫剧分镜' },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.value}
              className={screen === tab.value ? 'is-active' : ''}
              onClick={() => setScreen(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </View>
      </View>
      <View className="studio-preview-board">
        <View className={`studio-preview-pane ${screen === 'home' ? 'is-visible' : ''}`}>
          {(wide || screen === 'home') && <HomeScreen onNavigate={setScreen} />}
        </View>
        <View className={`studio-preview-pane ${screen === 'marketing' ? 'is-visible' : ''}`}>
          {(wide || screen === 'marketing') && <MarketingScreen onBack={() => setScreen('home')} />}
        </View>
        <View className={`studio-preview-pane ${screen === 'storyboard' ? 'is-visible' : ''}`}>
          {(wide || screen === 'storyboard') && (
            <StoryboardScreen onBack={() => setScreen('home')} />
          )}
        </View>
      </View>
    </View>
  );
}
