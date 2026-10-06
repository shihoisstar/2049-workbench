import { MarketingScreen } from '../../features/studio/MarketingScreen';
import { backToStudio, MobilePage } from '../../features/studio/MobilePage';

export default function StudioMarketing() {
  return <MobilePage notice="营销视频 · 以服务端报价与任务结果为准"><MarketingScreen onBack={backToStudio} /></MobilePage>;
}
