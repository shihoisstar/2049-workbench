import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
export type StudioScreen = 'home' | 'marketing' | 'storyboard';
export const previewNotice = (title = '此功能将在后续页面中呈现') => {
  void Taro.showToast({ title, icon: 'none' });
};
export function Icon({
  name,
}: {
  name: 'arrow' | 'back' | 'plus' | 'home' | 'grid' | 'play' | 'user' | 'edit' | 'file' | 'refresh';
}) {
  return <View className={`studio-icon studio-icon--${name}`} aria-hidden="true" />;
}
export function Action({
  id,
  children,
  onClick,
  secondary = false,
  disabled = false,
}: PropsWithChildren<{ id?: string; onClick: () => void; secondary?: boolean; disabled?: boolean }>) {
  return (
    <Button
      id={id}
      className={`studio-action ${secondary ? 'studio-action--secondary' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
export function Cover({ src, className = '' }: { src: string; className?: string }) {
  return <Image className={`studio-cover ${className}`} src={src} mode="aspectFill" />;
}
export function PageHeader({
  title,
  onBack,
  detail = '帮助',
}: {
  title: string;
  onBack: () => void;
  detail?: string;
}) {
  if (process.env.TARO_ENV === 'weapp') return null;
  return (
    <View className="studio-page-header">
      <Button className="studio-icon-button" aria-label="返回创作首页" onClick={onBack}>
        <Icon name="back" />
      </Button>
      <Text className="studio-page-title">{title}</Text>
      <Button
        className="studio-help"
        onClick={() => { void Taro.showModal({ title: '如何继续', content: '先核对页面内容和当前状态。有费用的制作操作会显示本次报价，由你确认后开始。已受理的视频可从作品页继续查看；字幕修改和成片合成重试不重新生成视频。', showCancel: false }); }}
      >
        {detail}
      </Button>
    </View>
  );
}
export function SectionTitle({
  children,
  detail,
  onClick,
}: PropsWithChildren<{ detail?: string; onClick?: () => void }>) {
  return (
    <View className="studio-section-title">
      <Text>{children}</Text>
      {detail && (
        <Button className="studio-text-button" onClick={onClick}>
          {detail}
          <Icon name="arrow" />
        </Button>
      )}
    </View>
  );
}
export function BottomNav({ onNavigate, active = '漫剧' }: { onNavigate: (screen: StudioScreen) => void; active?: string }) {
  if (process.env.TARO_APP_MARKETING_PILOT === '1') return <View className="studio-bottom-nav">{[
    { icon: 'grid' as const, label: '创作', url: '/pages/studio-marketing/index' },
    { icon: 'play' as const, label: '作品', url: '/pages/studio-works/index' },
    { icon: 'user' as const, label: '我的', url: '/pages/studio-mine/index' },
  ].map(item => <Button key={item.label} className={`studio-nav-item ${active === item.label ? 'is-active' : ''}`} onClick={() => { if (active !== item.label) void Taro.reLaunch({ url: item.url }); }}><Icon name={item.icon} /><Text>{item.label}</Text></Button>)}</View>;
  return (
    <View className="studio-bottom-nav">
      {(
        [
          ['play', '漫剧'],
          ['grid', '创作'],
          ['user', '我的'],
        ] as const
      ).map(([icon, label], i) => (
        <Button
          key={label}
          className={`studio-nav-item ${label === active ? 'is-active' : ''}`}
          id={i === 2 ? 'studio-nav-mine' : undefined}
          onClick={() => { if (i < 2) onNavigate(i === 0 ? 'home' : 'marketing'); else if (active !== '我的') void Taro.navigateTo({ url: '/pages/studio-mine/index' }); }}
        >
          <Icon name={icon} />
          <Text>{label}</Text>
        </Button>
      ))}
    </View>
  );
}
