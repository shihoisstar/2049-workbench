// Runs the actual TypeScript service with injected storage/transport; no browser or network.
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { Script } = require('node:vm');
const appRequire = createRequire(resolve(__dirname, '../apps/miniapp/package.json'));
const ts = appRequire('typescript');
const { ApiError } = appRequire('@wb/api-client');
const { ErrorCode } = appRequire('@wb/contracts');
const storage = new Map([['wb_v2_session', { userId: randomUUID(), token: 'fixture', expiresInSec: 3600 }]]);
const calls = [];
let respond = () => { throw new Error('fixture network loss'); };
const taro = { getStorageSync: key => storage.get(key), setStorage: async ({ key, data }) => storage.set(key, data),
  setStorageSync: (key, data) => storage.set(key, data),
  removeStorageSync: key => storage.delete(key), removeStorage: async ({ key }) => storage.delete(key),
  getRandomValues: async ({ length }) => ({ randomValues: Uint8Array.from(randomBytes(length)).buffer }) };
const sourcePath = resolve(__dirname, '../apps/miniapp/src/services/generation.ts');
const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const moduleObject = { exports: {} };
new Script(`(function(require,module,exports,process){${compiled}\n})`, { filename: sourcePath }).runInThisContext()(
  name => name === '@tarojs/taro' ? taro : name === './taro-transport' ? { createMiniappApiClient: () => ({ request: async (...args) => { calls.push(args); return respond(...args); } }) } : appRequire(name),
  moduleObject, moduleObject.exports, { env: { TARO_ENV: 'weapp' } });
const service = moduleObject.exports;
const job = (projectId, body) => ({ id: randomUUID(), projectId, requestKey: body.requestKey, status: 'accepted', provider: 'atlas', submissionStatus: null,
  billingStatus: 'held', reservedCredits: 7, actualCredits: null, quoteVersion: body.quoteVersion, failureCode: null, draftScriptId: null, draftVersion: null,
  createdAt: new Date().toISOString(), finishedAt: null });
async function main() {
  const a = randomUUID(); const b = randomUUID();
  await assert.rejects(service.submitDramaScript(a, 'quote-a'));
  const pendingA = service.pendingDramaScript(a); assert.ok(pendingA);
  await assert.rejects(service.submitDramaScript(b, 'quote-b'));
  assert.deepEqual(service.pendingDramaScript(a), pendingA); assert.ok(service.pendingDramaScript(b));
  respond = () => { throw new ApiError(503, { message: 'upstream timeout' }); };
  await assert.rejects(service.submitDramaScript(a, 'changed-price'));
  assert.deepEqual(calls.at(-1)[2].body, pendingA); assert.deepEqual(service.pendingDramaScript(a), pendingA);
  respond = (_method, _path, options) => job(b, options.body);
  await service.submitDramaScript(b, 'changed-price');
  assert.equal(service.pendingDramaScript(b), null); assert.deepEqual(service.pendingDramaScript(a), pendingA);
  respond = () => job(a, pendingA);
  await service.latestDramaScriptJob(a); assert.equal(service.pendingDramaScript(a), null);
  storage.set('wb_v2_pending_drama_script', { projectId: a, requestKey: randomUUID(), quoteVersion: 'legacy' });
  const legacy = service.pendingDramaScript(a); assert.ok(legacy);
  respond = (_method, _path, options) => job(a, options.body);
  await service.submitDramaScript(a, 'new-price'); assert.deepEqual(calls.at(-1)[2].body, legacy); assert.equal(storage.has('wb_v2_pending_drama_script'), false);
  respond = () => { throw new ApiError(402, { code: ErrorCode.INSUFFICIENT_CREDITS, message: 'insufficient' }); };
  await assert.rejects(service.submitDramaScript(a, 'quote-a')); assert.equal(service.pendingDramaScript(a), null);
  respond = () => { throw new ApiError(503, { code: ErrorCode.GENERATION_UNAVAILABLE, message: 'disabled' }); };
  await assert.rejects(service.submitDramaScript(a, 'quote-a')); assert.equal(service.pendingDramaScript(a), null);
  const portrait = (body) => ({ id: randomUUID(), projectId: a, roleKey: body.roleKey, roleName: '橘猫', description: '蓝围巾', requestKey: body.requestKey,
    quoteVersion: body.quoteVersion, provider: 'atlas', status: 'accepted', submissionStatus: null, failureCode: null, reservedCredits: 7, actualCredits: null,
    materialId: null, current: true, createdAt: new Date().toISOString(), expiresAt: null });
  const request = { roleKey: 'cat', preparationRevision: 1, quoteVersion: 'portrait-v1' };
  respond = () => { throw new Error('lost portrait response'); };
  await assert.rejects(service.submitPortrait(a, request)); const pendingPortrait = service.pendingPortrait(a, 'cat'); assert.ok(pendingPortrait);
  await assert.rejects(service.submitPortrait(a, { ...request, roleKey: 'fox' })); assert.deepEqual(service.pendingPortrait(a, 'cat'), pendingPortrait);
  await assert.rejects(service.submitPortrait(b, request)); assert.ok(service.pendingPortrait(b, 'cat'));
  respond = () => { throw new ApiError(503, { message: 'upstream uncertainty' }); };
  await assert.rejects(service.submitPortrait(a, { ...request, quoteVersion: 'new-price', preparationRevision: 2 }));
  assert.deepEqual(calls.at(-1)[2].body, pendingPortrait); assert.deepEqual(service.pendingPortrait(a, 'cat'), pendingPortrait);
  respond = () => ({ items: [portrait(pendingPortrait)], nextCursor: null });
  await service.listPortraits(a, 'cat'); assert.equal(service.pendingPortrait(a, 'cat'), null); assert.ok(service.pendingPortrait(a, 'fox')); assert.ok(service.pendingPortrait(b, 'cat'));
  respond = (_method, _path, options) => portrait(options.body); await service.submitPortrait(a, pendingPortrait);
  assert.equal(calls.at(-1)[2].body.requestKey, pendingPortrait.requestKey);
  respond = (_method, _path, options) => portrait(options.body);
  await service.submitPortrait(a, request); assert.equal(service.pendingPortrait(a, 'cat'), null);
  respond = () => { throw new ApiError(409, { code: ErrorCode.QUOTE_CHANGED, message: 'quote changed' }); };
  await assert.rejects(service.submitPortrait(a, request)); assert.equal(service.pendingPortrait(a, 'cat'), null);
  const planImage = body => ({ candidateId: randomUUID(), planId: a, shotId: randomUUID(), shotKey: body.shotKey, planRevision: body.planRevision, roleVersionIds: [], content: '云海', current: true,
    selectedAt: null, createdAt: new Date().toISOString(), expiresAt: null, jobId: randomUUID(), requestKey: body.requestKey, provider: 'mock', status: 'accepted', reservedCredits: 7, actualCredits: null, failureCode: null });
  const planRequest = { shotKey: '1:1:1', planRevision: 2, quoteVersion: 'plan-v1' };
  respond = () => { throw new Error('lost plan image response'); };
  await assert.rejects(service.submitPlanImage(a, planRequest)); const pendingImage = service.pendingPlanImage(a, planRequest.shotKey); assert.ok(pendingImage);
  await assert.rejects(service.submitPlanImage(a, { ...planRequest, shotKey: '1:1:2' })); await assert.rejects(service.submitPlanImage(b, planRequest));
  assert.deepEqual(service.pendingPlanImage(a, planRequest.shotKey), pendingImage);
  respond = () => { throw new ApiError(503, { message: 'unknown transport result' }); };
  await assert.rejects(service.submitPlanImage(a, { ...planRequest, quoteVersion: 'new', planRevision: 3 })); assert.deepEqual(calls.at(-1)[2].body, pendingImage);
  respond = () => ({ items: [planImage(pendingImage)], nextCursor: null }); await service.listPlanImages(a, planRequest.shotKey);
  assert.equal(service.pendingPlanImage(a, planRequest.shotKey), null); assert.ok(service.pendingPlanImage(b, planRequest.shotKey)); assert.ok(service.pendingPlanImage(a, '1:1:2'));
  respond = (_method, _path, options) => planImage(options.body); await service.submitPlanImage(a, pendingImage);
  assert.equal(calls.at(-1)[2].body.requestKey, pendingImage.requestKey, 'An already captured retry must retain its key after list recovery cleared storage');
  respond = (_method, _path, options) => planImage(options.body); await service.submitPlanImage(a, planRequest); assert.equal(service.pendingPlanImage(a, planRequest.shotKey), null);
  respond = () => { throw new ApiError(409, { code: ErrorCode.QUOTE_CHANGED, message: 'changed' }); }; await assert.rejects(service.submitPlanImage(a, planRequest)); assert.equal(service.pendingPlanImage(a, planRequest.shotKey), null);
  const owner = storage.get('wb_v2_session'); const local = await service.loadMarketingDrafts();
  const commerce = { prompt: '帆布袋与小猫', materialIds: [randomUUID()] }; const visit = { prompt: '咖啡店的窗边', materialIds: [] };
  service.saveMarketingDraft(local.userId, 'commerce', commerce); service.saveMarketingDraft(local.userId, 'store_visit', visit);
  assert.deepEqual((await service.loadMarketingDrafts()).drafts, { commerce, store_visit: visit });
  assert.deepEqual((await service.loadMarketingDrafts()).drafts.store_visit, visit, 'Reentry preserves the separate store draft');
  storage.set('wb_v2_session', { ...owner, userId: randomUUID() });
  assert.deepEqual((await service.loadMarketingDrafts()).drafts.commerce, { prompt: '', materialIds: [] });
  assert.throws(() => service.saveMarketingDraft(local.userId, 'commerce', commerce)); storage.set('wb_v2_session', owner);
  storage.set(`wb_v2_marketing_draft:${owner.userId}:commerce`, { prompt: 'unsafe', materialIds: ['not-a-uuid'] });
  assert.deepEqual((await service.loadMarketingDrafts()).drafts.commerce, { prompt: '', materialIds: [] });
  const video = { category: 'store_visit', resolution: '480p', aspectRatio: '9:16', durationSec: 5, materialIds: [], prompt: visit.prompt, requestKey: randomUUID(), quoteVersion: 'video-fixture' };
  respond = () => { throw new ApiError(503, { message: 'unknown acceptance' }); }; await assert.rejects(service.submitGeneration(video));
  assert.deepEqual(service.pendingGeneration(), video);
  respond = (_method, _path, options) => ({ ...options.body, id: randomUUID(), status: 'accepted', reservedCredits: 77, actualCredits: null, createdAt: new Date().toISOString(), finishedAt: null });
  await service.submitGeneration(service.pendingGeneration()); assert.deepEqual(calls.at(-1)[2].body, video); assert.equal(service.pendingGeneration(), null);
  respond = () => { throw new ApiError(503, { code: ErrorCode.GENERATION_UNAVAILABLE, message: 'closed' }); }; await assert.rejects(service.submitGeneration(video)); assert.equal(service.pendingGeneration(), null);
  const batchView = (projectId, body) => ({ id: randomUUID(), projectId, requestKey: body.requestKey, quoteVersion: body.quoteVersion, status: 'accepted', provider: 'atlas', episodeCount: 5,
    reservedCredits: 35, actualCredits: 0, heldCredits: 35, refundedCredits: 0, episodes: Array.from({ length: 5 }, (_, index) => ({ number: index + 1, status: index ? 'waiting' : 'generating', jobId: randomUUID(), scriptId: null, versionId: null, failureCode: null })), draftScriptId: null, draftVersion: null, createdAt: new Date().toISOString(), finishedAt: null });
  const batchBody = { requestKey: randomUUID(), quoteVersion: 'batch-fixture' };
  respond = () => { throw new ApiError(503, { message: 'uncertain batch acceptance' }); }; await assert.rejects(service.submitScriptBatch(a, batchBody)); assert.deepEqual(service.pendingScriptBatch(a), batchBody);
  const otherBatch = { requestKey: randomUUID(), quoteVersion: 'other-batch' }; await assert.rejects(service.submitScriptBatch(b, otherBatch)); assert.deepEqual(service.pendingScriptBatch(a), batchBody);
  respond = () => batchView(a, batchBody); await service.latestScriptBatch(a); assert.equal(service.pendingScriptBatch(a), null); assert.deepEqual(service.pendingScriptBatch(b), otherBatch);
  respond = (_method, _path, options) => batchView(a, options.body); await service.submitScriptBatch(a, batchBody); assert.deepEqual(calls.at(-1)[2].body, batchBody);
  respond = () => { throw new ApiError(402, { code: ErrorCode.INSUFFICIENT_CREDITS, message: 'insufficient' }); }; await assert.rejects(service.submitScriptBatch(a, batchBody)); assert.equal(service.pendingScriptBatch(a), null);
  const copyBody = { category: 'commerce', text: '帆布袋', requestKey: randomUUID(), quoteVersion: 'copy-fixture' }; const visitBody = { category: 'store_visit', text: '咖啡店木桌', requestKey: randomUUID(), quoteVersion: 'visit-copy' };
  const copyView = body => ({ id: randomUUID(), requestKey: body.requestKey, category: body.category, sourceText: body.text, quoteVersion: body.quoteVersion, provider: 'atlas', status: 'accepted', submissionStatus: null, billingStatus: 'held', reservedCredits: 3, actualCredits: null, failureCode: null, result: null, createdAt: new Date().toISOString(), finishedAt: null });
  respond = () => { throw new ApiError(503, { message: 'uncertain copy acceptance' }); }; await assert.rejects(service.submitMarketingCopy(copyBody)); assert.deepEqual(await service.pendingMarketingCopy('commerce'), copyBody);
  await assert.rejects(service.submitMarketingCopy(visitBody)); assert.deepEqual(await service.pendingMarketingCopy('commerce'), copyBody); assert.deepEqual(await service.pendingMarketingCopy('store_visit'), visitBody);
  storage.set('wb_v2_session', { ...owner, userId: randomUUID() }); assert.equal(await service.pendingMarketingCopy('commerce'), null); storage.set('wb_v2_session', owner);
  respond = () => copyView(copyBody); await service.latestMarketingCopy('commerce'); assert.equal(await service.pendingMarketingCopy('commerce'), null); assert.deepEqual(await service.pendingMarketingCopy('store_visit'), visitBody);
  respond = (_method, _path, options) => copyView(options.body); await service.submitMarketingCopy(copyBody); assert.deepEqual(calls.at(-1)[2].body, copyBody);
  respond = () => { throw new ApiError(503, { code: ErrorCode.GENERATION_UNAVAILABLE, message: 'disabled' }); }; await assert.rejects(service.submitMarketingCopy(copyBody)); assert.equal(await service.pendingMarketingCopy('commerce'), null);
  const candidateId = randomUUID(); const videoRequest = { planRevision: 2, quoteVersion: 'plan-video-fixture', requestKey: randomUUID() };
  respond = () => { throw new ApiError(503, { message: 'uncertain video acceptance' }); }; await assert.rejects(service.submitPlanVideo(candidateId, videoRequest)); assert.deepEqual(await service.pendingPlanVideo(candidateId), videoRequest);
  storage.set('wb_v2_session', { ...owner, userId: randomUUID() }); assert.equal(await service.pendingPlanVideo(candidateId), null); storage.set('wb_v2_session', owner);
  const shotVideo = { id: randomUUID(), shotId: randomUUID(), candidateId, requestKey: videoRequest.requestKey, status: 'accepted', failureCode: null, createdAt: new Date().toISOString(), finishedAt: null };
  respond = () => shotVideo; await service.latestPlanVideo(candidateId); assert.equal(await service.pendingPlanVideo(candidateId), null);
  await service.submitPlanVideo(candidateId, videoRequest); assert.deepEqual(calls.at(-1)[2].body, videoRequest);
  respond = () => { throw new ApiError(503, { code: ErrorCode.GENERATION_UNAVAILABLE, message: 'closed' }); }; await assert.rejects(service.submitPlanVideo(candidateId, videoRequest)); assert.equal(await service.pendingPlanVideo(candidateId), null);
  const exportPlan = randomUUID(); const exportProject = randomUUID(); const exportKey = `wb_plan_export_pending:${owner.userId}:${exportPlan}:1`;
  respond = () => { throw new ApiError(503, { message: 'uncertain export acceptance' }); }; await assert.rejects(service.createPlanExport(exportProject, exportPlan, 2, 1)); const originalExport = storage.get(exportKey); assert.equal(originalExport.planRevision, 2);
  const exported = { id: randomUUID(), projectId: exportProject, episodeNumber: 1, requestKey: originalExport.requestKey, status: 'accepted', failureCode: null, createdAt: new Date().toISOString(), finishedAt: null };
  respond = () => exported; await service.createPlanExport(exportProject, exportPlan, 3, 1); assert.deepEqual(calls.at(-1)[2].body, originalExport);
  storage.set(exportKey, originalExport); respond = () => [exported]; await service.listPlanExports(exportPlan); assert.equal(storage.has(exportKey), false);
  console.log(JSON.stringify({ additionalChecks: 8, failures: 0, networkCalls: 0, covers: ['plan video unknown retention', 'plan video account isolation', 'plan video matched query cleanup', 'captured video nonce preserved', 'plan video definite refusal', 'plan export unknown retention', 'plan export original revision/nonce replay', 'plan export matched list cleanup'] }));
  console.log(JSON.stringify({ checks: 40, failures: 0, networkCalls: 0, source: 'apps/miniapp/src/services/generation.ts', covers: ['unknown retention', 'project isolation', '503 retention and original quote', 'matching cleanup', 'backend recovery', 'legacy request recovery', 'insufficient balance', 'definite service refusal', 'portrait project and role isolation', 'portrait original quote retention', 'portrait list recovery', 'portrait captured retry survives storage cleanup', 'portrait success cleanup', 'portrait changed quote cleanup', 'portrait uncertain 503 retention', 'plan shot isolation', 'plan project isolation', 'plan original quote retention', 'plan list recovery', 'plan captured retry survives storage cleanup', 'plan success cleanup', 'plan quote rejection cleanup', 'separate marketing drafts', 'marketing reentry', 'marketing account isolation', 'corrupt marketing draft rejected', 'marketing unknown 503 retention', 'marketing retry retains category and nonce', 'marketing definite refusal cleanup', 'batch unknown acceptance', 'batch project isolation', 'batch matching backend recovery', 'batch captured retry preserves nonce', 'batch definite refusal cleanup', 'copy unknown acceptance', 'copy category isolation', 'copy account isolation', 'copy matching backend recovery', 'copy captured retry preserves original body', 'copy definite refusal cleanup'] }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
