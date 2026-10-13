import { useRef, useState } from 'react';
import { Button, Image, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { SaveDramaPreparation, ErrorBody } from '@wb/contracts';
import type { DramaPreparationValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action } from '../../features/studio/shared';
import { PortraitCandidates } from '../../features/studio/PortraitCandidates';
import { confirmRoleAppearance, getDramaPreparation, materialAccess, newRequestKey, saveDramaPreparation, selectPortrait, uploadMaterial, organizeStoryboard } from '../../services/generation';

function inputFor(draft: DramaPreparationValue) {
  return { scriptVersionId: draft.scriptVersionId, baseRevision: draft.revision,
    roles: draft.roles.map(({ key, name, usage, description, referenceMaterialId }) => ({ key, name, usage, description, referenceMaterialId })), scenes: draft.scenes.map(({ key, description }) => ({ key, description })) };
}
const backupKey = (projectId: string, versionId: string) => `wb_drama_preparation:${projectId}:${versionId}`;

export default function DramaPrepare() {
  const [draft, setDraft] = useState<DramaPreparationValue | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [visible, setVisible] = useState(true);
  const [previews, setPreviews] = useState<Record<string, { url: string | null; error?: string }>>({});
  const projectId = useRef(''); const inFlight = useRef(false); const changed = useRef(false);
  async function loadReference(id: string) {
    try { const access = await materialAccess(id); setPreviews(previous => ({ ...previous, [id]: { url: access.url } })); }
    catch (failure) { setPreviews(previous => ({ ...previous, [id]: { url: null, error: failure instanceof ApiError && failure.status === 410 ? '参考图已过期，请重新选择。' : '图片暂时无法读取，可以重试。' } })); }
  }
  async function load(force = false) {
    if (!projectId.current || inFlight.current || (changed.current && !force)) return;
    inFlight.current = true; setBusy(true);
    try {
      const cloud = await getDramaPreparation(projectId.current);
      const key = backupKey(projectId.current, cloud.scriptVersionId);
      let cached: unknown;
      try { cached = Taro.getStorageSync(key); } catch { /* Local storage failure must not hide the cloud draft. */ }
      const backup = SaveDramaPreparation.safeParse(cached);
      const same = backup.success && JSON.stringify({ ...backup.data, baseRevision: 0 }) === JSON.stringify({ ...inputFor(cloud), baseRevision: 0 });
      if (!force && backup.success && backup.data.scriptVersionId === cloud.scriptVersionId && !same) {
        setDraft({ ...cloud, revision: backup.data.baseRevision, roles: backup.data.roles.map(role => ({ ...role, selection: null, evidence: cloud.roles.find(item => item.key === role.key)?.evidence ?? [] })),
          scenes: cloud.scenes.map(scene => ({ ...scene, description: backup.data.scenes.find(item => item.key === scene.key)?.description ?? scene.description })) });
        for (const id of new Set(backup.data.roles.flatMap(role => role.referenceMaterialId ? [role.referenceMaterialId] : []))) void loadReference(id);
        changed.current = true; setDirty(true); setMessage('已恢复上次保存结果未确认的内容，请检查后再保存。');
      } else {
        setDraft(cloud); changed.current = false; setDirty(false); setMessage('');
        for (const id of new Set(cloud.roles.flatMap(role => role.referenceMaterialId ? [role.referenceMaterialId] : []))) void loadReference(id);
        try { Taro.removeStorageSync(key); } catch { /* Cloud content remains available even if local cleanup fails. */ }
      }
      setError('');
    } catch (failure) { setError(failure instanceof ApiError && failure.status === 409 ? '请先确认剧本，再准备角色与场景。' : '准备内容暂时无法读取，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useLoad(params => { if (typeof params.id === 'string') { projectId.current = params.id; void load(); } else setError('项目地址无效。'); });
  useDidShow(() => { setVisible(true); void load(); });
  useDidHide(() => setVisible(false));
  async function chooseCandidate(jobId: string) {
    if (!draft || changed.current || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const next = await selectPortrait(jobId, draft.revision); setDraft(next);
      for (const role of next.roles) if (role.referenceMaterialId) void loadReference(role.referenceMaterialId);
      setMessage('候选已选入准备，请点击“采用此形象”完成确认。');
    } catch { setMessage('候选或准备状态已变化，请刷新后再选择。原有形象已保留。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function edit(next: DramaPreparationValue) {
    for (const role of next.roles) {
      const previous = draft?.roles.find(item => item.key === role.key);
      if (role.selection && previous && (role.name !== previous.name || role.description !== previous.description || role.usage !== previous.usage || role.referenceMaterialId !== previous.referenceMaterialId)) role.selection = { ...role.selection, status: 'needs_confirmation' };
    }
    changed.current = true; setDirty(true); setMessage(''); setDraft(next);
  }
  async function chooseReference(roleKey: string) {
    if (!draft || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const chosen = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] }).catch(() => null);
      if (!chosen?.tempFilePaths[0]) return;
      const path = chosen.tempFilePaths[0]; const material = await uploadMaterial(path);
      edit({ ...draft, roles: draft.roles.map(role => role.key === roleKey ? { ...role, referenceMaterialId: material.id } : role) });
      setPreviews(previous => ({ ...previous, [material.id]: { url: path } }));
      setMessage('参考图已上传，点击“采用此形象”保存并确认。');
    } catch { setMessage('参考图上传失败，原有选择已保留，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function addRole() {
    if (!draft || inFlight.current || draft.roles.length >= 100) return;
    inFlight.current = true; setBusy(true);
    try {
      const key = `extra-${await newRequestKey()}`;
      changed.current = true; setDirty(true); setMessage('');
      setDraft(current => current ? { ...current, roles: [...current.roles, { key, name: '', usage: 'visual', description: '', referenceMaterialId: null, selection: null, evidence: [] }] } : current);
    } catch { setMessage('暂时无法添加角色，请重试。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(roleKey?: string) {
    if (!draft || inFlight.current) return;
    const body = SaveDramaPreparation.safeParse(inputFor(draft));
    if (!body.success || new Set(draft.roles.map(role => role.name.trim())).size !== draft.roles.length) { setMessage('请填写不重复的角色名称，并检查描述长度。'); return; }
    inFlight.current = true; setBusy(true);
    const key = backupKey(projectId.current, draft.scriptVersionId);
    try { Taro.setStorageSync(key, body.data); } catch { /* Cloud save must still be attempted if local storage is full. */ }
    let saved: DramaPreparationValue | null = null;
    try {
      saved = await saveDramaPreparation(projectId.current, body.data);
      setDraft(saved); changed.current = false; setDirty(false); setError('');
      try { Taro.removeStorageSync(key); } catch { /* A stale identical backup is ignored on the next load. */ }
      if (roleKey) {
        saved = await confirmRoleAppearance(projectId.current, { roleKey, scriptVersionId: saved.scriptVersionId, preparationRevision: saved.revision });
        setDraft(saved); setMessage('角色形象已确认，后续制作将引用这个版本。');
      } else setMessage('准备草稿已保存到云端。');
    } catch (failure) { setMessage(saved ? '准备已保存，形象确认暂未完成。请检查参考图有效期或刷新后重试。' : failure instanceof ApiError && failure.status === 409 ? '云端已有更新，本页修改已保留。请核对后再重新读取。' : '保存结果暂未确认，本页内容已保留，可再次保存确认。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function reload() {
    if (dirty && !(await Taro.showModal({ title: '重新读取云端草稿？', content: '本页尚未保存的修改将被云端版本替换。' })).confirm) return;
    await load(true);
  }
  const ready = !!draft && draft.revision > 0 && draft.roles.every(role => role.usage !== 'visual' || role.selection?.status === 'confirmed');
  async function organize() {
    if (!draft || !ready || changed.current || inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const plan = await organizeStoryboard(projectId.current, { scriptVersionId: draft.scriptVersionId, preparationRevision: draft.revision });
      await Taro.navigateTo({ url: `/pages/studio-drama-plan/index?id=${plan.id}&projectId=${projectId.current}` });
    } catch (error) { const detail = error instanceof ApiError && error.status === 400 ? ErrorBody.safeParse(error.body) : null; setMessage(detail?.success ? detail.data.message : '暂时无法整理分镜，请检查角色形象是否已确认且仍有效。重复整理不会扣费。'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <MobilePage notice="角色与场景准备 · 保存草稿不消耗积分"><View className="studio-screen ui-v2 drama-preparation">
    <View className="studio-form-body">
      <Text className="v2-eyebrow">2049出片 / 创作准备</Text><Text className="v2-project-heading">先认识故事里的主角</Text>
      <Text className="studio-small">从已确认剧本整理。核对出镜角色与声音，补充你希望的样子。</Text>
      {error && <View className="studio-preview-feedback"><Text>{error}</Text><Button onClick={() => { void reload(); }}>重新读取</Button></View>}
      {!draft && busy && <Text className="studio-small">正在整理准备草稿…</Text>}
      {draft && <>
        <View className="prep-section-heading"><Text className="studio-field-heading">角色</Text><Text className="studio-small">{draft.roles.length} 位 · 剧本版本 {draft.scriptVersionOrdinal}</Text></View>
        <Text className="prep-note">“仅配音”无需生成形象。这些是初步建议；无对白的出镜角色可以补充。</Text>
        {draft.roles.map((role, index) => <View className="prep-card" key={role.key}>
          <View className="prep-role-title"><Text className="prep-number">{String(index + 1).padStart(2, '0')}</Text>
            {role.key.startsWith('extra-') ? <Input value={role.name} disabled={busy} maxlength={100} placeholder="补充角色名称" onInput={event => edit({ ...draft, roles: draft.roles.map(item => item.key === role.key ? { ...item, name: event.detail.value } : item) })} /> : <Text className="studio-field-heading">{role.name}</Text>}
            {role.key.startsWith('extra-') && <Button className="studio-text-button" disabled={busy} onClick={() => edit({ ...draft, roles: draft.roles.filter(item => item.key !== role.key) })}>移除</Button>}
          </View>
          <View className="prep-options">{(['visual', 'voice_only'] as const).map(usage => <Button key={usage} disabled={busy} className={role.usage === usage ? 'is-active' : ''} onClick={() => edit({ ...draft, roles: draft.roles.map(item => item.key === role.key ? { ...item, usage, referenceMaterialId: usage === 'voice_only' ? null : item.referenceMaterialId } : item) })}>{usage === 'visual' ? '需要形象' : '仅配音'}</Button>)}</View>
          {role.evidence.length > 0 && <View className="prep-evidence"><Text className="studio-small">剧本依据</Text>{role.evidence.map((line, i) => <Text key={i}>{line}</Text>)}</View>}
          <Textarea className="prep-description" value={role.description} disabled={busy} maxlength={1000} placeholder={role.usage === 'visual' ? '补充外观、服装或标志特征，例如：橘猫，白色下巴，蓝色飞行围巾（选填）' : '补充声线、语气等要求（选填）'} onInput={event => edit({ ...draft, roles: draft.roles.map(item => item.key === role.key ? { ...item, description: event.detail.value } : item) })} />
          {role.usage === 'visual' && <View className="prep-reference">
            {role.referenceMaterialId && previews[role.referenceMaterialId]?.url && <Image className="prep-reference-image" mode="aspectFit" src={previews[role.referenceMaterialId].url!}
              onClick={() => { const url = previews[role.referenceMaterialId!]?.url; if (url) void Taro.previewImage({ current: url, urls: [url] }); }}
              onError={() => setPreviews(previous => ({ ...previous, [role.referenceMaterialId!]: { url: null, error: '预览链接可能已过期，请重新读取。' } }))} />}
            <Text className="studio-small">{role.selection?.status === 'confirmed' ? '已确认形象' : role.selection?.status === 'expired' ? '上次确认的参考图已过期' : role.referenceMaterialId ? '参考图待确认' : '选择一张清晰的单角色参考图'}</Text>
            {role.referenceMaterialId && previews[role.referenceMaterialId]?.error && <Text className="prep-note">{previews[role.referenceMaterialId].error}</Text>}
            <View className="prep-reference-actions"><Button disabled={busy} onClick={() => { void chooseReference(role.key); }}>{role.referenceMaterialId ? '更换参考图' : '选择参考图'}</Button>
              {role.referenceMaterialId && <Button disabled={busy} className="is-primary" onClick={() => { void save(role.key); }}>{role.selection?.status === 'confirmed' ? '确认此形象' : '采用此形象'}</Button>}
            </View>
            {role.referenceMaterialId && previews[role.referenceMaterialId]?.error && <Button className="studio-text-button" onClick={() => { void loadReference(role.referenceMaterialId!); }}>重新读取图片</Button>}
            {role.referenceMaterialId && <Button className="studio-text-button" disabled={busy} onClick={() => edit({ ...draft, roles: draft.roles.map(item => item.key === role.key ? { ...item, referenceMaterialId: null } : item) })}>移除本次参考图</Button>}
            <Text className="prep-note">参考图保留 7 天；上传与确认不消耗积分。</Text>
            <PortraitCandidates projectId={projectId.current} roleKey={role.key} revision={draft.revision} disabled={busy || dirty || draft.revision === 0} visible={visible} onSelect={chooseCandidate} />
          </View>}
        </View>)}
        <Button className="prep-add" disabled={busy || draft.roles.length >= 100} onClick={() => { void addRole(); }}>＋ 补充没有对白的角色</Button>
        <View className="prep-section-heading"><Text className="studio-field-heading">场景</Text><Text className="studio-small">{draft.scenes.length} 场</Text></View>
        {draft.scenes.map(scene => <View className="prep-card" key={scene.key}><Text className="studio-small">第 {scene.episodeNumber} 集 · 场景 {scene.sceneNumber}</Text><Text className="studio-field-heading">{scene.heading}</Text>
          <Textarea className="prep-description" value={scene.description} disabled={busy} maxlength={500} placeholder="补充环境、光线与氛围（选填）" onInput={event => edit({ ...draft, scenes: draft.scenes.map(item => item.key === scene.key ? { ...item, description: event.detail.value } : item) })} />
        </View>)}
        <Text className="prep-note">{ready ? '角色形象已准备好。接下来免费整理分镜草稿，再逐镜核对。' : '先保存准备并确认出镜角色形象，再整理分镜。仅配音角色无需参考图。'}</Text>
        <Button className="studio-text-button" disabled={busy} onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-plan/index?projectId=${projectId.current}` }); }}>查看已保存的分镜草稿</Button>
        <Button className="studio-text-button" disabled={busy} onClick={() => { void reload(); }}>重新读取云端草稿</Button>
        {message && <View className="studio-preview-feedback">{message}</View>}
        {message.includes('尚未归入场景') && <Button className="studio-text-button" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-project/index?id=${projectId.current}` }); }}>回到剧本，复用后调整</Button>}
      </>}
    </View>
    <View className="studio-bottom-action"><Text className="studio-small">{dirty ? '有修改，离开前请保存' : ready ? '按剧本段落整理，不消耗积分、不生成图片' : draft?.updatedAt ? '已保存到云端' : '免费保存准备草稿'}</Text>{ready && !dirty
      ? <View id="prep-organize"><Action disabled={busy} onClick={() => { void organize(); }}>{busy ? '正在整理…' : '整理分镜 · 免费'}</Action></View>
      : <Action disabled={!draft || busy} onClick={() => { void save(); }}>{busy ? '处理中…' : '保存准备'}</Action>}</View>
  </View></MobilePage>;
}
