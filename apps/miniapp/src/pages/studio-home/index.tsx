import { HomeScreen } from '../../features/studio/HomeScreen';
import { MobilePage, openStudioPage } from '../../features/studio/MobilePage';

export default function StudioHome() {
  return <MobilePage><HomeScreen onNavigate={openStudioPage} /></MobilePage>;
}
