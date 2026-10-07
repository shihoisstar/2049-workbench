import { HomeScreen } from '../../features/studio/HomeScreen';
import { MobilePage, openStudioPage } from '../../features/studio/MobilePage';

export default function StudioHome() {
  return <MobilePage notice="2049出片 · 营销视频与漫剧创作"><HomeScreen onNavigate={openStudioPage} /></MobilePage>;
}
