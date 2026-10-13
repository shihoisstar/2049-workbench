// Run only after explicit approval extending the cumulative text-call limit.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { createRequire } = require('node:module'); const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const workerRequire = createRequire(path.join(root, 'apps/worker/package.json'));
const { createServices, seriesScriptProviderBinding, marketingCopyBinding } = workerRequire('@wb/server');
const { createRealScriptActivity } = require('../apps/worker/dist/real-drama-script');
const { createMarketingCopyActivity } = require('../apps/worker/dist/marketing-copy');
const directory = path.resolve(process.argv[2] || '');
assert.equal(path.dirname(directory), path.join(root, '.local')); assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));
assert.ok(process.argv.includes('--authorized-total=14'), 'Explicit new approval and --authorized-total=14 are required; previous 7 calls are exhausted');
const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
assert.equal(state.runId, path.basename(directory));
const database = new URL(state.databaseUrl); assert.equal(database.hostname, '127.0.0.1'); assert.equal(database.pathname, '/workbench_verify');
const inspected = spawnSync('docker', ['inspect', `${state.runId}-pg`], { encoding: 'utf8', windowsHide: true }); assert.equal(inspected.status, 0);
assert.equal(JSON.parse(inspected.stdout)[0].Config.Labels['wb.miniapp-drama'], state.runId);
const previous = JSON.parse(fs.readFileSync(path.join(root, 'docs/验收留档/DRAMA-SCRIPT-2026-10-10/real-text/report.json'), 'utf8'));
assert.equal(previous.attempts.length, 7); assert.ok(!previous.attempts.some(item => ['pending', 'unknown'].includes(item.status)));
const env = {};
for (const line of fs.readFileSync(path.join(root, 'apps/api/.env'), 'utf8').split(/\r?\n/)) {
  const match = /^(ATLAS_API_KEY|ATLAS_CHAT_MODEL|ATLAS_BASE_URL)=(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const model = env.ATLAS_CHAT_MODEL || 'deepseek-ai/deepseek-v4.1-flash'; const baseUrl = env.ATLAS_BASE_URL || 'https://api.atlascloud.ai';
assert.equal(model, 'deepseek-ai/deepseek-v4.1-flash'); assert.equal(new URL(baseUrl).origin, 'https://api.atlascloud.ai'); assert.ok(env.ATLAS_API_KEY, 'Existing text credential unavailable');
const config = { secret: env.ATLAS_API_KEY, model, baseUrl };
const evidence = path.join(root, 'docs/验收留档/SERIES-COPY-2026-10-11/real-text'); fs.mkdirSync(evidence, { recursive: true });
const reportFile = path.join(evidence, 'report.json');
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : { model, provider: 'Atlas', approvedTotalTextCalls: 14, oldCalls: 7, budgetCny: 20, conservativeTotalUsdCap: 0.1, inputUsdPerMillion: 0.3, outputUsdPerMillion: 1.2, priceCheckedOn: '2026-10-11', pricingSource: 'https://www.atlascloud.ai/pricing/models', attempts: [], phoneVerified: false, fiveVideosVerified: false };
function save() { const text = JSON.stringify(report, null, 2) + '\n'; fs.writeFileSync(reportFile, text); assert.equal(fs.readFileSync(reportFile, 'utf8'), text); }
let purpose = '';
const fetchImpl = async (url, options) => {
  assert.equal(new URL(String(url)).origin, 'https://api.atlascloud.ai');
  if (report.oldCalls + report.attempts.length >= 14 || report.attempts.some(item => ['pending', 'unknown'].includes(item.status))) throw new Error('Text evaluation stopped by persistent call guard');
  const body = JSON.parse(String(options.body)); assert.equal(body.model, model); assert.ok([1000, 1800].includes(body.max_tokens));
  const bytes = Buffer.byteLength(JSON.stringify(body.messages)); const maximumUsd = bytes * report.inputUsdPerMillion / 1e6 + body.max_tokens * report.outputUsdPerMillion / 1e6;
  const reserved = [...previous.attempts, ...report.attempts].reduce((sum, item) => sum + item.maximumUsd, 0);
  assert.ok(Number.isFinite(reserved) && reserved + maximumUsd <= 0.1, 'Conservative cumulative USD limit exceeded');
  const attempt = { purpose, status: 'pending', maximumUsd, maxTokens: body.max_tokens, inputSha256: createHash('sha256').update(JSON.stringify(body.messages)).digest('hex'), startedAt: new Date().toISOString() };
  report.attempts.push(attempt); save();
  try {
    const response = await fetch(url, options);
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) { attempt.status = 'rejected'; attempt.httpStatus = response.status; save(); return response; }
    let payload; try { payload = await response.clone().json(); } catch { attempt.status = 'unknown'; save(); return response; }
    if (!response.ok || !payload?.choices?.length) { attempt.status = 'unknown'; save(); return response; }
    attempt.status = 'responded'; attempt.finishReason = payload.choices[0].finish_reason ?? null;
    const usage = payload.usage; attempt.usage = usage ? { inputTokens: usage.prompt_tokens ?? null, outputTokens: usage.completion_tokens ?? null } : null;
    attempt.estimatedUsd = Number.isSafeInteger(usage?.prompt_tokens) && Number.isSafeInteger(usage?.completion_tokens) ? usage.prompt_tokens * 0.3 / 1e6 + usage.completion_tokens * 1.2 / 1e6 : null;
    save(); return response;
  } catch (error) { attempt.status = 'unknown'; save(); throw error; }
};
async function main() {
  const services = createServices(state.databaseUrl);
  try {
    let actor;
    if (report.actorId) actor = { userId: report.actorId };
    else { actor = await services.identity.bootstrapGuest(randomBytes(32).toString('hex')); report.actorId = actor.userId; save(); }
    const batchAdmission = { offer: { binding: seriesScriptProviderBinding(config), credits: 7, estimatedCostCents: null }, mockAvailable: false };
    let batch;
    if (report.batchId) batch = await services.scriptBatches.get({ userId: actor.userId, batchId: report.batchId });
    else {
      const project = await services.drama.create({ userId: actor.userId, mode: 'idea', title: '月亮回家计划', content: '橘猫阿橘与小狐狸阿白驾驶小飞船寻找失踪的月亮。共五集，依次发现星图、收到月亮信、穿过云海风暴、找到迷路的月亮、送月亮回家。全剧只用这两个出镜角色，故事温暖、有悬念、每集有转折，最后完整收束。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
      const input = { userId: actor.userId, projectId: project.id, admission: batchAdmission }; const quote = await services.scriptBatches.quote(input);
      batch = await services.scriptBatches.create({ ...input, request: { requestKey: randomUUID(), quoteVersion: quote.version } }); report.projectId = project.id; report.batchId = batch.id; save();
    }
    if (process.argv.includes('--resume-repaired-batch') && batch.status === 'needs_attention') {
      assert.equal(report.blocked, 'script-output-needs-attention');
      assert.equal(report.attempts.length, 4); assert.ok(report.attempts.every(item => item.status === 'responded'));
      const episode = batch.episodes.find(item => item.number === 4);
      assert.equal(episode.status, 'needs_repair'); assert.ok(episode.scriptId && episode.versionId);
      const original = await services.dramaScripts.get({ userId: actor.userId, jobId: episode.jobId });
      assert.equal(original.draftVersion.parse.status, 'parsed'); assert.ok(original.draftVersion.content.length > 900);
      const content = fs.readFileSync(path.join(evidence, 'episode-4-editorial-repair.md'), 'utf8').trim(); assert.ok(content.length < 900);
      const repaired = await services.drama.repairScript({ userId: actor.userId, scriptId: episode.scriptId, content });
      assert.equal(repaired.parse.status, 'parsed'); assert.equal(repaired.parse.episodes[0].number, 4);
      report.repair = { episode: 4, method: 'Codex editorial revision through existing repair service; no provider call', originalVersionId: episode.versionId, originalCharacters: original.draftVersion.content.length, versionId: repaired.id, characters: content.length };
      const input = { userId: actor.userId, projectId: report.projectId, admission: batchAdmission };
      const quote = await services.scriptBatches.quote(input); assert.deepEqual(quote.reusedEpisodes, [1, 2, 3, 4]); assert.deepEqual(quote.toGenerate, [5]);
      report.previousBatchId = batch.id;
      batch = await services.scriptBatches.create({ ...input, request: { requestKey: randomUUID(), quoteVersion: quote.version } });
      report.batchId = batch.id; delete report.blocked; save();
    }
    const generateScript = createRealScriptActivity(services, config, fetchImpl);
    while (batch.status === 'accepted') {
      const episode = batch.episodes.find(item => ['generating', 'review_required'].includes(item.status)); assert.ok(episode, 'No ready episode found'); purpose = `drama-episode-${episode.number}`;
      const result = await generateScript({ userId: actor.userId, jobId: episode.jobId });
      if (result === 'review_required') { report.blocked = 'script-unknown-acceptance'; save(); return; }
      batch = await services.scriptBatches.get({ userId: actor.userId, batchId: batch.id });
    }
    report.batchStatus = batch.status; report.scriptEpisodes = batch.draftVersion?.parse.episodes.map(episode => ({ number: episode.number, scenes: episode.scenes.length })) ?? [];
    if (batch.status !== 'succeeded') { report.blocked = 'script-output-needs-attention'; save(); return; }
    const scriptFile = path.join(evidence, 'five-episode-script.md'); fs.writeFileSync(scriptFile, batch.draftVersion.content); assert.equal(fs.readFileSync(scriptFile, 'utf8'), batch.draftVersion.content);
    const copyAdmission = { offer: { binding: marketingCopyBinding(config), credits: 3, estimatedCostCents: null }, mockAvailable: false };
    const generateCopy = createMarketingCopyActivity(services, config, fetchImpl); report.copies ??= [];
    for (const source of [{ category: 'commerce', text: '商品是橘猫图案的棉布帆布袋。明确资料只有猫咪图案和棉布材质，没有提供价格、优惠、容量、销量或其他功效。拍一段轻松的出门小故事。' }, { category: 'store_visit', text: '店铺是咖啡店，环境有木桌、绿植和窗边座位。没有提供店名、地址、价格、营业时间、顾客评价或制作参数。拍走入店内、坐到窗边的轻松小故事。' }]) {
      if (report.copies.some(item => item.category === source.category && item.status === 'succeeded')) continue;
      let job = report.copies.find(item => item.category === source.category);
      if (job) job = await services.marketingCopies.get({ userId: actor.userId, jobId: job.id });
      else { const quote = await services.marketingCopies.quote({ userId: actor.userId, request: source, admission: copyAdmission }); job = await services.marketingCopies.create({ userId: actor.userId, request: { ...source, requestKey: randomUUID(), quoteVersion: quote.version }, admission: copyAdmission }); report.copies.push({ id: job.id, category: job.category, status: job.status }); save(); }
      purpose = `marketing-${source.category}`; const result = await generateCopy({ userId: actor.userId, jobId: job.id });
      const done = await services.marketingCopies.get({ userId: actor.userId, jobId: job.id }); const record = report.copies.find(item => item.id === job.id); record.status = done.status; record.result = done.result; record.failureCode = done.failureCode; save();
      if (result === 'review_required' || done.status !== 'succeeded') { report.blocked = result === 'review_required' ? 'copy-unknown-acceptance' : 'copy-facts-or-format'; save(); return; }
    }
    report.status = 'completed'; delete report.blocked;
    report.estimatedNewUsd = report.attempts.reduce((sum, item) => sum + (item.estimatedUsd ?? 0), 0);
    const estimates = [...previous.attempts, ...report.attempts].map(item => item.estimatedUsd ?? item.calculatedUsd ?? (Number.isSafeInteger(item.usage?.inputTokens) && Number.isSafeInteger(item.usage?.outputTokens) ? item.usage.inputTokens * 0.3 / 1e6 + item.usage.outputTokens * 1.2 / 1e6 : null));
    report.estimatedTotalUsd = estimates.every(value => value !== null) ? estimates.reduce((sum, value) => sum + value, 0) : null; report.actualProviderCharge = null; save();
    console.log(JSON.stringify({ newTextCalls: report.attempts.length, totalTextCalls: report.oldCalls + report.attempts.length, episodes: report.scriptEpisodes.length, copyCategories: report.copies.length, estimatedTotalUsd: report.estimatedTotalUsd, actualProviderCharge: null }));
  } finally { await services.close(); }
}
main().catch(() => { report.status = 'stopped'; save(); console.error('Real text evaluation stopped; inspect the protected task evidence before any retry'); process.exitCode = 1; });
