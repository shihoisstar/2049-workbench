// Export only this dedicated pilot's completed files; no provider calls or messages to third parties.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const { createHash } = require('node:crypto'); const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..'); const req = createRequire(path.join(root, 'apps/worker/package.json'));
const mode = process.argv.includes('--live') ? 'live' : 'rehearsal';
async function main() {
  const state = JSON.parse(fs.readFileSync(path.join(root, '.local/marketing-pilot', mode, 'state.json')));
  const url = new URL(state.databaseUrl); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, `/workbench_marketing_pilot_${mode}`);
  assert.match(state.runId, /^wb-marketing-pilot-[a-f0-9-]{36}$/);
  const sql = req('postgres')(state.databaseUrl, { max: 1 }); const store = req('@wb/media').createObjectStore(state.objectStore);
  const directory = path.join(root, 'artifacts/marketing-pilot', mode); fs.mkdirSync(directory, { recursive: true });
  const report = { mode, generatedNow: false, files: [], missing: [], feeNote: '内测积分不代表正式售价；本次导出不会调用模型。' };
  try {
    const rows = await sql`select distinct on (j.category) j.id, j.category, j.prompt, j.native_binding, j.actual_credits, a.object_key, a.sha256, a.byte_length, a.width, a.height, a.duration_ms from wb_next.generation_jobs j join wb_next.media_assets a on a.job_id=j.id where j.status='succeeded' and j.category in ('commerce','store_visit') and a.expires_at > clock_timestamp() and (${mode}='rehearsal' or j.native_binding is not null) order by j.category,j.created_at desc`;
    for (const category of ['commerce', 'store_visit']) {
      const row = rows.find(item => item.category === category); if (!row) { report.missing.push(category); continue; }
      const bytes = await store.read(row.object_key); assert.equal(bytes.length, row.byte_length); assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
      const filename = `${mode === 'rehearsal' ? '演练素材-' : ''}${category === 'commerce' ? '剧情带货' : '探店视频'}.mp4`; const file = path.join(directory, filename);
      fs.writeFileSync(file, bytes); assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'), row.sha256);
      report.files.push({ category, filename, jobId: row.id, source: row.native_binding ? '真实生成的历史任务' : '固定样片演练', sha256: row.sha256, width: row.width, height: row.height, durationMs: row.duration_ms, trialCredits: Number(row.actual_credits) });
    }
    const text = JSON.stringify(report, null, 2) + '\n'; const file = path.join(directory, '交付文件说明.json'); fs.writeFileSync(file, text); assert.equal(fs.readFileSync(file, 'utf8'), text);
    console.log(JSON.stringify({ directory, exported: report.files.length, missing: report.missing, paidCalls: 0 })); if (report.missing.length) process.exitCode = 1;
  } finally { await sql.end(); store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
