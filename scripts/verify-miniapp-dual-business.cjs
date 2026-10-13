// Official WeChat CLI, real isolated HTTP/database; no paid model requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { ideTool } = require('./verify-miniapp-portrait.cjs');
const root = path.resolve(__dirname, '..');
const directory = path.resolve(process.argv[2] || '');
assert.equal(path.dirname(directory), path.join(root, '.local'));
assert.ok(path.basename(directory).startsWith('wb-miniapp-drama-'));
const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
assert.equal(state.apiBase, 'http://127.0.0.1:3027');
const evidence = path.join(root, 'docs/验收留档/DUAL-BUSINESS-2026-10-11', state.runId);
fs.mkdirSync(evidence, { recursive: true });
const checks = []; let interactions = 0; let session;
function save(file, value) { const text = JSON.stringify(value, null, 2) + '\n'; fs.writeFileSync(file, text); assert.equal(fs.readFileSync(file, 'utf8'), text); }
function check(value, label) { assert.ok(value, label); checks.push(label); console.log('CHECK', label); }
function tap(selector) { ideTool('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector, '--wait', '1']); interactions++; }
function text(selector) { return String(ideTool('automation_element_action', ['--action', 'text', '--selector', selector, '--wait-for-selector', selector])); }
function evaluate(source, args) {
  const file = path.join(directory, 'dual-ui-args.json'); save(file, args);
  try { return ideTool('automation_evaluate', ['--fn-source', source, '--args-file', file]); }
  finally { fs.unlinkSync(file); }
}
async function api(route, body, authenticated = true) {
  const response = await fetch(state.apiBase + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${route}: ${response.status}`); return response.json();
}
async function navigate(url) {
  const previous = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage?.pageId;
  ideTool('automation_navigate', ['--action', 'reLaunch', '--url', url]);
  const expected = new URL(url, 'https://fixture.invalid'); const until = Date.now() + 30000;
  while (Date.now() < until) {
    const page = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage;
    if (page?.pageId !== previous && page?.path === expected.pathname.slice(1) && [...expected.searchParams].every(([key, value]) => page.query?.[key] === value)) return;
    await delay(250);
  }
  throw new Error('Page navigation deadline exceeded');
}
async function eventually(read, condition) { for (let i = 0; i < 40; i++) { const value = await read(); if (condition(value)) return value; await delay(500); } throw new Error('UI result deadline exceeded'); }
function input(value) { const file = path.join(directory, 'dual-input.json'); save(file, { value }); ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.studio-prompt', '--type', 'input', '--detail-file', file, '--wait-for-selector', '.studio-prompt']); interactions++; }
function value() { return ideTool('automation_element_action', ['--action', 'value', '--selector', '.studio-prompt', '--wait-for-selector', '.studio-prompt', '--wait', '1']); }
async function main() {
  session = await api('/v2/auth/guest', { credential: randomBytes(32).toString('hex') }, false);
  const actor = path.join(directory, 'dual-session.json'); save(actor, [session]);
  try {
    ideTool('automation_evaluate', ['--fn-source', 'function(session){wx.setStorageSync("wb_v2_session",session);return true;}', '--args-file', actor]);
  } finally { fs.unlinkSync(actor); }
  let modalMocked = false;
  try {
    await navigate('/pages/studio-marketing/index');
    check(text('.v2-marketing-headline').includes('好商品'), 'Marketing opens commerce form with new UI');
    input('橘猫帆布袋，展示图案和收纳过程。');
    tap('.studio-category-tabs button:nth-child(2)');
    check(value() === '', 'Store visit starts with a separate empty draft');
    check(text('.studio-field-title').includes('店铺素材'), 'Store visit uses store-specific material label');
    input('咖啡店木桌和窗边座位，展示安静的店内环境。');
    tap('.studio-category-tabs button:nth-child(1)');
    check(value() === '橘猫帆布袋，展示图案和收纳过程。', 'Switching back retains commerce input');
    await navigate('/pages/studio-home/index'); await navigate('/pages/studio-marketing/index');
    check(value() === '橘猫帆布袋，展示图案和收纳过程。', 'Commerce draft survives page reentry');
    tap('.studio-category-tabs button:nth-child(2)');
    check(value() === '咖啡店木桌和窗边座位，展示安静的店内环境。', 'Store draft survives page reentry');
    tap('.v2-marketing-settings');
    check(text('.v2-marketing-more').includes('480P'), 'More settings reveals explicit economy option');
    tap('.v2-marketing-settings');
    check(!text('.studio-form-body').includes('AI 润色'), 'Fixed examples are not labelled AI polish');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'marketing-store.jpg')]);
    check((await api('/v2/generation')).items.length === 0 && (await api('/v2/wallet')).balance === 80, 'Draft editing and switching create no job or charge');
    const content = numbers => numbers.map(number => `## 第${number}集\n**场景1：飞船 日/内**\n橘猫：第${number}站，出发。`).join('\n\n');
    const project = await api('/v2/drama/projects', { mode: 'script', title: '五集确认验收', content: content([1]), look: '3D国创', aspectRatio: '9:16', episodeCount: 5 });
    const route = `/pages/studio-drama-project/index?id=${project.id}`;
    await navigate(route);
    check(text('.v2-series-summary').includes('1/5') && text('.v2-episode-statuses').includes('第5集'), 'Five planned episodes show exact missing episode states');
    tap('.studio-bottom-action .studio-action');
    check((await api(`/v2/drama/projects/${project.id}`)).confirmedVersionId === null, 'Missing episodes cannot confirm through the page');
    const fixed = await api(`/v2/drama/scripts/${project.scriptId}/versions`, { content: content([1, 2, 3, 4, 5]) });
    tap('#drama-project-refresh');
    await eventually(() => Promise.resolve(text('.v2-series-summary')), value => value.includes('5/5'));
    check(text('.studio-bottom-action .studio-action').includes('确认全部剧本'), 'Complete five-episode revision offers one confirmation');
    const modal = path.join(directory, 'dual-modal.json'); save(modal, { confirm: true, cancel: false });
    ideTool('automation_wx_api', ['--action', 'mock', '--method', 'showModal', '--result-file', modal]); modalMocked = true;
    tap('.studio-bottom-action .studio-action');
    const confirmed = await eventually(() => api(`/v2/drama/projects/${project.id}`), current => current.confirmedVersionId === fixed.id);
    check(confirmed.activeVersion.parse.episodes.length === 5, 'One page confirmation pins all five episode scripts');
    await navigate('/pages/studio-home/index'); await navigate(route);
    check(text('.studio-bottom-action .studio-action').includes('继续制作'), 'Confirmed five-episode project offers production continuation');
    check((await api('/v2/wallet')).balance === 80, 'Five-episode repair and confirmation cost zero credits');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'five-episode-confirmed.jpg')]);
    save(path.join(evidence, 'weapp-state.json'), { runId: state.runId, projectId: project.id, checks, assertions: checks.length, interactions, paidCalls: 0, balance: 80, modalReturnInjected: true, phoneVerified: false, fiveVideosVerified: false });
  } finally {
    if (modalMocked) ideTool('automation_wx_api', ['--action', 'restore', '--method', 'showModal']);
  }
  console.log(JSON.stringify({ assertions: checks.length, interactions, paidCalls: 0, phoneVerified: false, fiveVideosVerified: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
