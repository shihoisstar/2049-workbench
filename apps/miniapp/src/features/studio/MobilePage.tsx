import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
import type { StudioScreen } from './shared';
import './studio.scss';

const pages: Record<StudioScreen, string> = {
  home: '/pages/studio-home/index',
  marketing: '/pages/studio-marketing/index',
  storyboard: '/pages/studio-storyboard/index',
};

export function openStudioPage(screen: StudioScreen) {
  if (screen === 'home') {
    void Taro.reLaunch({ url: pages.home });
  } else {
    void Taro.navigateTo({ url: pages[screen] });
  }
}

export function backToStudio() {
  if (Taro.getCurrentPages().length > 1) void Taro.navigateBack();
  else void Taro.reLaunch({ url: pages.home });
}

export function MobilePage({ children, notice = '开发联调 · 示例作品，暂不生成或扣费' }: PropsWithChildren<{ notice?: string }>) {
  return <View className="studio-preview studio-mobile-page">
    <Text className="studio-integration-notice">{notice}</Text>
    {children}
  </View>;
}
