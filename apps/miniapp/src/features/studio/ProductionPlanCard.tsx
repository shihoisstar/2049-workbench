import { useEffect, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import type { DramaProductionPlanValue, MarketingProductionPlanValue, MarketingCategoryValue } from '@wb/contracts';
import { dramaProductionPlan, marketingProductionPlan } from '../../services/generation';
const seconds = (ms: number) => Math.ceil(ms / 1000);
export function ProductionPlanCard(props: { planId: string; revision: number; visible: boolean; dirty: boolean }) {
  const [plan, setPlan] = useState<DramaProductionPlanValue | null>(null); const [expanded, setExpanded] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    if (!props.visible || props.dirty) return; let alive = true;
    void dramaProductionPlan(props.planId).then(value => { if (alive) { setPlan(value); setMessage(''); } }, () => { if (alive) setMessage('制作计划暂不可用，请重新读取草稿。'); });
    return () => { alive = false; };
  }, [props.planId, props.revision, props.visible, props.dirty]);
  return <View className="prep-card production-plan"><Text className="studio-field-heading">制作计划 · 免费整理</Text>
    {props.dirty ? <Text className="prep-note">保存本次修改后更新制作计划。</Text> : plan && <>
      <Text className="prep-note">交付目标：{plan.episodes.length} 条独立成片，每集单独保存。</Text>
      <Text className="prep-note">{plan.episodes.length} 集 · 原 {plan.originalShotCount} 段，建议合并为 {plan.proposedShotCount} 镜</Text>
      <Text className="prep-note">时长先按对白估算，配音后校准。完整成片费用尚待核定，当前仅展示制作安排。</Text>
      {!plan.current && <Text className="prep-note">请返回准备页重新确认角色及当前内容。</Text>}
      {plan.episodes.map(episode => <View key={episode.number}><Text className="prep-note">第 {episode.number} 集 · {episode.shots.length} 镜 · 预计 {seconds(episode.timing.minimumMs)}–{seconds(episode.timing.maximumMs)} 秒</Text>
        {!!episode.issues.length && <Text className="prep-note">{episode.issues.includes('episode_missing') ? '本集内容缺失，请补齐剧本。' : episode.issues.includes('shot_needs_review') ? '部分镜头过长或内容过多，制作前需要调整。' : episode.issues.includes('duration_short') ? '预计未达到60秒，请补充有效剧情后再制作完整剧集。' : '预计超过120秒，请精简剧情。'}</Text>}
        {expanded && episode.shots.map(shot => <View key={shot.key}><Text className="prep-note">{shot.heading} · 建议镜头 {shot.shotNumber} · {seconds(shot.timing.minimumMs)}–{seconds(shot.timing.maximumMs)} 秒</Text><Text className="studio-small">{shot.content}</Text></View>)}
      </View>)}
      <Button className="studio-text-button production-plan-details" onClick={() => setExpanded(!expanded)}>{expanded ? '收起镜头安排' : '查看建议镜头安排'}</Button>
    </>}{message && <Text className="prep-note">{message}</Text>}
  </View>;
}
export function MarketingTimingNote(props: { category: MarketingCategoryValue; text: string; visible: boolean; durationSec: 5 | 10 }) {
  const [plan, setPlan] = useState<MarketingProductionPlanValue | null>(null);
  useEffect(() => {
    setPlan(null); if (!props.visible || !props.text.trim()) return; let alive = true;
    const timer = setTimeout(() => { void marketingProductionPlan({ category: props.category, text: props.text, durationSec: props.durationSec }).then(value => { if (alive) setPlan(value); }, () => { if (alive) setPlan(null); }); }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [props.category, props.text, props.visible, props.durationSec]);
  if (!plan) return null;
  return <View className="marketing-timing"><Text className="prep-note">{plan.voiceover ? `口播预计 ${seconds(plan.timing.minimumMs)}–${seconds(plan.timing.maximumMs)} 秒 · 配音后校准` : '可在文案中填写“口播：…”和“画面：…”，免费检查时长。'}</Text>{plan.issues.includes('voiceover_too_long') && <Text className="prep-note">当前视频为{props.durationSec}秒，建议精简口播。</Text>}</View>;
}
