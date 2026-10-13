import { useState } from 'react';
import { useLoad } from '@tarojs/taro';
import { StoryboardScreen } from '../../features/studio/StoryboardScreen';
import { backToStudio, MobilePage } from '../../features/studio/MobilePage';

export default function StudioStoryboard() {
  const [projectId, setProjectId] = useState<string | null | undefined>(undefined);
  useLoad(params => { setProjectId(typeof params.projectId === 'string' ? params.projectId : null); });
  return <MobilePage notice="云端分镜 · 候选图预留积分，失败自动退还">{projectId !== undefined && <StoryboardScreen projectId={projectId} onBack={backToStudio} />}</MobilePage>;
}
