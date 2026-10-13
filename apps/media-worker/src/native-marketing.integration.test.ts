import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServices, DomainError, nativeMarketingBinding } from '@wb/server';
import { readNativeVideo } from '@wb/media';
import { execFileSync } from 'node:child_process';
import type { ObjectStore } from '@wb/media';
import { createNativeMarketingActivity } from './native-marketing';

const databaseUrl = process.env.WB_NEXT_TEST_DATABASE_URL;
assert.ok(databaseUrl, 'Use pnpm verify:isolated');
const target = new URL(databaseUrl); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)); assert.match(target.pathname, /^\/workbench_(verify|audit)(?:[_-][a-zA-Z0-9_-]+)?$/);
const services = createServices(databaseUrl);
const font = process.env.MEDIA_FONT_FILE ?? (process.platform === 'win32' ? 'C:/Windows/Fonts/msyh.ttc' : '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc');
let source: Buffer;
before(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wb-native-test-'));
  try {
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=orange:s=720x1280:r=12:d=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-c:v', 'libx264', '-preset', 'ultrafast', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', 'source.mp4'], { cwd: directory, windowsHide: true, timeout: 30000, stdio: 'ignore' });
    source = await readFile(join(directory, 'source.mp4'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
after(() => services.close());
const status = (value: number) => (error: unknown) => error instanceof DomainError && error.statusCode === value;
async function fixture(category: 'commerce' | 'store_visit' = 'commerce', formal = false) {
  const { userId } = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
  const request = { category, prompt: '口播：咕嘟咕嘟，开吃啦。', materialIds: [], durationSec: 10 as const, resolution: '720p' as const, aspectRatio: '9:16' as const };
  const admission = { mockAvailable: !formal, ...(formal ? { offer: { binding: nativeMarketingBinding('https://atlas.invalid'), credits: 7 } } : {}) };
  const quote = await services.nativeMarketing.quote({ userId, request, ...admission });
  const job = await services.nativeMarketing.create({ userId, request: { ...request, quoteVersion: quote.version!, requestKey: randomUUID() }, ...admission });
  const input = { userId, jobId: job.id }; const claim = await services.providerSubmissions.begin({ ...input, providerKey: 'native-test' }); assert.ok(claim.claimed);
  await services.providerSubmissions.accepted({ ...input, token: claim.token, providerTaskId: `fixture-${job.id}` });
  const objects = new Map<string, Buffer>(); let sourceReads = 0, asrCalls = 0; let failRead = false;
  const store = {
    read: async (key: string) => { if (failRead) throw new Error('Temporary object-store failure'); const bytes = objects.get(key); assert.ok(bytes); return bytes; },
    put: async (key: string, bytes: Buffer, sha: string) => { assert.equal(createHash('sha256').update(bytes).digest('hex'), sha); objects.set(key, bytes); },
    remove: async (key: string) => { objects.delete(key); },
  } as ObjectStore;
  const options = { mockSource: async () => { sourceReads++; return source; }, transcribe: async () => { asrCalls++; return { sourceSha256: createHash('sha256').update(source).digest('hex'), transcript: '孤独孤独，开吃啦。', cues: [{ startMs: 500, endMs: 2500, text: '孤独孤独，' }, { startMs: 3000, endMs: 4500, text: '开吃啦。' }] }; } };
  return { input, objects, store, options, counts: () => ({ sourceReads, asrCalls }), failRead: (value: boolean) => { failRead = value; } };
}

test('native source and reviewed captions survive worker recreation, render failure and duplicate confirmation without another hold', async () => {
  for (const category of ['commerce', 'store_visit'] as const) {
    const f = await fixture(category); const activity = () => createNativeMarketingActivity(services, f.store, font, f.options);
    assert.equal((await activity()({ ...f.input, sourceUrl: 'https://mock.invalid/only-a-fixture' })).status, 'review_required');
    const review = await services.nativeMedia.get(f.input); assert.ok(review); assert.equal(review.state, 'review'); assert.equal(review.revision, 1);
    assert.equal((await activity()(f.input)).status, 'review_required'); assert.deepEqual(f.counts(), { sourceReads: 1, asrCalls: 1 });
    const other = await services.identity.bootstrapGuest(randomBytes(32).toString('hex'));
    await assert.rejects(services.nativeMedia.get({ ...f.input, userId: other.userId }), status(404));
    await assert.rejects(services.nativeMedia.capture({ ...f.input, ...review, objectKey: review.objectKey, sha256: 'a'.repeat(64) }), status(400));
    const output = { ...f.input, objectKey: `jobs/${f.input.jobId}/${'b'.repeat(64)}.mp4`, sha256: 'b'.repeat(64), byteLength: 123, width: 720, height: 1280, durationMs: 10000, sourceSha256: review.sha256, revision: 1 };
    await assert.rejects(services.nativeMedia.publish(output), status(409));
    await assert.rejects(services.assets.publish(output), status(409));
    const request = { requestKey: randomUUID(), revision: 1, cues: review.cues.map((cue, i) => ({ ...cue, text: i === 0 ? '咕嘟咕嘟，' : cue.text })) };
    await assert.rejects(services.nativeMedia.confirm({ ...f.input, request: { ...request, cues: [{ startMs: 0, endMs: 11000, text: '越界' }] } }), status(400));
    const ready = await services.nativeMedia.confirm({ ...f.input, request }); assert.equal(ready.state, 'ready'); assert.equal(ready.revision, 2);
    await Promise.all(Array.from({ length: 4 }, () => services.nativeMedia.confirm({ ...f.input, request })));
    await assert.rejects(services.nativeMedia.confirm({ ...f.input, request: { ...request, requestKey: randomUUID() } }), status(409));
    f.failRead(true); await assert.rejects(activity()(f.input)); assert.equal((await services.nativeMedia.get(f.input))?.issue, 'render_failed');
    assert.equal((await services.generation.get(f.input)).status, 'accepted'); assert.equal((await services.billing.summary(f.input.userId)).balance, 73);
    f.failRead(false); assert.equal((await activity()(f.input)).status, 'published'); assert.equal((await services.nativeMedia.get(f.input))?.issue, null);
    assert.equal((await activity()(f.input)).status, 'terminal'); assert.deepEqual(f.counts(), { sourceReads: 1, asrCalls: 1 });
    const asset = await services.assets.get(f.input); assert.ok(asset.durationMs >= 9700); assert.equal(f.objects.size, 2); assert.ok(f.objects.has(review.objectKey));
    const entries = await services.billing.entries({ userId: f.input.userId });
    assert.equal(entries.entries.filter(item => item.type === 'hold').length, 1); assert.equal(entries.entries.filter(item => item.type === 'settle').length, 1); assert.equal(entries.entries.filter(item => item.type === 'refund').length, 0);
  }
});

test('formal native media resumes from private source without provider URL and settles original quote', async () => {
  for (const category of ['commerce', 'store_visit'] as const) {
    const f = await fixture(category, true); const video = await readNativeVideo(source);
    const objectKey = `native-marketing-source/${f.input.jobId}/${video.sha256}.mp4`;
    await f.store.put(objectKey, source, video.sha256);
    await services.nativeMedia.capture({ ...f.input, objectKey, sha256: video.sha256, byteLength: source.length, width: video.width, height: video.height, durationMs: video.durationMs });
    const previewJob = await services.generation.get(f.input);
    assert.equal(previewJob.status, 'accepted'); assert.equal(previewJob.actualCredits, 7); assert.equal(previewJob.settlementPoint, 'preview');
    assert.equal((await services.billing.summary(f.input.userId)).entries.filter(entry => entry.type === 'settle').length, 1);
    await assert.rejects(services.generation.fail({ ...f.input, failureCode: 'SUBTITLE_ERROR_MUST_NOT_REFUND_VIDEO' }), status(409));
    const process = createNativeMarketingActivity(services, f.store, font, f.options);
    assert.equal((await process(f.input)).status, 'review_required');
    const review = await services.nativeMedia.get(f.input); assert.ok(review);
    await services.nativeMedia.confirm({ ...f.input, request: { requestKey: randomUUID(), revision: review.revision, cues: review.cues } });
    const resumed = createNativeMarketingActivity(services, f.store, font, { transcribe: async () => { throw new Error('Must reuse confirmed captions'); } });
    assert.equal((await resumed(f.input)).status, 'published'); assert.equal((await resumed(f.input)).status, 'terminal');
    assert.deepEqual(f.counts(), { sourceReads: 0, asrCalls: 1 });
    const job = await services.generation.get(f.input); assert.equal(job.provider, 'atlas'); assert.equal(job.actualCredits, 7);
    const entries = (await services.billing.summary(f.input.userId)).entries;
    assert.equal(entries.filter(entry => entry.type === 'hold').length, 1); assert.equal(entries.filter(entry => entry.type === 'settle').length, 1);
  }
});

test('source upload failure cannot charge the preview fee before a usable private video exists', async () => {
  const f = await fixture();
  const store = { ...f.store, put: async () => { throw new Error('Storage unavailable'); } };
  const process = createNativeMarketingActivity(services, store, font, f.options);
  await assert.rejects(process({ ...f.input, sourceUrl: 'https://mock.invalid/source.mp4' }));
  assert.equal(await services.nativeMedia.get(f.input), null); assert.equal((await services.generation.get(f.input)).actualCredits, null);
  const entries = (await services.billing.summary(f.input.userId)).entries; assert.equal(entries.filter(entry => entry.type === 'hold').length, 1); assert.equal(entries.filter(entry => entry.type === 'settle').length, 0); assert.equal(entries.filter(entry => entry.type === 'refund').length, 0);
});
