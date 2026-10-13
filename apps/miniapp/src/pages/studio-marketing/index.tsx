import { MarketingScreen } from '../../features/studio/MarketingScreen';
import { backToStudio, MobilePage } from '../../features/studio/MobilePage';
import { BottomNav } from '../../features/studio/shared';
import { View } from '@tarojs/components';

export default function StudioMarketing() {
  return <MobilePage notice="营销短视频 · 用真实卖点，讲一个好故事"><View className={process.env.TARO_APP_MARKETING_PILOT === '1' ? 'marketing-pilot-page ui-v2' : ''}><MarketingScreen onBack={backToStudio} />{process.env.TARO_APP_MARKETING_PILOT === '1' && <BottomNav active="创作" onNavigate={() => undefined} />}</View></MobilePage>;
}
