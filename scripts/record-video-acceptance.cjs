const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash, randomBytes } = require('node:crypto');
const { createObjectStore } = require('../packages/media/dist');
const postgres = createRequire(path.resolve(__dirname, '../packages/server/package.json'))('postgres');
async function main() {
  const jobId = process.argv[2], kind = process.argv[3];
  assert.match(jobId ?? '', /^[a-f0-9-]{36}$/); assert.ok(['mock', 'real'].includes(kind));
  const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.local/video-acceptance/state.json'), 'utf8'));
  assert.equal(new URL(state.apiBase).hostname, '127.0.0.1');
  const sql = postgres(state.databaseUrl, { max: 2 });
  let store;
  try {
    const [job] = await sql`select j.*, p.provider_key, p.provider_task_id from wb_next.generation_jobs j left join wb_next.provider_submissions p on p.job_id=j.id where j.id=${jobId}`;
    assert.ok(job);
    assert.equal(Number(job.reserved_credits), 77);
    const entries = await sql`select kind, amount from wb_next.ledger where user_id=${job.user_id} and billing_key=${`generation:${jobId}`} order by id`;
    assert.equal(entries.filter(entry => entry.kind === 'hold').length, 1);
    const [wallet] = await sql`select w.balance, (select sum(amount) from wb_next.ledger where user_id=w.user_id) as ledger_sum from wb_next.wallets w where w.user_id=${job.user_id}`;
    assert.equal(wallet.balance, wallet.ledger_sum);
    const report = { kind, jobId, status: job.status, providerTaskId: job.provider_task_id, reservedCredits: Number(job.reserved_credits),
      actualCredits: job.actual_credits === null ? null : Number(job.actual_credits), balance: Number(wallet.balance), entries,
      checkedAtUtc: new Date().toISOString() };
    const dir = path.resolve(__dirname, '../docs/验收留档/VIDEO-2026-10-06'); fs.mkdirSync(dir, { recursive: true });
    if (kind === 'mock') {
      assert.equal(job.status, 'failed'); assert.ok(job.provider_key.startsWith('mock:'));
      assert.equal(entries.filter(entry => entry.kind === 'refund').length, 1);
      assert.equal(entries.reduce((sum, entry) => sum + Number(entry.amount), 0), 0);
      report.paidProviderCalls = 0;
    } else {
      assert.equal(job.status, 'succeeded'); assert.ok(job.provider_key.startsWith('atlas:'));
      assert.equal(Number(job.actual_credits), 77);
      assert.equal(entries.filter(entry => entry.kind === 'settle').length, 1);
      assert.equal(entries.reduce((sum, entry) => sum + Number(entry.amount), 0), -77);
      const [asset] = await sql`select * from wb_next.media_assets where job_id=${jobId} and user_id=${job.user_id}`;
      assert.ok(asset);
      store = createObjectStore(state.objectStore);
      const response = await fetch(await store.access(asset.object_key, 60));
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.length, asset.byte_length);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
      const file = path.join(dir, '2049-真实生成-480P.mp4'); fs.writeFileSync(file, bytes);
      assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), asset.sha256);
      report.asset = { id: asset.id, sha256: asset.sha256, md5: createHash('md5').update(bytes).digest('hex'), byteLength: bytes.length,
        width: asset.width, height: asset.height, durationMs: asset.duration_ms };
      const unauthorized = await fetch(`${state.apiBase}/v2/generation/${jobId}/media`);
      assert.equal(unauthorized.status, 401);
      const login = await fetch(`${state.apiBase}/v2/auth/guest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: randomBytes(32).toString('hex') }) });
      assert.equal(login.status, 200);
      const stranger = await login.json();
      const forbidden = await fetch(`${state.apiBase}/v2/generation/${jobId}/media`, { headers: { authorization: `Bearer ${stranger.token}` } });
      assert.equal(forbidden.status, 404);
      report.unauthenticatedStatus = unauthorized.status; report.otherAccountStatus = forbidden.status;
    }
    const text = JSON.stringify(report, null, 2); const target = path.join(dir, `${kind}-task-proof.json`);
    fs.writeFileSync(target, text); assert.equal(fs.readFileSync(target, 'utf8'), text);
    console.log(JSON.stringify(report));
  } finally { await sql.end(); store?.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
