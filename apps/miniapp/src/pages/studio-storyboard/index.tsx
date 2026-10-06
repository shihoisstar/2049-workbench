import { StoryboardScreen } from '../../features/studio/StoryboardScreen';
import { backToStudio, MobilePage } from '../../features/studio/MobilePage';

export default function StudioStoryboard() {
  return <MobilePage><StoryboardScreen onBack={backToStudio} /></MobilePage>;
}
