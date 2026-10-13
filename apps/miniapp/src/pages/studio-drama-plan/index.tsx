import { useRef, useState } from 'react';
import { Button, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import { StoryboardPlanShotDraft, UpdateStoryboardPlanShot } from '@wb/contracts';
import type { StoryboardPlanValue, UpdateStoryboardPlanShotValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { PlanImageCandidates } from '../../features/studio/PlanImageCandidates';
import { PlanExports } from '../../features/studio/PlanExports';
import { ProductionPlanCard } from '../../features/studio/ProductionPlanCard';
import { latestStoryboardPlan, readStoryboardPlan, saveStoryboardShot } from '../../services/generation';
const backupKey = (id: string) => `wb_storyboard_edit:${id}`;
export default function StoryboardDraft() {
  const [plan, setPlan] = useState<StoryboardPlanValue | null>(null); const [episode, setEpisode] = useState(1);
  const [visible, setVisible] = useState(true);
  const [editor, setEditor] = useState<UpdateStoryboardPlanShotValue | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const locator = useRef({ id: '', projectId: '' }); const operation = useRef(false);
  async function load() {
    if (operation.current || !locator.current.projectId && !locator.current.id) return;
    operation.current = true; setBusy(true);
    try {
      const value = locator.current.id ? await readStoryboardPlan(locator.current.id) : await latestStoryboardPlan(locator.current.projectId);
      setPlan(value);
      if (!value) { setMessage('还没有分镜草稿，请先在角色准备页完成确认。'); return; }
      locator.current.id = value.id; locator.current.projectId = value.projectId;
      const pending = StoryboardPlanShotDraft.safeParse(Taro.getStorageSync(backupKey(value.id)));
      if (pending.success && value.shots.some(shot => shot.key === pending.data.shotKey)) { setEditor(pending.data); setEpisode(value.shots.find(shot => shot.key === pending.data.shotKey)!.episodeNumber); setMessage('已保留上次镜头修改，请检查后保存。'); }
      else { setEditor(null); setEpisode(current => value.shots.some(shot => shot.episodeNumber === current) ? current : value.shots[0].episodeNumber); setMessage(''); }
    } catch { setMessage('分镜草稿暂时无法读取，请重试。'); }
    finally { operation.current = false; setBusy(false); }
  }
  useLoad(params => { locator.current = { id: params.id ?? '', projectId: params.projectId ?? '' }; void load(); });
  useDidShow(() => { setVisible(true); void load(); });
  useDidHide(() => setVisible(false));
  function edit(value: UpdateStoryboardPlanShotValue) {
    if (!plan || !plan.current || busy) return;
    setEditor(value); try { Taro.setStorageSync(backupKey(plan.id), value); } catch { setMessage('本机暂时无法保留修改，请在离开前保存。'); }
  }
  async function save() {
    if (!plan || !editor || operation.current || !plan.current) return;
    const request = UpdateStoryboardPlanShot.safeParse(editor); if (!request.success) { setMessage('请填写镜头内容，并检查文字长度。'); return; }
    operation.current = true; setBusy(true);
    try {
      const next = await saveStoryboardShot(plan.id, request.data); setPlan(next); setEditor(null);
      Taro.removeStorageSync(backupKey(plan.id)); setMessage('这一镜已保存到云端。');
    } catch { setMessage('保存结果暂未确认，修改已保留。可再次保存；若云端已有更新，请重新读取后核对。'); }
    finally { operation.current = false; setBusy(false); }
  }
  async function discard() {
    if (!plan || busy || !(await Taro.showModal({ title: '放弃本次修改？', content: '已保存的云端镜头不会删除。' })).confirm) return;
    Taro.removeStorageSync(backupKey(plan.id)); setEditor(null); await load();
  }
  async function useLocalEdit() {
    if (!plan || !editor || !plan.current || busy || !(await Taro.showModal({ title: '沿用本次修改？', content: '请先核对下方云端内容。保存后将用你的修改替换这一镜，其他镜头保持当前云端版本。' })).confirm) return;
    edit({ ...editor, baseRevision: plan.revision }); setMessage('已核对云端版本，请点击“保存这一镜”。');
  }
  return <MobilePage notice="分镜草稿 · 整理免费，图片单独确认"><View className="studio-screen ui-v2 storyboard-draft"><View className="studio-form-body">
    <Text className="v2-eyebrow">2049出片 / 分镜草稿</Text><Text className="v2-project-heading">把故事，一镜镜展开</Text>
    <Text className="studio-small">按剧本段落整理。核对每一镜的内容和出镜角色，旁白不会自动算作出镜。</Text>
    <Text className="prep-note">这里修改画面说明；字幕和配音对白以已确认的剧本原文为准。</Text>
    {plan && <>
      <ProductionPlanCard planId={plan.id} revision={plan.revision} visible={visible} dirty={!!editor} />
      {!plan.current && <View className="studio-preview-feedback">剧本、准备内容或角色有效期已变化。当前草稿保留，请返回准备页重新确认并整理。</View>}
      <View className="plan-episodes">{[...new Set(plan.shots.map(shot => shot.episodeNumber))].map(number => <Button key={number} className={number === episode ? 'is-active' : ''} disabled={busy || !!editor} onClick={() => setEpisode(number)}>第 {number} 集</Button>)}</View>
      <Text className="prep-note">共 {plan.shots.length} 镜 · 已核对 {plan.shots.filter(shot => shot.reviewed).length} 镜</Text>
      {plan.shots.filter(shot => shot.episodeNumber === episode).map(shot => <View className="prep-card plan-shot" key={shot.key}>
        <View className="prep-section-heading"><Text className="studio-field-heading">场景 {shot.sceneNumber} · 镜头 {shot.shotNumber}</Text><Text className="studio-small">{shot.reviewed ? '已核对' : '待核对'}</Text></View>
        <Text className="prep-note">{shot.heading}{shot.sceneDescription ? ` · ${shot.sceneDescription}` : ''}</Text>
        <View className="plan-source"><Text className="studio-small">剧本原文 · 第 {shot.sourceLine} 行</Text><Text>{shot.sourceText}</Text></View>
        {editor?.shotKey === shot.key ? <>
          {editor.baseRevision !== plan.revision && <View className="studio-preview-feedback"><Text>云端已有更新，请先核对：</Text><Text className="plan-content-read">{shot.content}</Text><Text>出镜：{shot.roleKeys.map(key => plan.roles.find(role => role.key === key)?.name).join('、') || '未指定'}</Text><Button disabled={busy || !plan.current} onClick={() => { void useLocalEdit(); }}>核对后沿用本次修改</Button></View>}
          <Textarea className="plan-content" value={editor.content} maxlength={20000} disabled={busy} onInput={event => edit({ ...editor, content: event.detail.value, reviewed: false })} />
          <Text className="studio-small">出镜角色（可多选；不选表示空镜或仅旁白）</Text>
          <View className="plan-roles">{plan.roles.filter(role => role.usage === 'visual').map(role => <Button key={role.key} disabled={busy} className={editor.roleKeys.includes(role.key) ? 'is-active' : ''} onClick={() => edit({ ...editor, reviewed: false, roleKeys: editor.roleKeys.includes(role.key) ? editor.roleKeys.filter(key => key !== role.key) : [...editor.roleKeys, role.key] })}>{role.name}</Button>)}</View>
          <Button className="plan-reviewed" disabled={busy} onClick={() => edit({ ...editor, reviewed: !editor.reviewed })}>{editor.reviewed ? '✓ 本镜头已核对' : '○ 标记本镜头已核对'}</Button>
          <View className="prep-reference-actions"><Button className="is-primary plan-save" disabled={busy || !plan.current} onClick={() => { void save(); }}>{busy ? '保存中…' : '保存这一镜'}</Button><Button disabled={busy} onClick={() => { void discard(); }}>放弃本次修改</Button></View>
        </> : <><Text className="plan-content-read">{shot.content}</Text><Text className="prep-note">出镜：{shot.roleKeys.map(key => plan.roles.find(role => role.key === key)?.name).join('、') || '暂未指定，请核对是否为空镜'}</Text><Button className="prep-add plan-edit" disabled={!plan.current || busy || !!editor} onClick={() => edit({ baseRevision: plan.revision, shotKey: shot.key, content: shot.content, roleKeys: shot.roleKeys, reviewed: shot.reviewed })}>核对 / 修改这一镜</Button></>}
        <PlanImageCandidates planId={plan.id} shotKey={shot.key} revision={plan.revision} reviewed={shot.reviewed} disabled={busy || !!editor || !plan.current} visible={visible} />
      </View>)}
      <PlanExports projectId={plan.projectId} planId={plan.id} revision={plan.revision} episodes={[...new Set(plan.shots.map(shot => shot.episodeNumber))]} disabled={busy || !!editor || !plan.current} visible={visible} />
      <Text className="prep-note">整理和编辑免费。图片与视频需确认测试积分；当前仅提供开发模拟。</Text>
    </>}
    {message && <View className="studio-preview-feedback">{message}</View>}
    <Button className="studio-text-button" disabled={busy} onClick={() => { void load(); }}>重新读取云端草稿</Button>
    <Button className="studio-text-button" disabled={busy || !locator.current.projectId} onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-prepare/index?id=${locator.current.projectId}` }); }}>返回角色准备</Button>
  </View></View></MobilePage>;
}
