import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useLoad } from '@tarojs/taro';
import { ApiError } from '@wb/api-client';
import { dramaEpisodeCoverage, ErrorBody, ErrorCode } from '@wb/contracts';
import type { DramaProjectViewValue, DramaScriptJobViewValue, DramaScriptVersionValue, DramaScriptQuoteValue } from '@wb/contracts';
import type { ScriptBatchValue, ScriptBatchQuoteValue } from '@wb/contracts';
import { MobilePage } from '../../features/studio/MobilePage';
import { Action, Icon } from '../../features/studio/shared';
import { confirmDramaScript, getDramaProject, getDramaScript, latestDramaScriptJob, pendingDramaScript, quoteDramaScript, submitDramaScript } from '../../services/generation';
import { latestScriptBatch, latestStoryboardPlan, newRequestKey, pendingScriptBatch, quoteScriptBatch, submitScriptBatch } from '../../services/generation';

const scriptFailureMessages: Record<string, string> = {
  SCRIPT_OUTPUT_INCOMPLETE: '剧本没有完整生成，原有内容已保留。',
  SCRIPT_OUTPUT_EMPTY: '这次没有生成剧本正文，原有内容已保留。',
  SCRIPT_OUTPUT_TOO_LONG: '剧本超出当前长度限制，未替换原有内容。',
  SCRIPT_PROJECT_CONFIRMED: '项目已有确认版本，本次输出未覆盖它。',
  SCRIPT_MOCK_DISABLED: '开发模拟生成尚未开放。',
  SCRIPT_PROVIDER_REJECTED: '生成服务未受理本次请求，原有内容已保留。',
};

function ScriptReading({ content }: { content: string }) {
  return <View className="v2-script-content">{content.split(/\r?\n/).map((line, index) => {
    const episode = /^##\s+/.test(line);
    const scene = /^\*\*场景.*\*\*$/.test(line);
    const text = episode ? line.replace(/^##\s+/, '') : scene ? line.slice(2, -2) : line;
    return <Text key={index} className={episode ? 'v2-script-episode' : scene ? 'v2-script-scene' : 'v2-script-line'}>{text || '\u00a0'}</Text>;
  })}</View>;
}

export default function DramaProject() {
  const [project, setProject] = useState<DramaProjectViewValue | null>(null);
  const [job, setJob] = useState<DramaScriptJobViewValue | null>(null);
  const [draft, setDraft] = useState<DramaScriptVersionValue | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);
  const [quote, setQuote] = useState<DramaScriptQuoteValue | null>(null);
  const [pending, setPending] = useState(false);
  const [batch, setBatch] = useState<ScriptBatchValue | null>(null);
  const [batchQuote, setBatchQuote] = useState<ScriptBatchQuoteValue | null>(null);
  const [batchPending, setBatchPending] = useState(false);
  const projectId = useRef('');
  const loading = useRef(false);
  const submitting = useRef(false);
  async function refresh() {
    if (!projectId.current || loading.current) return;
    loading.current = true;
    try {
      const current = await getDramaProject(projectId.current); setProject(current); setDraft(current.activeVersion); setError('');
      const currentJob = await latestDramaScriptJob(projectId.current); setJob(currentJob);
      const currentBatch = await latestScriptBatch(projectId.current); setBatch(currentBatch);
      const scriptId = current.scriptId ?? currentBatch?.draftScriptId ?? (!currentBatch ? currentJob?.draftScriptId : null);
      if (scriptId && current.confirmedVersionId !== current.activeVersionId) setDraft((await getDramaScript(scriptId)).latestVersion);
      else if (!current.activeVersion && scriptId) setDraft((await getDramaScript(scriptId)).latestVersion);
      else setDraft(current.activeVersion);
      setPending(!!pendingDramaScript(current.id));
      setBatchPending(!!pendingScriptBatch(current.id));
      if (!current.confirmedVersionId && current.mode === 'idea' && currentBatch?.status !== 'accepted') {
        try { setBatchQuote(await quoteScriptBatch(current.id)); } catch { setBatchQuote(null); }
      }
      if (!current.activeVersion && currentJob?.status !== 'accepted') {
        try { setQuote(await quoteDramaScript(current.id)); }
        catch { setQuote(null); }
      }
    } catch { setError('项目或剧本状态暂时无法读取，请刷新重试。'); }
    finally { loading.current = false; }
  }
  useLoad(params => {
    if (typeof params.id !== 'string') { setError('项目地址无效。'); return; }
    projectId.current = params.id; void refresh();
  });
  useDidShow(() => { setVisible(true); void refresh(); });
  useDidHide(() => setVisible(false));
  useEffect(() => {
    if (!visible || job?.status !== 'accepted' && batch?.status !== 'accepted') return;
    const timer = setInterval(() => { void refresh(); }, 2500);
    return () => clearInterval(timer);
  }, [visible, job?.status, batch?.status]);

  async function continueProduction() {
    if (!project || submitting.current) return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      const plan = await latestStoryboardPlan(project.id);
      const url = plan?.current && plan.scriptVersionId === project.confirmedVersionId
        ? `/pages/studio-drama-plan/index?id=${plan.id}`
        : `/pages/studio-drama-prepare/index?id=${project.id}`;
      await Taro.navigateTo({ url });
    } catch { setMessage('制作进度暂时无法读取，请重试。已有剧本和分镜已保留。'); }
    finally { submitting.current = false; setBusy(false); }
  }

  async function generateBatch() {
    if (!project || submitting.current || batch?.status === 'accepted') return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      let request = pendingScriptBatch(project.id);
      if (!request) {
        const current = await quoteScriptBatch(project.id); setBatchQuote(current);
        if (current.mode === 'disabled' || !current.version) { setMessage('剧本制作暂不可用，已有内容已保留。'); return; }
        const result = await Taro.showModal({ title: `生成剩余 ${current.toGenerate.length} 集剧本？`, content: `${current.reusedEpisodes.length ? `保留已完成 ${current.reusedEpisodes.length} 集。` : ''}${current.mode === 'mock' ? '开发模拟固定结构，不是AI创作，不扣积分。' : `本次预留共 ${current.credits} 积分，逐集结算；失败集和未启动集退还，结果未知时等待核对。`}这里只制作剧本，不包含后续画面、视频和配音费用。确认后后台自动继续，可离开后回来。` });
        if (!result.confirm) return;
        request = { requestKey: await newRequestKey(), quoteVersion: current.version };
      }
      setBatch(await submitScriptBatch(project.id, request)); setBatchPending(false); setMessage('剧本制作已受理，会按顺序自动继续。');
    } catch (failure) {
      setBatchPending(!!pendingScriptBatch(project.id));
      setMessage(failure instanceof ApiError && failure.status === 402 ? '积分不足，已有剧本保留，本次没有创建批次。' : pendingScriptBatch(project.id) ? '受理结果待确认，将核对原批次，不重复创建。' : '未能开始，请刷新核对费用和已有内容。');
    } finally { submitting.current = false; setBusy(false); void refresh(); }
  }

  async function generate() {
    if (!project || submitting.current || job?.status === 'accepted') return;
    submitting.current = true; setBusy(true);
    try {
      let version: string | undefined;
      if (!pendingDramaScript(project.id)) {
        const current = await quoteDramaScript(project.id); setQuote(current);
        if (current.mode === 'disabled') { setMessage('剧本生成暂未开放，你的想法已保存。'); return; }
        const result = await Taro.showModal({ title: current.mode === 'mock' ? '开发模拟剧本' : '确认生成第1集剧本？',
          content: current.mode === 'mock' ? '仅生成一集固定结构示例，用于检查流程，不是AI创作，不扣积分。是否继续？'
            : `本次预留 ${current.credits} 积分，仅生成第1集剧本，不含后续画面与视频。成功后按此价格结算；技术或格式失败退还，结果未知时等待核对。` });
        if (!result.confirm) return;
        version = current.version;
      }
      const created = await submitDramaScript(project.id, version); setJob(created); setPending(false);
      if (created.draftVersion) setDraft(created.draftVersion);
      setMessage(created.provider === 'mock' ? '模拟作业已受理，可以离开后回来查看。' : '剧本任务已受理，可以离开后回来查看。');
    }
    catch (failure) {
      setPending(!!pendingDramaScript(project.id));
      setMessage(failure instanceof ApiError && failure.status === 402 ? '积分不足，本次没有创建任务或扣除积分。'
        : failure instanceof ApiError && failure.status === 409 ? '报价或任务状态已变化，请刷新后重新确认。'
          : failure instanceof ApiError && failure.status === 503 ? '剧本生成暂未开放，你的想法已保存。'
            : failure instanceof ApiError && failure.status < 500 ? '请求未受理，请刷新状态后再操作。' : '提交结果暂时无法确认，请继续确认上次任务，不要重复新建。');
      void refresh();
    } finally { submitting.current = false; setBusy(false); void refresh(); }
  }
  async function confirm() {
    if (!project || !draft || submitting.current) return;
    if (!dramaEpisodeCoverage(draft.parse, project.episodeCount).complete) { setMessage('请补齐计划集数并检查格式后再确认。'); return; }
    const result = await Taro.showModal({ title: '确认这个剧本？', content: `版本 ${draft.ordinal} 将固定用于这个项目后续制作。已有成功素材不会被覆盖。` });
    if (!result.confirm || submitting.current) return;
    submitting.current = true; setBusy(true);
    try { setProject(await confirmDramaScript(project.id, draft.id)); setMessage('剧本已确认，可以继续制作。'); }
    catch (failure) {
      const body = failure instanceof ApiError ? ErrorBody.safeParse(failure.body) : null;
      setMessage(body?.success && body.data.code === ErrorCode.SCRIPT_EPISODES_INCOMPLETE ? '剧本集数与计划不一致，请补齐后再确认。' : '暂时无法确认，请刷新核对版本后重试。');
    }
    finally { submitting.current = false; setBusy(false); }
  }
  const confirmed = !!project?.activeVersionId && project.confirmedVersionId === project.activeVersionId;
  const activeScriptId = project?.scriptId ?? batch?.draftScriptId ?? (!batch ? job?.draftScriptId : null);
  const realJob = job?.provider === 'atlas';
  const checking = job?.status === 'accepted' && job.submissionStatus === 'unknown';
  const coverage = project && draft ? dramaEpisodeCoverage(draft.parse, project.episodeCount) : null;
  const jobLabel = job?.status === 'failed' ? scriptFailureMessages[job.failureCode ?? ''] ?? '本次剧本制作未完成，原有内容已保留。'
    : job?.status === 'succeeded' ? realJob ? '剧本草稿已保存，请阅读确认' : '模拟草稿已保存'
      : checking ? '生成结果核对中，请勿重复创建任务'
        : job?.submissionStatus === 'received' ? '已收到剧本，正在整理草稿…'
          : realJob ? '剧本生成中…' : '模拟剧本制作中…';
  return <MobilePage notice="剧本确认 · 阅读并确认后继续制作"><View className="studio-screen studio-drama-project ui-v2">
    <View className="studio-form-body drama-repair-body">
      {!project && !error && <Text className="studio-small">正在读取项目…</Text>}
      {error && <View className="studio-preview-feedback"><Text>{error}</Text><Button className="studio-text-button" onClick={() => { void refresh(); }}>刷新状态</Button></View>}
      {project && <>
        <Text className="v2-eyebrow">2049出片 / 剧本确认</Text><Text className="v2-project-heading">{project.title}</Text>
        <Text className="studio-small">{project.look} · {project.aspectRatio} · 计划 {project.episodeCount} 集</Text>
        {coverage && <View className="v2-series-summary"><Text className="studio-field-heading">剧本已齐 {coverage.present.length}/{project.episodeCount} 集</Text>
          <View className="v2-episode-statuses">{coverage.expected.map(number => <Text key={number} className={`v2-episode-status ${coverage.present.includes(number) ? 'is-ready' : ''}`}>第{number}集 · {coverage.present.includes(number) ? '有剧本' : '待补齐'}</Text>)}</View>
          {!coverage.complete && <Text className="studio-small">{draft?.parse.status !== 'parsed' ? '请先修复格式。' : coverage.unexpected.length ? `含计划外集数：${coverage.unexpected.join('、')}，请核对内容。` : '补齐全部分集剧本后，可统一确认。'}剧本状态不代表视频已完成。</Text>}
        </View>}
        {project.idea && <View className="v2-idea-summary"><Text className="studio-field-heading">故事想法</Text><Text>{project.idea}</Text></View>}
        {batch && <View className="v2-script-status"><Text>剧本已完成 {batch.episodes.filter(item => item.status === 'succeeded' || item.status === 'reused').length}/{batch.episodeCount} 集</Text>
          <Text className="studio-small">{batch.provider === 'mock' ? '开发模拟 · 不代表真实AI质量 · 不扣积分' : `已消耗 ${batch.actualCredits} · 预留中 ${batch.heldCredits} · 已退还 ${batch.refundedCredits} 积分`}</Text>
          {batch.status === 'needs_attention' && <Text className="studio-small">已有稿件保留。可以修复问题稿后续作，或只重新生成缺失集数。</Text>}
          <View className="v2-episode-statuses">{batch.episodes.map(item => <View key={item.number} className="v2-episode-status"><Text>第{item.number}集 · {{ reused: '已保留', waiting: '等待前集', generating: '制作中', review_required: '结果核对中', succeeded: '已生成', needs_repair: '待修复', failed: '未完成', paused: '未启动，已暂停' }[item.status]}</Text>{item.scriptId && item.status === 'needs_repair' && <Button className="studio-text-button" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-repair/index?id=${item.scriptId}` }); }}>免费修复</Button>}</View>)}</View>
        </View>}
        {!batch && job && <View className="v2-script-status"><Text>{jobLabel}</Text><Text className="studio-small">{realJob ? checking ? '暂未确认供应商结果，任务已保留，不会自动重新生成。' : '本次生成第1集。商家资料请核对，未提供的事实不要直接发布。' : '开发模拟 · 单集示例 · 不扣积分'}</Text></View>}
        {!batch && job && job.billingStatus !== 'none' && <Text className="studio-small">{job.billingStatus === 'held' ? `已预留 ${job.reservedCredits} 积分，结果确认后结算。` : job.billingStatus === 'refunded' ? `已退还 ${job.reservedCredits} 积分。` : `本次剧本已消耗 ${job.actualCredits} 积分。`}</Text>}
        {draft && <View className="studio-project-version"><View className="studio-field-title"><Text className="studio-field-heading">{confirmed ? '已确认剧本' : '待确认剧本'}</Text><Text className="studio-small">版本 {draft.ordinal}</Text></View><Text className="studio-small">{draft.parse.status === 'parsed' ? `${draft.parse.episodes.length} 集 · ${draft.parse.roles.length} 个角色` : '格式待修复，暂不可确认'}</Text><ScriptReading content={draft.content} /></View>}
        {project.mode === 'idea' && batch?.status !== 'accepted' && !coverage?.complete && <Text className="v2-hint">{batchPending ? '将核对原批次，不重复创建。' : batchQuote?.mode === 'atlas' ? `本次 ${batchQuote.toGenerate.length} 集剧本 × ${batchQuote.creditsPerEpisode} 积分 = ${batchQuote.credits} 积分。已有 ${batchQuote.reusedEpisodes.length} 集保留，不重复收费。此处不包含完整成片费用。` : batchQuote?.mode === 'mock' ? '全部分集自动推进 · 开发模拟 · 不扣积分' : '已有内容保留，等待可用报价。'}</Text>}
        {activeScriptId && !confirmed && <Button className="studio-text-button" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-repair/index?id=${activeScriptId}` }); }}>编辑 / 修复剧本 →</Button>}
        {project.scriptId && <Button className="studio-text-button" onClick={() => { void Taro.navigateTo({ url: `/pages/studio-drama-create/index?mode=script&sourceScriptId=${project.scriptId}` }); }}>复用剧本创建新项目 →</Button>}
        {message && <View className="studio-preview-feedback">{message}</View>}
      </>}
    </View>
    {project && <View className="studio-bottom-action">
      {confirmed ? <Action disabled={busy} onClick={() => { void continueProduction(); }}>{busy ? '正在读取进度…' : '继续制作'} <Icon name="arrow" /></Action>
        : draft && coverage?.complete ? <Action disabled={busy || batch?.status === 'accepted'} onClick={() => { void confirm(); }}>{busy ? '正在确认…' : '确认全部剧本'}</Action>
          : !pending && project.mode === 'idea' && (batch || job?.status !== 'accepted') ? <Action disabled={busy || batch?.status === 'accepted' || (!batchPending && (!batchQuote || batchQuote.mode === 'disabled'))} onClick={() => { void generateBatch(); }}>{busy ? '正在确认…' : batch?.status === 'accepted' ? '剧本自动制作中…' : batchPending ? '继续核对原批次' : batchQuote?.mode === 'disabled' ? '生成暂未开放' : batchQuote?.mode === 'mock' ? '模拟生成全部剧本' : `生成剩余 ${batchQuote?.toGenerate.length ?? project.episodeCount} 集剧本`}</Action>
            : draft ? <Action disabled onClick={() => setMessage('请先补齐分集剧本。')}>剧本待补齐</Action>
          : <Action disabled={busy || !!error || project.mode !== 'idea' || job?.status === 'accepted' || (!pending && (!quote || quote.mode === 'disabled'))} onClick={() => { void generate(); }}>{busy ? '正在确认…' : checking ? '等待结果核对' : job?.status === 'accepted' ? realJob ? '剧本生成中…' : '模拟制作中…' : pending ? '继续确认上次任务' : quote?.mode === 'atlas' ? '生成第1集剧本' : quote?.mode === 'mock' ? '生成开发模拟剧本' : '生成暂未开放'}</Action>}
      <Button id="drama-project-refresh" className="studio-text-button" disabled={busy} onClick={() => { void refresh(); }}>刷新状态</Button>
    </View>}
  </View></MobilePage>;
}
