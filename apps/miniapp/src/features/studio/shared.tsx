import { Button, Image, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PropsWithChildren } from 'react';
import rain from '../../assets/studio/hero-rain.png';
import perfume from '../../assets/studio/perfume.png';
import cafe from '../../assets/studio/cafe.png';
import fantasy from '../../assets/studio/fantasy.png';

export const art = { rain, perfume, cafe, fantasy };
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
        onClick={() => previewNotice('当前为界面预览，不会生成或扣费')}
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
export function BottomNav({ onNavigate }: { onNavigate: (screen: StudioScreen) => void }) {
  return (
    <View className="studio-bottom-nav">
      {(
        [
          ['home', '首页'],
          ['grid', '创作'],
          ['play', '作品'],
          ['user', '我的'],
        ] as const
      ).map(([icon, label], i) => (
        <Button
          key={label}
          className={`studio-nav-item ${i === 0 ? 'is-active' : ''}`}
          onClick={() => (i < 2 ? onNavigate(i === 0 ? 'home' : 'marketing') : previewNotice())}
        >
          <Icon name={icon} />
          <Text>{label}</Text>
        </Button>
      ))}
    </View>
  );
}
