import { useEffect, useRef, useState } from 'react';
import { Button, Image, Input, Text, Textarea, Video, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { DRAMA_IMAGE_PRICING, DRAMA_SHOT_VIDEO_PRICING } from '@wb/contracts';
import type { DramaExportAccessValue, DramaExportJobViewValue, DramaProjectViewValue, DramaProjectWorkflowValue, DramaShotVideoAccessValue, DramaStoryboardCandidateValue, DramaStoryboardShotValue } from '@wb/contracts';
import {
  createDramaExport,
  createDramaRole,
  createDramaScene,
  createDramaStoryboardCandidate,
  createDramaStoryboardShot,
  dramaExportMedia,
  dramaImageMedia,
  dramaShotVideoMedia,
  getDramaProject,
  getDramaProjectWorkflow,
  listDramaProjects,
  readDramaExport,
  readDramaImageJob,
  readDramaShotVideo,
  selectDramaStoryboardCandidate,
  submitDramaImageJob,
  submitDramaShotVideo,
  uploadMaterial,
} from '../../services/generation';
import { Action, Icon, PageHeader } from './shared';

type ComposerDraft = { shotId: string; roleVersionId: string; sceneVersionId: string; prompt: string };

function shotStatus(shot: DramaStoryboardShotValue) {
  if (shot.candidates.some(candidate => candidate.selectedAt)) return 'done';
  if (shot.candidates.some(candidate => candidate.imageJob?.status === 'accepted')) return 'working';
  if (shot.candidates.some(candidate => candidate.imageJob?.status === 'succeeded')) return 'ready';
  return 'waiting';
}

export function StoryboardScreen({ projectId, onBack }: { projectId: string | null; onBack: () => void }) {
  const [resolvedId, setResolvedId] = useState('');
  const [project, setProject] = useState<DramaProjectViewValue | null>(null);
  const [workflow, setWorkflow] = useState<DramaProjectWorkflowValue | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [videoAccess, setVideoAccess] = useState<Record<string, DramaShotVideoAccessValue>>({});
  const [videoMediaFailure, setVideoMediaFailure] = useState<Record<string, string>>({});
  const [exportJob, setExportJob] = useState<DramaExportJobViewValue | null>(null);
  const [exportAccess, setExportAccess] = useState<DramaExportAccessValue | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [roleDescription, setRoleDescription] = useState('');
  const [roleReference, setRoleReference] = useState<{ id: string; path: string } | null>(null);
  const [roleUploading, setRoleUploading] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(false);
  const [sceneName, setSceneName] = useState('');
  const [sceneDescription, setSceneDescription] = useState('');
  const [shotOpen, setShotOpen] = useState(false);
  const [shotEpisode, setShotEpisode] = useState('1');
  const [shotScene, setShotScene] = useState('1');
  const [shotPrompt, setShotPrompt] = useState('');
  const [composer, setComposer] = useState<ComposerDraft | null>(null);
  const workflowRef = useRef<DramaProjectWorkflowValue | null>(null);
  const mediaRef = useRef<Record<string, string>>({});
  const mediaMissRef = useRef<Set<string>>(new Set());
  const videoAccessRef = useRef<Record<string, DramaShotVideoAccessValue>>({});
  const videoMediaFailureRef = useRef<Record<string, string>>({});

  useEffect(() => { workflowRef.current = workflow; }, [workflow]);

  useEffect(() => {
    const selectedVideoJobs = workflow?.shots.filter(shot => shot.episodeNumber === 1)
      .flatMap(shot => shot.candidates.filter(candidate => candidate.selectedAt && candidate.videoJob).map(candidate => candidate.videoJob!)) ?? [];
    if (selectedVideoJobs.some(job => job.status === 'succeeded')) {
      setMessage(current => current.startsWith('逐镜视频已受理') ? '逐镜视频已发布' : current);
    } else if (selectedVideoJobs.some(job => job.status === 'failed')) {
      setMessage(current => current.startsWith('逐镜视频已受理') ? '逐镜视频生成失败，可重试' : current);
    }
  }, [workflow]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let id = projectId;
        if (!id) {
          const list = await listDramaProjects();
          id = list.items.find(item => item.activeVersion)?.id ?? null;
        }
        if (!id) {
          if (active) setError('还没有可进入分镜的项目，请先在创作页保存剧本项目。');
          return;
        }
        const [loadedProject, loadedWorkflow] = await Promise.all([getDramaProject(id), getDramaProjectWorkflow(id)]);
        if (!active) return;
        setResolvedId(id);
        setProject(loadedProject);
        setWorkflow(loadedWorkflow);
      } catch {
        if (active) setError('分镜工作台加载失败，请返回重试。');
      }
    })();
    return () => { active = false; };
  }, [projectId]);

  function report(text: string) { setMessage(text); }

  async function refresh(): Promise<DramaProjectWorkflowValue | null> {
    if (!resolvedId) return null;
    try {
      const current = await getDramaProjectWorkflow(resolvedId);
      setWorkflow(current);
      return current;
    } catch { return null; }
  }

  async function loadMedia(jobId: string) {
    if (mediaRef.current[jobId] || mediaMissRef.current.has(jobId)) return;
    try {
      const access = await dramaImageMedia(jobId);
      mediaRef.current = { ...mediaRef.current, [jobId]: access.url };
      setMedia(mediaRef.current);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 410)) mediaMissRef.current.add(jobId);
    }
  }

  async function loadVideoMedia(jobId: string, force = false) {
    const current = videoAccessRef.current[jobId];
    if (!force && current && Date.parse(current.urlExpiresAt) > Date.now() + 15_000) return;
    try {
      const access = await dramaShotVideoMedia(jobId);
      videoAccessRef.current = { ...videoAccessRef.current, [jobId]: access };
      const failures = { ...videoMediaFailureRef.current };
      delete failures[jobId];
      videoMediaFailureRef.current = failures;
      setVideoAccess(videoAccessRef.current);
      setVideoMediaFailure(failures);
    } catch (error) {
      const failure = error instanceof ApiError && error.status === 410 ? '逐镜视频已过期' : '逐镜视频素材暂不可访问';
      videoMediaFailureRef.current = { ...videoMediaFailureRef.current, [jobId]: failure };
      setVideoMediaFailure(videoMediaFailureRef.current);
    }
  }

  // 轮询：未完成作业每 2.5 秒复查；成功的候选补拉媒体短链，直到全部落定。
  useEffect(() => {
    if (!resolvedId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const current = workflowRef.current;
      if (current) {
        const jobs = current.shots.flatMap(shot => shot.candidates).flatMap(candidate => candidate.imageJob ? [candidate.imageJob] : []);
        const accepted = jobs.filter(job => job.status === 'accepted').map(job => job.id);
        const missingMedia = jobs.filter(job => job.status === 'succeeded' && !mediaRef.current[job.id] && !mediaMissRef.current.has(job.id)).map(job => job.id);
        let changed = false;
        for (const jobId of accepted) {
          try {
            const job = await readDramaImageJob(jobId);
            if (job.status !== 'accepted') {
              changed = true;
              setMessage(job.status === 'succeeded' ? '候选图已发布，可继续生成逐镜视频' : '候选图生成失败，可重新生成');
            }
          } catch { /* transient */ }
        }
        for (const jobId of missingMedia) await loadMedia(jobId);
        const selectedVideoJobs = current.shots.flatMap(shot => shot.episodeNumber === 1
          ? shot.candidates.filter(candidate => candidate.selectedAt && candidate.videoJob).map(candidate => candidate.videoJob!) : []);
        const acceptedVideoJobs = selectedVideoJobs.filter(job => job.status === 'accepted').map(job => job.id);
        const missingVideoMedia = selectedVideoJobs.filter(job => job.status === 'succeeded' &&
          (!videoAccessRef.current[job.id] || Date.parse(videoAccessRef.current[job.id].urlExpiresAt) <= Date.now() + 15_000) &&
          !videoMediaFailureRef.current[job.id]).map(job => job.id);
        for (const jobId of acceptedVideoJobs) {
          try {
            const job = await readDramaShotVideo(jobId);
            if (job.status !== 'accepted') {
              changed = true;
              setMessage(job.status === 'succeeded' ? '逐镜视频已发布' : '逐镜视频生成失败，可重试');
            }
          } catch { /* transient */ }
        }
        for (const jobId of missingVideoMedia) await loadVideoMedia(jobId);
        if (changed) {
          try { setWorkflow(await getDramaProjectWorkflow(resolvedId)); } catch { /* transient */ }
        }
        if (!active) return;
        if (accepted.length || missingMedia.length || acceptedVideoJobs.length || missingVideoMedia.length || changed) timer = setTimeout(() => { void tick(); }, 2500);
      } else if (active) {
        timer = setTimeout(() => { void tick(); }, 1000);
      }
    };
    timer = setTimeout(() => { void tick(); }, 1000);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [resolvedId, workflow]);

  useEffect(() => {
    if (!exportJob || exportJob.status !== 'accepted') return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const current = await readDramaExport(exportJob.id);
        if (!active) return;
        setExportJob(current);
        if (current.status === 'succeeded') {
          setMessage('成片已生成，可播放或下载');
          setExportAccess(await dramaExportMedia(current.id));
        } else if (current.status === 'failed') {
          setMessage('成片合成失败，请检查镜头素材后重试');
        }
      } catch { /* transient */ }
    }, 2500);
    return () => { active = false; clearTimeout(timer); };
  }, [exportJob]);

  async function pickRoleReference() {
    if (roleUploading) return;
    const chosen = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] }).catch(() => null);
    const path = chosen?.tempFilePaths[0];
    if (!path) return;
    setRoleUploading(true);
    try {
      const material = await uploadMaterial(path);
      setRoleReference({ id: material.id, path });
      report('参考图已上传，7 天内可用于角色一致性生成');
    } catch { report('参考图上传失败，请重试'); }
    finally { setRoleUploading(false); }
  }

  async function saveRole() {
    if (busy || !resolvedId) return;
    if (!roleName.trim() || !roleDescription.trim()) { report('请填写角色名称与外观描述'); return; }
    if (!roleReference) { report('请先上传角色参考图'); return; }
    setBusy(true);
    try {
      await createDramaRole(resolvedId, { name: roleName.trim(), description: roleDescription.trim(), referenceMaterialId: roleReference.id });
      setRoleOpen(false); setRoleName(''); setRoleDescription(''); setRoleReference(null);
      await refresh();
      report('角色已保存，镜头候选会引用该版本');
    } catch { report('角色保存失败，请检查网络后重试'); }
    finally { setBusy(false); }
  }

  async function saveScene() {
    if (busy || !resolvedId) return;
    if (!sceneName.trim() || !sceneDescription.trim()) { report('请填写场景名称与描述'); return; }
    setBusy(true);
    try {
      await createDramaScene(resolvedId, { name: sceneName.trim(), description: sceneDescription.trim() });
      setSceneOpen(false); setSceneName(''); setSceneDescription('');
      await refresh();
      report('场景已保存');
    } catch { report('场景保存失败，请检查网络后重试'); }
    finally { setBusy(false); }
  }

  async function saveShot() {
    if (busy || !resolvedId) return;
    if (!/^[1-9]\d*$/.test(shotEpisode) || !/^[1-9]\d*$/.test(shotScene)) { report('集数与场景必须是正整数'); return; }
    if (!shotPrompt.trim()) { report('请填写镜头提示词'); return; }
    setBusy(true);
    try {
      await createDramaStoryboardShot(resolvedId, { episodeNumber: Number(shotEpisode), sceneNumber: Number(shotScene), prompt: shotPrompt.trim() });
      setShotOpen(false); setShotPrompt('');
      await refresh();
      report('镜头已创建，可生成候选图');
    } catch (error) {
      report(error instanceof ApiError && error.status === 409 ? '该集数场景已存在，请调整编号' : '镜头保存失败，请检查网络后重试');
    } finally { setBusy(false); }
  }

  function openComposer(shot: DramaStoryboardShotValue) {
    const roles = workflow?.roles ?? [];
    const scenes = workflow?.scenes ?? [];
    if (!roles.length || !scenes.length) { report('请先添加至少一个角色和一个场景'); return; }
    setComposer({ shotId: shot.id, roleVersionId: composer?.shotId === shot.id ? composer.roleVersionId : roles[0].latestVersion.id,
      sceneVersionId: composer?.shotId === shot.id ? composer.sceneVersionId : scenes[0].latestVersion.id,
      prompt: composer?.shotId === shot.id ? composer.prompt : shot.prompt });
  }

  async function generate(draft: ComposerDraft) {
    if (busy) return;
    if (!draft.roleVersionId || !draft.sceneVersionId) { report('请选择角色与场景'); return; }
    if (!draft.prompt.trim()) { report('请填写镜头提示词'); return; }
    setBusy(true);
    try {
      const candidate = await createDramaStoryboardCandidate(draft.shotId, { roleVersionId: draft.roleVersionId, sceneVersionId: draft.sceneVersionId, prompt: draft.prompt.trim() });
      await submitDramaImageJob(candidate.id);
      setComposer(null);
      const refreshed = await refresh();
      const imageStatus = refreshed?.shots.flatMap(shot => shot.candidates).find(item => item.id === candidate.id)?.imageJob?.status;
      report(imageStatus === 'succeeded' ? '候选图已发布，可选择后生成逐镜视频'
        : imageStatus === 'failed' ? '候选图生成失败，失败已退款，可重新生成'
        : `候选已受理，预留 ${DRAMA_IMAGE_PRICING.credits} 积分 · 失败自动退还`);
    } catch (error) {
      await refresh();
      report(error instanceof ApiError && error.status === 402 ? '积分不足，无法预留生成费用'
        : error instanceof ApiError && error.status === 503 ? '图像受理暂未开放'
        : '候选提交未确认，可在候选列表中继续确认，不会重复预留');
    } finally { setBusy(false); }
  }

  async function retryCandidate(candidate: DramaStoryboardCandidateValue) {
    if (busy) return;
    setBusy(true);
    try {
      await submitDramaImageJob(candidate.id);
      const refreshed = await refresh();
      const imageStatus = refreshed?.shots.flatMap(shot => shot.candidates).find(item => item.id === candidate.id)?.imageJob?.status;
      report(imageStatus === 'succeeded' ? '候选图已发布，可选择后生成逐镜视频'
        : imageStatus === 'failed' ? '候选图生成失败，失败已退款，可重试'
        : `候选已重新受理，预留 ${DRAMA_IMAGE_PRICING.credits} 积分 · 失败自动退还`);
    } catch (error) {
      report(error instanceof ApiError && error.status === 402 ? '积分不足，无法预留生成费用' : '提交未确认，可稍后重试');
    } finally { setBusy(false); }
  }

  async function select(candidate: DramaStoryboardCandidateValue) {
    if (busy) return;
    setBusy(true);
    try {
      await selectDramaStoryboardCandidate(candidate.id);
      await refresh();
      report('已选定该候选，其余候选仍保留可回溯');
    } catch { report('选择失败，请重试'); }
    finally { setBusy(false); }
  }

  async function generateShotVideo(candidate: DramaStoryboardCandidateValue) {
    if (busy || !candidate.selectedAt) return;
    setBusy(true);
    try {
      const job = await submitDramaShotVideo(candidate.id);
      setWorkflow(current => current && ({ ...current, shots: current.shots.map(shot => ({ ...shot,
        candidates: shot.candidates.map(item => item.id === candidate.id
          ? { ...item, videoJob: { id: job.id, status: job.status, failureCode: job.failureCode } } : item),
      })) }));
      const refreshed = await refresh();
      const currentJob = refreshed?.shots.flatMap(shot => shot.candidates).find(item => item.id === candidate.id)?.videoJob;
      report(currentJob?.status === 'accepted' || (!currentJob && job.status === 'accepted')
        ? `逐镜视频已受理，预留 ${DRAMA_SHOT_VIDEO_PRICING.credits} 积分 · 失败自动退还`
        : currentJob?.status === 'succeeded' || job.status === 'succeeded' ? '逐镜视频已发布'
        : `逐镜视频失败（${currentJob?.failureCode ?? job.failureCode ?? '未知原因'}），可重试`);
    } catch (error) {
      report(error instanceof ApiError && error.status === 402 ? '积分不足，无法预留逐镜视频费用'
        : error instanceof ApiError && error.status === 409 ? '候选已变更或候选图未发布，请刷新并重新选择可用候选'
        : error instanceof ApiError && error.status === 503 ? '逐镜视频受理暂未开放'
        : '提交状态尚未确认，可重试；相同请求会沿用幂等键');
    } finally { setBusy(false); }
  }

  async function refreshVideoLink(jobId: string) {
    await loadVideoMedia(jobId, true);
  }

  async function exportEpisode() {
    if (busy || !resolvedId) return;
    setBusy(true);
    try {
      const job = await createDramaExport(resolvedId, 1);
      setExportJob(job);
      setExportAccess(job.status === 'succeeded' ? await dramaExportMedia(job.id) : null);
      report(job.status === 'accepted' ? '成片合成已受理，正在生成字幕与 AI 标识' : job.status === 'succeeded' ? '成片已生成，可播放或下载' : '本次导出失败，请检查镜头素材后重试');
    } catch (error) {
      report(error instanceof ApiError && error.status === 409 ? '每个已选定镜头都需要先完成逐镜视频生成，暂不能导出成片'
        : '导出提交未确认，可稍后重试，不会重复创建版本');
    } finally { setBusy(false); }
  }

  async function downloadExport() {
    if (!exportJob || exportJob.status !== 'succeeded') return;
    try {
      const access = await dramaExportMedia(exportJob.id);
      setExportAccess(access);
      await Taro.downloadFile({ url: access.url });
      report('成片已开始下载；短时访问链接会自动刷新');
    } catch { report('下载链接已失效或网络异常，请重试'); }
  }

  const shots = workflow?.shots.filter(shot => shot.episodeNumber === 1) ?? [];
  const completed = shots.filter(shot => shot.candidates.some(candidate => candidate.selectedAt)).length;
  const selectedCandidates = shots.map(shot => shot.candidates.find(candidate => candidate.selectedAt) ?? null);
  const allSelected = shots.length > 0 && selectedCandidates.every(Boolean);
  const publishedVideoCount = selectedCandidates.filter(candidate => candidate?.videoJob?.status === 'succeeded' &&
    !!videoAccess[candidate.videoJob.id]).length;
  const videosReady = allSelected && publishedVideoCount === shots.length;
  const videoJobsPending = selectedCandidates.some(candidate => candidate?.videoJob?.status === 'accepted');

  function candidateTile(shot: DramaStoryboardShotValue, candidate: DramaStoryboardCandidateValue) {
    const job = candidate.imageJob;
    if (job?.status === 'succeeded') {
      const url = media[job.id];
      return (
        <Button key={candidate.id} className={`studio-candidate ${candidate.selectedAt ? 'is-active' : ''}`}
          aria-label={`选择候选${candidate.ordinal}`} onClick={() => { void select(candidate); }}>
          {url ? <Image className="studio-cover" src={url} mode="aspectFill" /> : <Text className="studio-small">加载中</Text>}
          {candidate.selectedAt && <Text>✓</Text>}
        </Button>
      );
    }
    if (job?.status === 'failed') {
      return <View key={candidate.id} className="studio-candidate studio-candidate--failed"><Text className="studio-small">失败</Text></View>;
    }
    if (job?.status === 'accepted') {
      return <View key={candidate.id} className="studio-candidate studio-candidate--pending"><Text className="studio-small">生成中</Text></View>;
    }
    return (
      <Button key={candidate.id} className="studio-candidate studio-candidate--pending"
        onClick={() => { void retryCandidate(candidate); }}>
        <Text className="studio-small">继续{'\n'}生成</Text>
      </Button>
    );
  }

  return (
    <View className="studio-screen studio-storyboard" data-testid="studio-storyboard">
      <PageHeader title={project ? `${project.title}  第1集` : '分镜工作台'} onBack={onBack} detail="···" />
      <View className="studio-story-body">
        <View className="studio-steps">
          {['剧本', '角色', '分镜', '成片'].map((label, index) => (
            <View key={label} className={`studio-step ${index < 3 ? 'is-reached' : ''} ${index === 2 ? 'is-current' : ''}`}>
              <View className="studio-step-track">
                <Text className="studio-step-number">{index < 2 ? '✓' : index + 1}</Text>
              </View>
              <Text>{label}</Text>
            </View>
          ))}
        </View>
        {!workflow && !error && <Text className="studio-works-footer">正在加载分镜工作台…</Text>}
        {error && <View className="studio-preview-feedback"><Text>{error}</Text>
          <Button className="studio-text-button" onClick={onBack}>返回</Button></View>}
        {message && <View className="studio-preview-feedback">{message}</View>}
        {workflow && <>
          <View className="studio-story-heading">
            <View>
              <Text className="studio-field-heading">角色设定</Text>
              <Text className="studio-small">绑定参考图与外观描述，生成时按版本锁定</Text>
            </View>
            <Button className="studio-add-shot" onClick={() => setRoleOpen(!roleOpen)}><Icon name="plus" />添加角色</Button>
          </View>
          {workflow.roles.length > 0 && <View className="studio-asset-list">
            {workflow.roles.map(role => (
              <View key={role.id} className="studio-asset-row">
                <View><Text>{role.name}</Text><Text className="studio-small">{role.latestVersion.description}</Text></View>
                <Text className="studio-small">参考图 {role.latestVersion.referenceSha256.slice(0, 8)}</Text>
              </View>
            ))}
          </View>}
          {roleOpen && <View className="studio-plan-form">
            <Text className="studio-field-title">新角色</Text>
            {roleReference && <Image className="studio-plan-preview" src={roleReference.path} mode="aspectFill" />}
            <Button className="studio-add-shot" disabled={roleUploading} onClick={() => { void pickRoleReference(); }}>
              <Icon name="plus" />{roleUploading ? '上传中…' : roleReference ? '重新选择参考图' : '上传参考图（必填）'}
            </Button>
            <Input className="drama-title-input" value={roleName} maxlength={100} placeholder="角色名称，如：林夏"
              onInput={event => setRoleName(event.detail.value)} />
            <Textarea className="drama-content-input" value={roleDescription} maxlength={2000} placeholder="外观描述：发型、服装、标志性特征…"
              onInput={event => setRoleDescription(event.detail.value)} />
            <View className="studio-plan-actions">
              <Button className="studio-text-button" onClick={() => setRoleOpen(false)}>取消</Button>
              <Button className="studio-plan-confirm" disabled={busy} onClick={() => { void saveRole(); }}>保存角色</Button>
            </View>
          </View>}
          <View className="studio-story-heading studio-characters-heading">
            <View>
              <Text className="studio-field-heading">场景设定</Text>
              <Text className="studio-small">镜头候选将引用所选场景版本</Text>
            </View>
            <Button className="studio-add-shot" onClick={() => setSceneOpen(!sceneOpen)}><Icon name="plus" />添加场景</Button>
          </View>
          {workflow.scenes.length > 0 && <View className="studio-asset-list">
            {workflow.scenes.map(scene => (
              <View key={scene.id} className="studio-asset-row">
                <View><Text>{scene.name}</Text><Text className="studio-small">{scene.latestVersion.description}</Text></View>
              </View>
            ))}
          </View>}
          {sceneOpen && <View className="studio-plan-form">
            <Text className="studio-field-title">新场景</Text>
            <Input className="drama-title-input" value={sceneName} maxlength={100} placeholder="场景名称，如：雨夜车站"
              onInput={event => setSceneName(event.detail.value)} />
            <Textarea className="drama-content-input" value={sceneDescription} maxlength={2000} placeholder="环境描述：时间、光线、氛围…"
              onInput={event => setSceneDescription(event.detail.value)} />
            <View className="studio-plan-actions">
              <Button className="studio-text-button" onClick={() => setSceneOpen(false)}>取消</Button>
              <Button className="studio-plan-confirm" disabled={busy} onClick={() => { void saveScene(); }}>保存场景</Button>
            </View>
          </View>}
          <View className="studio-story-heading studio-characters-heading">
            <View>
              <Text className="studio-field-heading">分镜工作台</Text>
              <Text className="studio-small">候选图每张预留 {DRAMA_IMAGE_PRICING.credits} 积分，失败自动退还</Text>
            </View>
            <Button className="studio-add-shot" onClick={() => setShotOpen(!shotOpen)}><Icon name="plus" />添加镜头</Button>
          </View>
          {shotOpen && <View className="studio-plan-form">
            <Text className="studio-field-title">新镜头</Text>
            <View className="studio-plan-row">
              <Input className="drama-episodes-input" type="number" value={shotEpisode} maxlength={2} placeholder="集数"
                onInput={event => setShotEpisode(event.detail.value)} />
              <Input className="drama-episodes-input" type="number" value={shotScene} maxlength={2} placeholder="场景号"
                onInput={event => setShotScene(event.detail.value)} />
            </View>
            <Textarea className="drama-content-input" value={shotPrompt} maxlength={3000} placeholder="镜头提示词：景别、动作、情绪…"
              onInput={event => setShotPrompt(event.detail.value)} />
            <View className="studio-plan-actions">
              <Button className="studio-text-button" onClick={() => setShotOpen(false)}>取消</Button>
              <Button className="studio-plan-confirm" disabled={busy} onClick={() => { void saveShot(); }}>保存镜头</Button>
            </View>
          </View>}
          {shots.length === 0 && <Text className="studio-small">还没有镜头。先添加角色和场景，再创建镜头并生成候选图。</Text>}
          <View className="studio-shot-list">
            {shots.map((shot, index) => {
              const status = shotStatus(shot);
              const selected = shot.candidates.find(candidate => candidate.selectedAt);
              const selectedUrl = selected?.imageJob?.status === 'succeeded' ? media[selected.imageJob.id] : undefined;
              const videoJob = selected?.videoJob;
              const selectedVideo = videoJob ? videoAccess[videoJob.id] : undefined;
              const videoFailure = videoJob ? videoMediaFailure[videoJob.id] : undefined;
              return (
                <View className="studio-shot" key={shot.id} data-testid={`studio-shot-${shot.episodeNumber}-${shot.sceneNumber}`}>
                  <View className="studio-shot-main">
                    <View className="studio-shot-image">
                      {selectedUrl ? <Image className="studio-cover" src={selectedUrl} mode="aspectFill" />
                        : <Text className="studio-small">待生成</Text>}
                      <Text className="studio-shot-number">0{index + 1}</Text>
                    </View>
                    <View className="studio-shot-copy">
                      <View className="studio-shot-top">
                        <Text className="studio-small">shot 0{index + 1}</Text>
                        <Text className="studio-small">第{shot.episodeNumber}集 · 场景{shot.sceneNumber}</Text>
                      </View>
                      <View className="studio-shot-name">
                        <Text>镜头 {shot.episodeNumber}-{shot.sceneNumber}</Text>
                        <Text className={`studio-status studio-status--${status === 'ready' ? 'working' : status}`}>
                          {status === 'done' ? '✓ 已选定' : status === 'working' ? '◌ 生成中' : status === 'ready' ? '◌ 待选择' : '◌ 待生成'}
                        </Text>
                      </View>
                      <Text className="studio-shot-description">{shot.prompt}</Text>
                    </View>
                  </View>
                  <View className="studio-candidates">
                    <Text className="studio-small">候选 {shot.candidates.length} 个{selected ? ' · 已选定 1 个' : ''}</Text>
                    <Button className="studio-candidate-label" disabled={busy} onClick={() => openComposer(shot)}>
                      <Icon name="refresh" />{shot.candidates.length ? '再次生成' : '生成候选'}
                    </Button>
                  </View>
                  {shot.candidates.length > 0 && <View className="studio-candidate-grid">
                    {shot.candidates.map(candidate => candidateTile(shot, candidate))}
                  </View>}
                  <View className="studio-shot-video" data-testid={`studio-shot-video-${shot.episodeNumber}-${shot.sceneNumber}`}>
                    <Text className="studio-small">逐镜视频</Text>
                    {!selected && <Text className="studio-small">先选定一张已发布的候选图</Text>}
                    {selected && selected.imageJob?.status !== 'succeeded' && <Text className="studio-small">所选候选图尚未成功发布，暂不能生成视频</Text>}
                    {selected && selected.imageJob?.status === 'succeeded' && !videoJob &&
                      <Button className="studio-candidate-label" disabled={busy} onClick={() => { void generateShotVideo(selected); }}>生成逐镜视频</Button>}
                    {videoJob?.status === 'accepted' && <Text className="studio-small">◌ 逐镜视频生成中</Text>}
                    {videoJob?.status === 'failed' && <View className="studio-shot-video-failed">
                      <Text className="studio-small">逐镜视频失败：{videoJob.failureCode ?? '生成失败'} · 失败已退款</Text>
                      <Button className="studio-candidate-label" disabled={busy} onClick={() => { if (selected) void generateShotVideo(selected); }}>重试逐镜视频</Button>
                    </View>}
                    {videoJob?.status === 'succeeded' && selectedVideo && <Video className="studio-shot-video-player" src={selectedVideo.url} controls onError={() => { void refreshVideoLink(videoJob.id); }} />}
                    {videoJob?.status === 'succeeded' && !selectedVideo && !videoFailure && <Text className="studio-small">视频已发布，正在获取短时播放链接…</Text>}
                    {videoJob?.status === 'succeeded' && !selectedVideo && videoFailure && <View className="studio-shot-video-failed">
                      <Text className="studio-small">{videoFailure}，暂不能导出</Text>
                      <View className="studio-plan-actions">
                        <Button className="studio-candidate-label" disabled={busy} onClick={() => { void refreshVideoLink(videoJob.id); }}>重试访问链接</Button>
                        <Button className="studio-candidate-label" disabled={busy} onClick={() => { if (selected) void generateShotVideo(selected); }}>重新生成视频</Button>
                      </View>
                    </View>}
                  </View>
                  {composer?.shotId === shot.id && <View className="studio-plan-form">
                    <Text className="studio-field-title">候选计划</Text>
                    <Text className="studio-small">角色</Text>
                    <View className="drama-choices">
                      {workflow.roles.map(role => (
                        <Button key={role.id} className={`drama-choice ${composer.roleVersionId === role.latestVersion.id ? 'is-active' : ''}`}
                          onClick={() => setComposer({ ...composer, roleVersionId: role.latestVersion.id })}>{role.name}</Button>
                      ))}
                    </View>
                    <Text className="studio-small">场景</Text>
                    <View className="drama-choices">
                      {workflow.scenes.map(scene => (
                        <Button key={scene.id} className={`drama-choice ${composer.sceneVersionId === scene.latestVersion.id ? 'is-active' : ''}`}
                          onClick={() => setComposer({ ...composer, sceneVersionId: scene.latestVersion.id })}>{scene.name}</Button>
                      ))}
                    </View>
                    <Textarea className="drama-content-input" value={composer.prompt} maxlength={3000} placeholder="镜头提示词"
                      onInput={event => setComposer({ ...composer, prompt: event.detail.value })} />
                    <Text className="studio-small">提交后预留 {DRAMA_IMAGE_PRICING.credits} 积分 · 失败自动退还 · 重做会产生新候选，原候选保留</Text>
                    <View className="studio-plan-actions">
                      <Button className="studio-text-button" onClick={() => setComposer(null)}>取消</Button>
                      <Button className="studio-plan-confirm" disabled={busy} onClick={() => { void generate(composer); }}>生成候选图</Button>
                    </View>
                  </View>}
                </View>
              );
            })}
          </View>
        </>}
      </View>
      <View className="studio-bottom-action">
        <View className="studio-completion">
          <Text><Text className="studio-completion-number">{completed}/{shots.length || 0}</Text> 个镜头已选定候选</Text>
          <Text className="studio-small"><Text className="studio-completion-number">{publishedVideoCount}/{shots.length || 0}</Text> 个逐镜视频已发布</Text>
          <View className="studio-completion-track">
            <View style={{ width: `${shots.length ? Math.round((completed / shots.length) * 100) : 0}%` }} />
          </View>
          {exportJob?.status === 'accepted' && <Text className="studio-small">成片合成中，完成后将自动刷新</Text>}
          {exportJob?.status === 'failed' && <Text className="studio-small">成片合成失败，请检查镜头素材后重试</Text>}
          {exportAccess && <><Video className="studio-export-video" src={exportAccess.url} controls />
            <Text className="studio-small">成片访问至 {new Date(exportAccess.expiresAt).toLocaleString()}，链接每次播放/下载会刷新</Text></>}
        </View>
        {videosReady ? <Action disabled={busy || exportJob?.status === 'accepted'} onClick={() => { void exportEpisode(); }}>
          {exportJob?.status === 'accepted' ? '成片合成中…' : exportJob?.status === 'succeeded' ? '重新导出成片' : '导出成片'} <Icon name="arrow" />
        </Action> : allSelected ? <Action disabled onClick={() => {}}>
          {videoJobsPending ? '逐镜视频生成中…' : '完成逐镜视频后可导出'} <Icon name="arrow" />
        </Action> : <Action disabled={busy || !shots.length} onClick={() => {
          const next = shots.find(shot => !shot.candidates.some(candidate => candidate.selectedAt));
          if (next) openComposer(next);
        }}>
          生成待完成镜头 <Icon name="arrow" />
        </Action>}
        {exportAccess && <Button className="studio-text-button" onClick={() => { void downloadExport(); }}>下载成片</Button>}
      </View>
    </View>
  );
}
