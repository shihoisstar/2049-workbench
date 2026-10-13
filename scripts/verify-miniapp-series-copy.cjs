// Native WeChat inputs/taps and isolated HTTP; showModal returns are injected; paid calls 0.
const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises'); const { ideTool } = require('./verify-miniapp-portrait.cjs');
const root = path.resolve(__dirname, '..'); const directory = path.resolve(process.argv[2] || '');
assert.equal(path.dirname(directory), path.join(root, '.local')); assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));
const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')); assert.equal(state.apiBase, 'http://127.0.0.1:3027');
const evidence = path.join(root, 'docs/验收留档/SERIES-COPY-2026-10-11', state.runId); fs.mkdirSync(evidence, { recursive: true });
const checks = []; let interactions = 0; let session;
function save(file, value) { const text = JSON.stringify(value, null, 2) + '\n'; fs.writeFileSync(file, text); assert.equal(fs.readFileSync(file, 'utf8'), text); }
function check(value, label) { assert.ok(value, label); checks.push(label); console.log('CHECK', label); }
function tap(selector) { ideTool('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector, '--wait', '1']); interactions++; }
function text(selector) { return String(ideTool('automation_element_action', ['--action', 'text', '--selector', selector, '--wait-for-selector', selector])); }
function input(value) { const file = path.join(directory, 'series-copy-input.json'); save(file, { value }); ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.studio-prompt', '--type', 'input', '--detail-file', file, '--wait-for-selector', '.studio-prompt']); interactions++; }
function value() { return ideTool('automation_element_action', ['--action', 'value', '--selector', '.studio-prompt', '--wait-for-selector', '.studio-prompt', '--wait', '1']); }
function modal(confirm) { const file = path.join(directory, 'series-copy-modal.json'); save(file, { confirm, cancel: !confirm }); ideTool('automation_wx_api', ['--action', 'mock', '--method', 'showModal', '--result-file', file]); }
async function api(route, body, authenticated = true) {
  const response = await fetch(state.apiBase + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${route}: ${response.status}`); return response.json();
}
async function eventually(read, condition) { for (let i = 0; i < 60; i++) { const value = await read(); if (condition(value)) return value; await delay(500); } throw new Error('UI result deadline exceeded'); }
async function navigate(url) {
  const previous = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage?.pageId; ideTool('automation_navigate', ['--action', 'reLaunch', '--url', url]);
  const expected = new URL(url, 'https://fixture.invalid'); const until = Date.now() + 30000;
  while (Date.now() < until) { const page = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage;
    if (page?.pageId !== previous && page?.path === expected.pathname.slice(1) && [...expected.searchParams].every(([key, value]) => page.query?.[key] === value)) return;
    await delay(250);
  }
  throw new Error('Page navigation deadline exceeded');
}
async function main() {
  session = await api('/v2/auth/guest', { credential: randomBytes(32).toString('hex') }, false);
  const actor = path.join(directory, 'series-copy-session.json'); save(actor, [session]);
  try { ideTool('automation_evaluate', ['--fn-source', 'function(session){wx.setStorageSync("wb_v2_session",session);return true;}', '--args-file', actor]); } finally { fs.unlinkSync(actor); }
  try {
    const project = await api('/v2/drama/projects', { mode: 'idea', title: '五站云海旅程', content: '橘猫驾驶飞船，依次探索五站，最后找到回家的路。', look: '3D国创', aspectRatio: '9:16', episodeCount: 5, genre: '科幻', tone: '通用' });
    const route = `/pages/studio-drama-project/index?id=${project.id}`; const batchRoute = `/v2/drama/projects/${project.id}/script-batches/latest`;
    await navigate(route); await eventually(() => Promise.resolve(text('.studio-bottom-action .studio-action')), text => text.includes('模拟生成全部'));
    check((await api(`/v2/drama/projects/${project.id}/script-batch-quote`)).toGenerate.length === 5, 'One batch quote covers all five planned episodes');
    modal(false); tap('.studio-bottom-action .studio-action'); check(await api(batchRoute) === null && (await api('/v2/wallet')).balance === 80, 'Cancel creates no batch or hold');
    modal(true); tap('.studio-bottom-action .studio-action'); const started = await eventually(() => api(batchRoute), batch => !!batch);
    check(started.episodeCount === 5, 'One native confirmation admits five automatic episode tasks');
    await navigate('/pages/studio-home/index'); const done = await eventually(() => api(batchRoute), batch => batch?.status === 'succeeded');
    check(done.id === started.id && done.draftVersion.parse.episodes.length === 5, 'All five scripts finish after leaving the page with the same batch');
    check((await api(`/v2/drama/projects/${project.id}`)).confirmedVersionId === null, 'Automatic generation does not automatically confirm the script');
    await navigate(route); check(text('.v2-script-status').includes('5/5'), 'Reentry displays all five completed episode scripts');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'five-episode-ready.jpg'), '--wait-for-selector', '.v2-series-summary', '--wait', '1']);
    tap('.studio-bottom-action .studio-action'); const confirmed = await eventually(() => api(`/v2/drama/projects/${project.id}`), item => !!item.confirmedVersionId);
    check(confirmed.activeVersion.parse.episodes.length === 5 && confirmed.confirmedVersionId === done.draftVersion.id, 'One native confirmation fixes the complete five-episode version');
    check((await api('/v2/wallet')).balance === 80, 'Mock five-episode creation and confirmation cost no credits');
    await navigate('/pages/studio-marketing/index'); const original = '橘猫图案的帆布袋，想展示图案和收纳过程。'; input(original);
    await eventually(() => Promise.resolve(text('.marketing-copy-assistant')), text => text.includes('开发模拟 · 不扣积分'));
    modal(false); tap('.copy-generate'); check(await api('/v2/marketing/copy/jobs/latest?category=commerce') === null, 'Copy quote cancel creates no copy task');
    modal(true); tap('.copy-generate'); const commerce = await eventually(() => api('/v2/marketing/copy/jobs/latest?category=commerce'), item => item?.status === 'succeeded');
    check(commerce.sourceText === original && commerce.result.text.includes('口播'), 'Commerce suggestion comes from a persistent category task');
    check(value() === original, 'AI suggestion does not overwrite input without adoption');
    await eventually(() => Promise.resolve(text('.copy-result')), text => text.includes('开发模拟建议'));
    tap('.copy-adopt'); check(value() === commerce.result.text, 'Native adoption fills the editable description');
    await navigate('/pages/studio-home/index'); await navigate('/pages/studio-marketing/index'); check(value() === commerce.result.text, 'Adopted copy survives leaving and reentry');
    check((await api(`/v2/marketing/copy/jobs/${commerce.id}`)).sourceText === original, 'Original merchant facts remain stored after adoption');
    tap('.studio-category-tabs button:nth-child(2)'); const storeText = '咖啡店有木桌和窗边座位，想展示安静的环境。'; input(storeText);
    await eventually(() => Promise.resolve(text('.marketing-copy-assistant')), text => text.includes('开发模拟 · 不扣积分')); tap('.copy-generate');
    const store = await eventually(() => api('/v2/marketing/copy/jobs/latest?category=store_visit'), item => item?.status === 'succeeded');
    check(store.id !== commerce.id && store.category === 'store_visit' && store.sourceText === storeText, 'Store visit has its own persistent suggestion and source');
    await eventually(() => Promise.resolve(text('.copy-result')), text => text.includes('开发模拟建议')); tap('.copy-adopt'); check(value() === store.result.text, 'Store suggestion can be explicitly adopted');
    tap('.studio-category-tabs button:nth-child(1)'); check(value() === commerce.result.text, 'Switching categories retains each adopted draft');
    check((await api('/v2/wallet')).balance === 80 && (await api('/v2/generation')).items.length === 0, 'Script and copy operations start no video job or paid model call');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'marketing-copy-adopted.jpg'), '--wait-for-selector', '.copy-result', '--wait', '1']);
    save(path.join(evidence, 'weapp-state.json'), { runId: state.runId, projectId: project.id, batchId: done.id, copyJobIds: [commerce.id, store.id], checks, assertions: checks.length, interactions, paidCalls: 0, modalReturnInjected: true, phoneVerified: false, fiveVideosVerified: false });
  } finally { ideTool('automation_wx_api', ['--action', 'restore', '--method', 'showModal']); }
  console.log(JSON.stringify({ assertions: checks.length, interactions, paidCalls: 0, phoneVerified: false, fiveVideosVerified: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
