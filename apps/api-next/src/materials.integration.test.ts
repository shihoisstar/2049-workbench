import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { ErrorCode, GuestSession, MaterialView, MaterialAccess, SaveDramaPreparation, MATERIAL_TTL_MS } from '@wb/contracts';
import { createServices } from '@wb/server';
import type { ObjectStore } from '@wb/media';
import postgres from 'postgres';
import { createApplication } from './application';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl);
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol));
assert.equal(target.search + target.hash, '');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const sql = postgres(databaseUrl, { max: 1 });
const appPromise = createApplication({ config: { databaseUrl, port: 3014 }, services, generationAvailable: true });
const puts: { objectKey: string; sha256: string; contentType: string }[] = [];
const accesses: { objectKey: string; seconds: number }[] = [];
const materialServices = createServices(databaseUrl);
const materialAppPromise = createApplication({
  config: { databaseUrl, port: 3015 }, services: materialServices, generationAvailable: true,
  objectStore: {
    probe: async () => {}, remove: async () => {}, read: async () => Buffer.alloc(0), close() {},
    put: async (objectKey: string, _bytes: Buffer, sha256: string, contentType?: string) => { puts.push({ objectKey, sha256, contentType: contentType ?? 'video/mp4' }); },
    access: async (objectKey, seconds) => { accesses.push({ objectKey, seconds }); return `https://private.invalid/reference/${randomUUID()}`; },
  } satisfies ObjectStore,
});
before(async () => {
  for (const app of [await appPromise, await materialAppPromise]) {
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }
});
after(async () => {
  await (await appPromise).close();
  await (await materialAppPromise).close();
  await sql.end();
});
const settings = { resolution: '480p', aspectRatio: '9:16', durationSec: 5 } as const;
// 1×1 PNG, 67 bytes — well-formed, decodable by image-size.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Buffer) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 4 + body.length);
  return out;
}
/** 1×1 真彩 PNG,像素颜色可辨,内容寻址后 sha256 互不相同。 */
function makePng(r: number, g: number, b: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(Buffer.from([0, r, g, b]));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
const pngs = [makePng(0xd8, 0x26, 0x26), makePng(0x26, 0xd8, 0x26), makePng(0x26, 0x26, 0xd8), makePng(0xd8, 0xd8, 0x26)];

async function login() {
  const app = await appPromise;
  const response = await app.inject({ method: 'POST', url: '/v2/auth/guest', payload: { credential: randomBytes(32).toString('hex') } });
  assert.equal(response.statusCode, 200);
  const session = GuestSession.parse(response.json());
  return { ...session, headers: { authorization: `Bearer ${session.token}` } };
}
function multipart(bytes: Buffer, contentType: string) {
  const boundary = '----wb-material-test';
  const head = `--${boundary}\r\ncontent-disposition: form-data; name="file"; filename="material.png"\r\ncontent-type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), bytes, Buffer.from(tail)]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}
async function upload(bytes: Buffer, contentType: string, headers: Record<string, string>) {
  const app = await materialAppPromise;
  const part = multipart(bytes, contentType);
  return app.inject({ method: 'POST', url: '/v2/materials', headers: { ...headers, 'content-type': part.contentType }, payload: part.payload });
}

test('material upload demands auth, a supported content type, and decodable image bytes', async () => {
  const user = await login();
  assert.equal((await upload(png, 'image/png', {})).statusCode, 401);
  assert.equal((await upload(png, 'text/plain', user.headers)).statusCode, 400);
  assert.equal((await upload(png, 'image/gif', user.headers)).statusCode, 400);
  assert.equal((await upload(Buffer.from('not an image at all'), 'image/png', user.headers)).statusCode, 400);
  assert.equal((await upload(Buffer.alloc(0), 'image/png', user.headers)).statusCode, 400);
});

test('material upload stores bytes privately and stamps a seven-day lifetime', async () => {
  const user = await login();
  const before = Date.now();
  const response = await upload(png, 'image/png', user.headers);
  assert.equal(response.statusCode, 201);
  const view = MaterialView.parse(response.json());
  const sha256 = createHash('sha256').update(png).digest('hex');
  assert.equal(view.sha256, sha256);
  assert.equal(view.contentType, 'image/png');
  assert.equal(view.byteLength, png.length);
  assert.equal(view.width, 1);
  assert.equal(view.height, 1);
  assert.equal(view.status, 'active');
  const expiresAt = Date.parse(view.expiresAt);
  assert.ok(expiresAt >= before + MATERIAL_TTL_MS - 5000 && expiresAt <= Date.now() + MATERIAL_TTL_MS + 5000, '有效期应为上传后 7 天');
  const put = puts.find(entry => entry.sha256 === sha256);
  assert.ok(put, '对象存储应收到私有写入');
  assert.match(put.objectKey, new RegExp(`^materials/${user.userId}/${sha256}\\.png$`));
  assert.equal(put.contentType, 'image/png');
});

test('re-uploading identical bytes returns the same material and renews its lifetime', async () => {
  const user = await login();
  const first = MaterialView.parse((await upload(png, 'image/png', user.headers)).json());
  const renewedAt = Date.now();
  const response = await upload(png, 'image/png', user.headers);
  assert.equal(response.statusCode, 201);
  const again = MaterialView.parse(response.json());
  assert.equal(again.id, first.id, '内容寻址:重复上传应命中同一素材');
  assert.ok(Date.parse(again.expiresAt) > Date.parse(first.expiresAt), '重复上传应续期');
  assert.ok(Date.parse(again.expiresAt) >= renewedAt + MATERIAL_TTL_MS - 5000);
});

test('a generation job can only reference the owner\'s active materials in order', async () => {
  const owner = await login();
  const stranger = await login();
  // 480p 一条 77 积分,注册赠 80;超额校验发生在扣费路径上,先把钱包垫足以免先撞 Insufficient credits。
  await services.billing.grant({ userId: owner.userId, billingKey: `grant:${randomUUID()}`, amount: 1000 });
  const uploaded: MaterialView[] = [];
  for (const bytes of pngs) {
    const response = await upload(bytes, 'image/png', owner.headers);
    assert.equal(response.statusCode, 201);
    uploaded.push(MaterialView.parse(response.json()));
  }
  const [first, second] = uploaded;
  // 素材属于上传者;他人引用按不存在处理,避免探测他人素材。
  await assert.rejects(
    services.generation.create({ userId: stranger.userId, requestKey: randomUUID(), prompt: '偷用他人素材', ...settings, materialIds: [first.id] }),
    (error: unknown) => (error as { code?: number }).code === ErrorCode.MATERIAL_NOT_FOUND,
  );
  // 有序去重:重复 ID 只记一次,链接表按提交顺序排列。
  const job = await services.generation.create({ userId: owner.userId, requestKey: randomUUID(), prompt: '多素材任务', ...settings, materialIds: [second.id, first.id, second.id] });
  assert.deepEqual((await services.generation.get({ userId: owner.userId, jobId: job.id })).materialIds, [second.id, first.id]);
  const linked = await services.materials.listForJob({ userId: owner.userId, jobId: job.id });
  assert.deepEqual(linked.map(material => material.id), [second.id, first.id]);
  // 上限三张:第 4 张触发契约校验。
  await assert.rejects(
    services.generation.create({ userId: owner.userId, requestKey: randomUUID(), prompt: '超过三张', ...settings, materialIds: uploaded.map(material => material.id) }),
    (error: unknown) => (error as { code?: number }).code === ErrorCode.VALIDATION,
  );
});

test('reference access is owner scoped and signed only within the remaining material lifetime', async () => {
  const user = await login(); const other = await login(); const app = await materialAppPromise;
  const material = MaterialView.parse((await upload(png, 'image/png', user.headers)).json());
  const before = accesses.length;
  assert.equal((await app.inject({ method: 'GET', url: `/v2/materials/${material.id}/access`, headers: other.headers })).statusCode, 404);
  assert.equal(accesses.length, before);
  const result = await app.inject({ method: 'GET', url: `/v2/materials/${material.id}/access`, headers: user.headers });
  assert.equal(result.statusCode, 200); const access = MaterialAccess.parse(result.json());
  assert.equal(access.materialId, material.id); assert.ok(accesses.at(-1)!.seconds <= 600);
  assert.ok(Date.parse(access.urlExpiresAt) <= Date.parse(material.expiresAt)); assert.equal('objectKey' in result.json(), false);
  await sql`update wb_next.user_materials set status = 'expired', expires_at = clock_timestamp() - interval '1 second' where id = ${material.id}`;
  const signed = accesses.length;
  assert.equal((await app.inject({ method: 'GET', url: `/v2/materials/${material.id}/access`, headers: user.headers })).statusCode, 410); assert.equal(accesses.length, signed);
});

test('role appearance HTTP confirms a saved owned image but refuses a client supplied version', async () => {
  const user = await login(); const app = await materialAppPromise;
  const material = MaterialView.parse((await upload(png, 'image/png', user.headers)).json());
  const input = { userId: user.userId };
  const project = await services.drama.create({ ...input, mode: 'script', title: '确认形象HTTP', content: '## 第1集\n**场景1：飞船 日/内**\n阿橘：出发。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
  const locator = { ...input, projectId: project.id };
  await services.dramaScripts.confirm({ ...locator, versionId: project.activeVersionId! });
  const prepared = await services.drama.getPreparation(locator);
  const draft = SaveDramaPreparation.parse({ scriptVersionId: prepared.scriptVersionId, baseRevision: prepared.revision,
    roles: prepared.roles.map(({ key, name, usage, description }) => ({ key, name, usage, description, referenceMaterialId: material.id })), scenes: prepared.scenes.map(({ key, description }) => ({ key, description })) });
  const saved = await app.inject({ method: 'POST', url: `/v2/drama/projects/${project.id}/preparation`, headers: user.headers, payload: draft }); assert.equal(saved.statusCode, 200);
  const payload = { scriptVersionId: prepared.scriptVersionId, preparationRevision: saved.json().revision, roleKey: prepared.roles[0].key };
  const url = `/v2/drama/projects/${project.id}/role-appearance`;
  assert.equal((await app.inject({ method: 'POST', url, headers: user.headers, payload: { ...payload, roleVersionId: randomUUID() } })).statusCode, 400);
  const result = await app.inject({ method: 'POST', url, headers: user.headers, payload }); assert.equal(result.statusCode, 200);
  assert.equal(result.json().roles[0].selection.status, 'confirmed'); assert.equal(result.json().roles[0].selection.referenceSha256, material.sha256);
  assert.equal((await services.billing.summary(user.userId)).balance, 80);
});

test('an expired material is refused at submission time instead of silently used', async () => {
  const user = await login();
  await services.billing.grant({ userId: user.userId, billingKey: `grant:${randomUUID()}`, amount: 1000 });
  // material_state CHECK 禁止 active 行带过去时间;过期素材以 expired 状态直插,与 sweepExpired 的产物一致。
  const [dead] = await sql<{ id: string }[]>`
    insert into wb_next.user_materials
      (id, user_id, object_key, sha256, byte_length, content_type, width, height, status, expires_at)
    values (${randomUUID()}, ${user.userId}, ${`materials/${user.userId}/${'c'.repeat(64)}.png`}, ${'c'.repeat(64)},
      ${png.length}, 'image/png', 1, 1, 'expired', ${new Date(Date.now() - 60_000)})
    returning id`;
  await assert.rejects(
    services.generation.create({ userId: user.userId, requestKey: randomUUID(), prompt: '引用过期素材', ...settings, materialIds: [dead.id] }),
    (error: unknown) => (error as { code?: number }).code === ErrorCode.MATERIAL_EXPIRED,
  );
});
