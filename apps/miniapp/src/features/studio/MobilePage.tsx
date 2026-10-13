import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
import type { StudioScreen } from './shared';
import './studio.scss';
import './ui-v2.scss';

const pages: Record<StudioScreen, string> = {
  home: process.env.TARO_APP_MARKETING_PILOT === '1' ? '/pages/studio-marketing/index' : '/pages/studio-home/index',
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

export function MobilePage({ children, notice = '开发联调 · 仅展示已接入的真实能力' }: PropsWithChildren<{ notice?: string }>) {
  return <View className={`studio-preview studio-mobile-page ${process.env.TARO_APP_MARKETING_PILOT === '1' ? 'ui-v2' : ''}`}>
    <Text className="studio-integration-notice">{process.env.TARO_APP_MARKETING_PILOT === '1' ? '营销试用版 · 积分仅用于内测' : notice}</Text>
    {children}
  </View>;
}
