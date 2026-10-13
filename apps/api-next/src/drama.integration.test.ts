import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { CreateDramaProject, DRAMA_IMAGE_PRICING, DRAMA_SHOT_VIDEO_PRICING, DramaExportAccess, DramaExportJobView, DramaImageAccess, DramaImageJobView, DramaProjectList, DramaProjectView, DramaProjectWorkflow, DramaRole, DramaScene, DramaScriptList, DramaScriptVersion, DramaScriptView, DramaShotVideoAccess, DramaShotVideoJobView, DramaStoryboardCandidate, DramaStoryboardShot, GuestSession, SIGNUP_GRANT_CREDITS } from '@wb/contracts';
import { createServices, scriptProviderBinding } from '@wb/server';
import type { ObjectStore } from '@wb/media';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const appPromise = createApplication({ config: { databaseUrl, port: 3011 }, services });
const script = '## 第1集\n**场景1：操场 日/外**\n小雨：我们开始吧。';

before(async () => {
  const app = await appPromise;
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
after(async () => { await (await appPromise).close(); });

test('script mock admission is closed by default and validates ownership and input', async () => {
  const app = await appPromise; const owner = await login();
  const projectResponse = await app.inject({ method: 'POST', url: '/v2/drama/projects', headers: owner.headers, payload: { mode: 'idea', title: '模拟入口', content: '橘猫找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' } });
  const project = DramaProjectView.parse(projectResponse.json());
  const response = await app.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/script-jobs`, headers: owner.headers, payload: { requestKey: randomUUID() } });
  assert.equal(response.statusCode, 503);
  const latest = await app.inject({ method: 'GET', url: `/v2/drama/projects/${project.id}/script-jobs`, headers: owner.headers });
  assert.equal(latest.statusCode, 200); assert.equal(latest.json(), null);
  const other = await login();
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/projects/${project.id}/script-jobs`, headers: other.headers })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/script-confirmation`, headers: owner.headers, payload: { versionId: 'invalid', userId: 'forged' } })).statusCode, 400);
});

test('enabled mock HTTP admission persists one job and confirmation binds only the owner draft', async () => {
  const localServices = createServices(databaseUrl!);
  const app = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011 }, services: localServices, dramaScriptMockAvailable: true });
  try {
    await app.init(); await app.getHttpAdapter().getInstance().ready();
    const owner = await loginSession(app); const other = await loginSession(app);
    const project = await localServices.drama.create({ userId: owner.session.userId, mode: 'idea', title: 'HTTP模拟', content: '橘猫找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 1, genre: '科幻', tone: '通用' });
    const requestKey = randomUUID(); const url = `/v2/drama/projects/${project.id}/script-jobs`;
    const first = await app.inject({ method: 'POST', url, headers: owner.headers, payload: { requestKey } });
    assert.equal(first.statusCode, 201);
    const id = first.json().id;
    const repeat = await app.inject({ method: 'POST', url, headers: owner.headers, payload: { requestKey } });
    assert.equal(repeat.statusCode, 201); assert.equal(repeat.json().id, id);
    assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/script-jobs/${id}`, headers: other.headers })).statusCode, 404);
    const completed = await localServices.dramaScripts.complete({ userId: owner.session.userId, jobId: id, content: script });
    const confirmation = await app.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/script-confirmation`, headers: owner.headers, payload: { versionId: completed.draftVersion!.id } });
    assert.equal(confirmation.statusCode, 201);
    assert.equal(DramaProjectView.parse(confirmation.json()).confirmedVersionId, completed.draftVersion!.id);
  } finally { await app.close(); }
});

test('real script quote requires owner and explicit confirmation; client cannot choose the price', async () => {
  const localServices = createServices(databaseUrl!);
  const scriptOffer = { binding: scriptProviderBinding({ model: 'fixture-text', baseUrl: 'https://script.invalid' }), credits: 7, estimatedCostCents: null };
  const localApp = await createApplication({ config: { databaseUrl: databaseUrl!, port: 3011, scriptOffer }, services: localServices });
  try {
    await localApp.init(); await localApp.getHttpAdapter().getInstance().ready();
    const owner = await loginSession(localApp); const other = await loginSession(localApp);
    const project = await localServices.drama.create({ userId: owner.session.userId, mode: 'idea', title: '确认报价', content: '橘猫找月亮', look: '3D国创', aspectRatio: '9:16', episodeCount: 6, genre: '科幻', tone: '通用' });
    const url = `/v2/drama/projects/${project.id}`;
    const quote = await localApp.inject({ method: 'GET', url: `${url}/script-quote`, headers: owner.headers });
    assert.equal(quote.statusCode, 200); assert.equal(quote.json().credits, 7); assert.equal(quote.json().episodeNumber, 1);
    assert.equal((await localApp.inject({ method: 'GET', url: `${url}/script-quote`, headers: other.headers })).statusCode, 404);
    const requestKey = randomUUID();
    assert.equal((await localApp.inject({ method: 'POST', url: `${url}/script-jobs`, headers: owner.headers, payload: { requestKey } })).statusCode, 409);
    const payload = { requestKey, quoteVersion: quote.json().version };
    assert.equal((await localApp.inject({ method: 'POST', url: `${url}/script-jobs`, headers: owner.headers, payload: { ...payload, credits: 0 } })).statusCode, 400);
    const accepted = await localApp.inject({ method: 'POST', url: `${url}/script-jobs`, headers: owner.headers, payload });
    assert.equal(accepted.statusCode, 201); assert.equal(accepted.json().billingStatus, 'held'); assert.equal(accepted.json().reservedCredits, 7);
    assert.equal('binding' in accepted.json(), false); assert.equal('response' in accepted.json(), false);
    const replay = await localApp.inject({ method: 'POST', url: `${url}/script-jobs`, headers: owner.headers, payload });
    assert.equal(replay.json().id, accepted.json().id); assert.equal((await localServices.billing.summary(owner.session.userId)).balance, 73);
  } finally { await localApp.close(); }
});

async function login() {
  const app = await appPromise;
  const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } });
  assert.equal(response.statusCode, 200);
  const session = GuestSession.parse(response.json());
  return { headers: { authorization: `Bearer ${session.token}` } };
}

async function loginSession(app: Awaited<typeof appPromise>) {
  const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } });
  assert.equal(response.statusCode, 200);
  const session = GuestSession.parse(response.json());
  return { session, headers: { authorization: `Bearer ${session.token}` } };
}

async function createStoryboardFixture(testServices: ReturnType<typeof createServices>, userId: string, title: string, publishCandidateImage: boolean) {
  const project = await testServices.drama.create({ userId, mode: 'script', title, content: script, look: '都市漫画', aspectRatio: '9:16', episodeCount: 1 });
  const materialSha = randomBytes(32).toString('hex');
  const material = await testServices.materials.register({
    userId, objectKey: `materials/${userId}/${materialSha}.jpg`, sha256: materialSha, byteLength: 128,
    contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const role = await testServices.drama.createRole({ userId, projectId: project.id, name: '林夏', description: '蓝色雨衣。', referenceMaterialId: material.id });
  const scene = await testServices.drama.createScene({ userId, projectId: project.id, name: '车站', description: '夜，冷色灯光。' });
  const shot = await testServices.drama.createShot({ userId, projectId: project.id, episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在车站。' });
  const candidate = await testServices.drama.createCandidate({ userId, shotId: shot.id, roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景，林夏站在车站。' });
  await testServices.drama.selectCandidate({ userId, candidateId: candidate.id });
  let imageJobId: string | null = null;
  if (publishCandidateImage) {
    const imageJob = await testServices.dramaImages.create({ userId, candidateId: candidate.id, requestKey: randomUUID() });
    imageJobId = imageJob.id;
    const imageSha = randomBytes(32).toString('hex');
    await testServices.dramaImageAssets.publish({ userId, jobId: imageJob.id,
      objectKey: `drama-image-jobs/${imageJob.id}/${imageSha}.png`, sha256: imageSha, byteLength: 73, width: 16, height: 16 });
  }
  return { project, role, scene, shot, candidate, imageJobId };
}

test('drama endpoints persist script versions, validate payloads and enforce ownership', async () => {
  const app = await appPromise;
  const owner = await login();
  const other = await login();
  const payload = CreateDramaProject.parse({ mode: 'script', title: '校园故事', content: script, look: '3D国创', aspectRatio: '9:16', episodeCount: 5 });
  assert.equal((await app.inject({ method: 'POST', url: '/v2/drama/projects', payload })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v2/drama/projects', headers: owner.headers, payload: { ...payload, userId: 'forbidden' } })).statusCode, 400);
  const createdResponse = await app.inject({ method: 'POST', url: '/v2/drama/projects', headers: owner.headers, payload });
  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = DramaProjectView.parse(createdResponse.json());
  assert.equal(created.activeVersion?.parse.status, 'parsed');
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/projects/${created.id}`, headers: other.headers })).statusCode, 404);
  const listed = DramaProjectList.parse((await app.inject({ method: 'GET', url: '/v2/drama/projects', headers: owner.headers })).json());
  assert.ok(listed.items.some(item => item.id === created.id));
  const scripts = DramaScriptList.parse((await app.inject({ method: 'GET', url: '/v2/drama/scripts', headers: owner.headers })).json());
  const library = scripts.items.find(item => item.id === created.scriptId);
  assert.ok(library);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/scripts/${library.id}`, headers: other.headers })).statusCode, 404);
  const fetched = DramaScriptView.parse((await app.inject({ method: 'GET', url: `/v2/drama/scripts/${library.id}`, headers: owner.headers })).json());
  assert.equal(fetched.latestVersion.content, script);
  const repairedResponse = await app.inject({ method: 'POST', url: `/v2/drama/scripts/${library.id}/versions`, headers: owner.headers, payload: { content: 'broken' } });
  assert.equal(repairedResponse.statusCode, 201);
  const repaired = DramaScriptVersion.parse(repairedResponse.json());
  assert.equal(repaired.ordinal, 2);
  assert.equal(repaired.parse.status, 'needs_repair');
  assert.equal((await app.inject({ method: 'POST', url: `/v2/drama/scripts/${library.id}/versions`, headers: other.headers, payload: { content: script } })).statusCode, 404);
});

test('drama workflow endpoints persist versioned plans without creating a generation job', async () => {
  const app = await appPromise;
  const owner = await login();
  const other = await login();
  const created = DramaProjectView.parse((await app.inject({
    method: 'POST', url: '/v2/drama/projects', headers: owner.headers,
    payload: { mode: 'script', title: '站台故事', content: script, look: '都市漫画', aspectRatio: '9:16', episodeCount: 1 },
  })).json());
  const sha256 = randomBytes(32).toString('hex');
  const ownerSession = GuestSession.parse((await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } })).json());
  const material = await services.materials.register({
    userId: ownerSession.userId, objectKey: `materials/${ownerSession.userId}/${sha256}.jpg`, sha256,
    byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const rejected = await app.inject({ method: 'POST', url: `/v2/drama/projects/${created.id}/roles`, headers: owner.headers, payload: { name: '林夏', description: '蓝色雨衣。', referenceMaterialId: material.id } });
  assert.equal(rejected.statusCode, 404, rejected.body);
  const session = GuestSession.parse((await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } })).json());
  const ownMaterialSha = randomBytes(32).toString('hex');
  const ownMaterial = await services.materials.register({
    userId: session.userId, objectKey: `materials/${session.userId}/${ownMaterialSha}.jpg`, sha256: ownMaterialSha,
    byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const ownHeaders = { authorization: `Bearer ${session.token}` };
  const ownProject = DramaProjectView.parse((await app.inject({ method: 'POST', url: '/v2/drama/projects', headers: ownHeaders, payload: { mode: 'script', title: '自有项目', content: script, look: '都市漫画', aspectRatio: '9:16', episodeCount: 1 } })).json());
  const role = DramaRole.parse((await app.inject({ method: 'POST', url: `/v2/drama/projects/${ownProject.id}/roles`, headers: ownHeaders, payload: { name: '林夏', description: '蓝色雨衣。', referenceMaterialId: ownMaterial.id } })).json());
  const scene = DramaScene.parse((await app.inject({ method: 'POST', url: `/v2/drama/projects/${ownProject.id}/scenes`, headers: ownHeaders, payload: { name: '车站', description: '夜，冷色灯光。' } })).json());
  const shot = DramaStoryboardShot.parse((await app.inject({ method: 'POST', url: `/v2/drama/projects/${ownProject.id}/shots`, headers: ownHeaders, payload: { episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在车站。' } })).json());
  const planned = DramaStoryboardCandidate.parse((await app.inject({ method: 'POST', url: `/v2/drama/shots/${shot.id}/candidates`, headers: ownHeaders, payload: { roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景，林夏站在车站。' } })).json());
  const selected = DramaStoryboardCandidate.parse((await app.inject({ method: 'POST', url: `/v2/drama/candidates/${planned.id}/select`, headers: ownHeaders })).json());
  assert.ok(selected.selectedAt);
  const workflow = DramaProjectWorkflow.parse((await app.inject({ method: 'GET', url: `/v2/drama/projects/${ownProject.id}/workflow`, headers: ownHeaders })).json());
  assert.equal(workflow.shots[0].candidates[0].id, planned.id);
  assert.equal((await app.inject({ method: 'GET', url: `/v2/drama/projects/${ownProject.id}/workflow`, headers: other.headers })).statusCode, 404);
});

test('candidate image media is owner-scoped, gated on a published asset and re-signs without re-charging', async () => {
  const app = await appPromise;
  const session = GuestSession.parse((await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } })).json());
  const other = GuestSession.parse((await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } })).json());
  const headers = { authorization: `Bearer ${session.token}` };
  const blocked = await app.inject({ method: 'POST', url: `/v2/drama/candidates/${randomUUID()}/image-jobs`, headers, payload: { requestKey: randomUUID() } });
  assert.equal(blocked.statusCode, 503, 'default bootstrap keeps candidate image admission closed');

  const mediaServices = createServices(databaseUrl);
  let signed = 0;
  const store: ObjectStore = { probe: async () => {}, put: async () => {}, remove: async () => {}, read: async () => Buffer.alloc(0), close() {},
    access: async (objectKey, seconds, contentType) => {
      signed++;
      assert.ok(seconds > 0 && seconds <= 600);
      assert.equal(contentType, 'image/png');
      assert.match(objectKey, /^drama-image-jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.png$/);
      return `https://private.invalid/image.png?signature=test-${signed}`;
    } };
  const mediaApp = await createApplication({ config: { databaseUrl, port: 3011 }, services: mediaServices, generationAvailable: true, objectStore: store });
  await mediaApp.init(); await mediaApp.getHttpAdapter().getInstance().ready();
  try {
    await mediaServices.billing.grant({ userId: session.userId, billingKey: `test-drama-image-media:${session.userId}`, amount: 300 });
    const project = DramaProjectView.parse((await mediaApp.inject({ method: 'POST', url: '/v2/drama/projects', headers, payload: { mode: 'script', title: '媒体权限', content: script, look: '3D国创', aspectRatio: '9:16', episodeCount: 1 } })).json());
    const materialSha = randomBytes(32).toString('hex');
    const material = await mediaServices.materials.register({
      userId: session.userId, objectKey: `materials/${session.userId}/${materialSha}.jpg`, sha256: materialSha,
      byteLength: 128, contentType: 'image/jpeg', width: 16, height: 16, expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const role = DramaRole.parse((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/roles`, headers, payload: { name: '林夏', description: '蓝色雨衣。', referenceMaterialId: material.id } })).json());
    const scene = DramaScene.parse((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/scenes`, headers, payload: { name: '车站', description: '夜。' } })).json());
    const shot = DramaStoryboardShot.parse((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/shots`, headers, payload: { episodeNumber: 1, sceneNumber: 1, prompt: '林夏站在车站。' } })).json());
    const candidate = DramaStoryboardCandidate.parse((await mediaApp.inject({ method: 'POST', url: `/v2/drama/shots/${shot.id}/candidates`, headers, payload: { roleVersionId: role.latestVersion.id, sceneVersionId: scene.latestVersion.id, prompt: '远景。' } })).json());
    const jobResponse = await mediaApp.inject({ method: 'POST', url: `/v2/drama/candidates/${candidate.id}/image-jobs`, headers, payload: { requestKey: randomUUID() } });
    assert.equal(jobResponse.statusCode, 200, jobResponse.body);
    assert.equal('actualCostCents' in jobResponse.json(), false, 'internal supplier cost must not leak through the job view');
    const job = DramaImageJobView.parse(jobResponse.json());
    assert.equal(job.status, 'accepted');
    const mediaUrl = `/v2/drama/image-jobs/${job.id}/media`;
    assert.equal((await mediaApp.inject({ method: 'GET', url: mediaUrl, headers })).statusCode, 404, 'accepted job has no downloadable media yet');
    const sha256 = randomBytes(32).toString('hex');
    await mediaServices.dramaImageAssets.publish({ userId: session.userId, jobId: job.id, objectKey: `drama-image-jobs/${job.id}/${sha256}.png`, sha256, byteLength: 73, width: 16, height: 16 });
    assert.equal((await mediaApp.inject({ method: 'GET', url: mediaUrl })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'GET', url: mediaUrl, headers: { authorization: `Bearer ${other.token}` } })).statusCode, 404);
    assert.equal(signed, 0);
    const own = await mediaApp.inject({ method: 'GET', url: mediaUrl, headers });
    assert.equal(own.statusCode, 200, own.body);
    const access = DramaImageAccess.parse(own.json());
    assert.equal(access.sha256, sha256);
    assert.equal(access.jobId, job.id);
    assert.equal('objectKey' in own.json(), false);
    assert.ok(Date.parse(access.urlExpiresAt) - Date.now() <= 600_000);
    assert.equal(signed, 1);
    const entriesBefore = (await mediaServices.billing.entries({ userId: session.userId })).entries.length;
    const repeat = await mediaApp.inject({ method: 'GET', url: mediaUrl, headers });
    assert.equal(repeat.statusCode, 200);
    assert.notEqual(DramaImageAccess.parse(repeat.json()).url, access.url, '每次下载应重新签发新 URL');
    assert.equal((await mediaServices.billing.entries({ userId: session.userId })).entries.length, entriesBefore, '重复下载不得产生新的账务流水');
    assert.equal((await mediaServices.billing.summary(session.userId)).balance, SIGNUP_GRANT_CREDITS + 300 - DRAMA_IMAGE_PRICING.credits);
  } finally { await mediaApp.close(); }
});

test('shot video and export endpoints preserve ownership, idempotency, refunds and private media boundaries', async () => {
  const mediaServices = createServices(databaseUrl);
  let signed = 0;
  const objectStore: ObjectStore = { probe: async () => {}, put: async () => {}, remove: async () => {}, read: async () => Buffer.alloc(0), close() {},
    access: async (objectKey, seconds, contentType) => {
      signed++;
      assert.ok(seconds >= 1 && seconds <= 600);
      assert.equal(contentType, 'video/mp4');
      assert.match(objectKey, /^drama-(?:shot-video|export)-jobs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.mp4$/);
      return `https://private.invalid/video.mp4?signature=test-${signed}`;
    } };
  const mediaApp = await createApplication({ config: { databaseUrl, port: 3011 }, services: mediaServices, generationAvailable: true, objectStore });
  await mediaApp.init(); await mediaApp.getHttpAdapter().getInstance().ready();
  let noStoreApp: Awaited<ReturnType<typeof createApplication>> | null = null;
  try {
    const { session: owner, headers } = await loginSession(mediaApp);
    const { headers: otherHeaders } = await loginSession(mediaApp);
    await mediaServices.billing.grant({ userId: owner.userId, billingKey: `test-drama-video-export:${owner.userId}`, amount: 1000 });

    const baseApp = await appPromise;
    assert.equal((await baseApp.inject({ method: 'POST', url: `/v2/drama/candidates/${randomUUID()}/video-jobs`, headers,
      payload: { requestKey: randomUUID() } })).statusCode, 503, 'default API bootstrap keeps generation admission closed');

    const incomplete = await createStoryboardFixture(mediaServices, owner.userId, '缺少逐镜视频', false);
    const validExportBody = { episodeNumber: 1, requestKey: randomUUID() };
    assert.equal((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${incomplete.project.id}/exports`, payload: validExportBody })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'POST', url: '/v2/drama/projects/not-a-uuid/exports', headers, payload: validExportBody })).statusCode, 400);
    assert.equal((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${incomplete.project.id}/exports`, headers,
      payload: { episodeNumber: 0, requestKey: randomUUID() } })).statusCode, 400);
    assert.equal((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${incomplete.project.id}/exports`, headers: otherHeaders, payload: validExportBody })).statusCode, 404);
    assert.equal((await mediaApp.inject({ method: 'POST', url: `/v2/drama/projects/${incomplete.project.id}/exports`, headers, payload: validExportBody })).statusCode, 409,
      'export admission requires a published video for every selected shot');

    const fixture = await createStoryboardFixture(mediaServices, owner.userId, '逐镜与导出闭环', true);
    const alternate = await mediaServices.drama.createCandidate({ userId: owner.userId, shotId: fixture.shot.id,
      roleVersionId: fixture.role.latestVersion.id, sceneVersionId: fixture.scene.latestVersion.id, prompt: '备用候选。' });
    await mediaServices.drama.selectCandidate({ userId: owner.userId, candidateId: alternate.id });
    const videoUrl = `/v2/drama/candidates/${fixture.candidate.id}/video-jobs`;
    assert.equal((await mediaApp.inject({ method: 'POST', url: videoUrl, payload: { requestKey: randomUUID() } })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'POST', url: `/v2/drama/candidates/not-a-uuid/video-jobs`, headers, payload: { requestKey: randomUUID() } })).statusCode, 400);
    assert.equal((await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: 'bad' } })).statusCode, 400);
    assert.equal((await mediaApp.inject({ method: 'POST', url: videoUrl, headers: otherHeaders, payload: { requestKey: randomUUID() } })).statusCode, 404);
    assert.equal((await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: randomUUID() } })).statusCode, 409,
      'candidate ID must still identify the selected candidate at admission');
    await mediaServices.drama.selectCandidate({ userId: owner.userId, candidateId: fixture.candidate.id });

    const firstKey = randomUUID();
    const acceptedResponse = await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: firstKey } });
    assert.equal(acceptedResponse.statusCode, 200, acceptedResponse.body);
    const accepted = DramaShotVideoJobView.parse(acceptedResponse.json());
    assert.equal(accepted.status, 'accepted');
    assert.equal('outputRef' in acceptedResponse.json(), false);
    assert.equal('actualCostCents' in acceptedResponse.json(), false);
    assert.equal(DramaShotVideoJobView.parse((await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: firstKey } })).json()).id, accepted.id);
    const videoJobUrl = `/v2/drama/video-jobs/${accepted.id}`;
    const videoMediaUrl = `${videoJobUrl}/media`;
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoJobUrl })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoJobUrl, headers: otherHeaders })).statusCode, 404);
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoJobUrl, headers })).statusCode, 200);
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoMediaUrl, headers })).statusCode, 404, 'accepted video has no downloadable media');

    await mediaServices.dramaShotVideos.fail({ userId: owner.userId, jobId: accepted.id, failureCode: 'SOURCE_ASSET_UNAVAILABLE' });
    const failed = DramaShotVideoJobView.parse((await mediaApp.inject({ method: 'GET', url: videoJobUrl, headers })).json());
    assert.equal(failed.status, 'failed');
    assert.equal(failed.failureCode, 'SOURCE_ASSET_UNAVAILABLE');
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoMediaUrl, headers })).statusCode, 404);
    assert.equal(DramaShotVideoJobView.parse((await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: firstKey } })).json()).id, accepted.id,
      'same request key replays the failed job');

    const retryResponse = await mediaApp.inject({ method: 'POST', url: videoUrl, headers, payload: { requestKey: randomUUID() } });
    assert.equal(retryResponse.statusCode, 200, retryResponse.body);
    const retry = DramaShotVideoJobView.parse(retryResponse.json());
    assert.notEqual(retry.id, accepted.id);
    const videoSha = randomBytes(32).toString('hex');
    await mediaServices.dramaShotVideoAssets.publish({ userId: owner.userId, jobId: retry.id,
      objectKey: `drama-shot-video-jobs/${retry.id}/${videoSha}.mp4`, sha256: videoSha, byteLength: 3904, width: 240, height: 426, durationMs: 5000 });
    assert.equal(DramaShotVideoJobView.parse((await mediaApp.inject({ method: 'GET', url: videoJobUrl.replace(accepted.id, retry.id), headers })).json()).status, 'succeeded');
    const videoMediaPath = videoMediaUrl.replace(accepted.id, retry.id);
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoMediaPath })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'GET', url: videoMediaUrl.replace(accepted.id, retry.id), headers: otherHeaders })).statusCode, 404);
    const videoAccessResponse = await mediaApp.inject({ method: 'GET', url: videoMediaPath, headers });
    assert.equal(videoAccessResponse.statusCode, 200, videoAccessResponse.body);
    const videoAccess = DramaShotVideoAccess.parse(videoAccessResponse.json());
    assert.equal(videoAccess.sha256, videoSha);
    assert.equal('objectKey' in videoAccessResponse.json(), false);
    assert.equal('outputRef' in videoAccessResponse.json(), false);
    assert.ok(Date.parse(videoAccess.urlExpiresAt) - Date.now() <= 600_000);
    const videoAccessAgain = await mediaApp.inject({ method: 'GET', url: videoMediaPath, headers });
    assert.notEqual(DramaShotVideoAccess.parse(videoAccessAgain.json()).url, videoAccess.url);
    const workflow = DramaProjectWorkflow.parse((await mediaApp.inject({ method: 'GET', url: `/v2/drama/projects/${fixture.project.id}/workflow`, headers })).json());
    assert.deepEqual(workflow.shots[0].candidates.find(candidate => candidate.id === fixture.candidate.id)?.videoJob,
      { id: retry.id, status: 'succeeded', failureCode: null });

    const exportBody = { episodeNumber: 1, requestKey: randomUUID() };
    const exportUrl = `/v2/drama/projects/${fixture.project.id}/exports`;
    const exportResponse = await mediaApp.inject({ method: 'POST', url: exportUrl, headers, payload: exportBody });
    assert.equal(exportResponse.statusCode, 201, exportResponse.body);
    const exportJob = DramaExportJobView.parse(exportResponse.json());
    assert.equal(exportJob.status, 'accepted');
    assert.equal('outputRef' in exportResponse.json(), false);
    assert.equal('manifest' in exportResponse.json(), false);
    assert.equal('objectKey' in exportResponse.json(), false);
    assert.equal(DramaExportJobView.parse((await mediaApp.inject({ method: 'POST', url: exportUrl, headers, payload: exportBody })).json()).id, exportJob.id);
    const exportJobUrl = `/v2/drama/exports/${exportJob.id}`;
    const exportMediaUrl = `${exportJobUrl}/media`;
    assert.equal((await mediaApp.inject({ method: 'GET', url: exportJobUrl })).statusCode, 401);
    assert.equal((await mediaApp.inject({ method: 'GET', url: exportJobUrl, headers: otherHeaders })).statusCode, 404);
    assert.equal((await mediaApp.inject({ method: 'GET', url: exportJobUrl, headers })).statusCode, 200);
    assert.equal((await mediaApp.inject({ method: 'GET', url: exportMediaUrl, headers })).statusCode, 404, 'accepted export has no media');
    await mediaServices.dramaExports.fail({ userId: owner.userId, jobId: exportJob.id, failureCode: 'EXPORT_COMPOSITION_FAILED' });
    assert.equal(DramaExportJobView.parse((await mediaApp.inject({ method: 'GET', url: exportJobUrl, headers })).json()).status, 'failed');
    assert.equal((await mediaApp.inject({ method: 'GET', url: exportMediaUrl, headers })).statusCode, 404, 'failed export has no media');

    const successExport = DramaExportJobView.parse((await mediaApp.inject({ method: 'POST', url: exportUrl, headers,
      payload: { episodeNumber: 1, requestKey: randomUUID() } })).json());
    const exportSha = randomBytes(32).toString('hex');
    await mediaServices.dramaExportAssets.publish({ userId: owner.userId, jobId: successExport.id,
      objectKey: `drama-export-jobs/${successExport.id}/${exportSha}.mp4`, sha256: exportSha, byteLength: 10133, width: 240, height: 426, durationMs: 5000 });
    const successMediaUrl = `/v2/drama/exports/${successExport.id}/media`;
    assert.equal((await mediaApp.inject({ method: 'GET', url: successMediaUrl, headers: otherHeaders })).statusCode, 404);
    assert.equal((await mediaApp.inject({ method: 'GET', url: successMediaUrl })).statusCode, 401);
    const firstAccessResponse = await mediaApp.inject({ method: 'GET', url: successMediaUrl, headers });
    assert.equal(firstAccessResponse.statusCode, 200, firstAccessResponse.body);
    const firstAccess = DramaExportAccess.parse(firstAccessResponse.json());
    assert.equal(firstAccess.sha256, exportSha);
    assert.equal('objectKey' in firstAccessResponse.json(), false);
    assert.equal('outputRef' in firstAccessResponse.json(), false);
    assert.ok(Date.parse(firstAccess.urlExpiresAt) - Date.now() <= 600_000);
    const secondAccessResponse = await mediaApp.inject({ method: 'GET', url: successMediaUrl, headers });
    assert.notEqual(DramaExportAccess.parse(secondAccessResponse.json()).url, firstAccess.url);

    const noStoreServices = createServices(databaseUrl);
    noStoreApp = await createApplication({ config: { databaseUrl, port: 3011 }, services: noStoreServices });
    await noStoreApp.init(); await noStoreApp.getHttpAdapter().getInstance().ready();
    assert.equal((await noStoreApp.inject({ method: 'GET', url: successMediaUrl, headers })).statusCode, 503);
    await noStoreApp.close(); noStoreApp = null;
    assert.equal((await mediaServices.billing.summary(owner.userId)).balance,
      SIGNUP_GRANT_CREDITS + 1000 - DRAMA_IMAGE_PRICING.credits - DRAMA_SHOT_VIDEO_PRICING.credits,
      'failed shot video refunded once; successful retry settled once');
    assert.ok(signed >= 2);
  } finally {
    if (noStoreApp) await noStoreApp.close();
    await mediaApp.close();
  }
});
