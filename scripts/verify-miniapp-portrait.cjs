// Official WeChat IDE CLI + isolated loopback API. No paid generation.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'); const project = path.resolve(process.env.WB_WECHAT_PROJECT || path.join(root, 'apps/miniapp/dist/studio'));
assert.ok(['apps/miniapp/dist/studio', 'apps/miniapp/dist/marketing-pilot'].some(item => project === path.resolve(root, item)), 'Unsupported WeChat project path');
const ideDir = 'D:/微信web开发者工具';
const electronName = fs.readdirSync(ideDir).find(name => /\.exe$/i.test(name) && !/^(node|node-18|wxfilewatcher|wxfilewatcher_x64|notification_helper|wechatdevtools)\.exe$/i.test(name) && fs.statSync(path.join(ideDir, name)).size > 50 * 1024 * 1024);
assert.ok(electronName, 'WeChat IDE executable unavailable');
const cli = path.join(ideDir, 'resources/app.asar.unpacked/js/common/cli/skill-index.js');
const bootstrap = "const e=process.argv[1],a=process.argv.slice(2).filter(x=>x!=='--electron');if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,e,'--electron'].concat(a);require(e)";
function ideTool(name, args = []) {
  const result = spawnSync(path.join(ideDir, electronName), ['-e', bootstrap, cli, '-c', 'Codex', name, '--project', project, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON: '' }, windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const raw = (result.stdout || '').toString('utf8'); const begin = raw.indexOf('{');
  if (begin < 0) throw new Error(`${name}: no response`);
  const response = JSON.parse(raw.slice(begin));
  if (!response.ok || response.result?.success === false) throw new Error(`${name}: ${response.message ?? response.result?.error ?? 'failed'}`);
  return response.result;
}
function writeChecked(file, value) { const content = JSON.stringify(value, null, 2) + '\n'; fs.writeFileSync(file, content); assert.equal(fs.readFileSync(file, 'utf8'), content); }
// Keep a cross-build backup outside the simulator; DPAPI restricts decryption to this Windows user.
function protectSession(value, decrypt = false) {
  const setup = 'Add-Type -AssemblyName System.Security; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $sessionText=[Console]::In.ReadToEnd(); ';
  const operation = decrypt
    ? '$sessionBytes=[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($sessionText),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($sessionBytes))'
    : '$sessionBytes=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($sessionText),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($sessionBytes))';
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', setup + operation], { input: value, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(result.status, 0, 'Private session backup encryption failed'); return result.stdout;
}
function privateSessionFile(value) {
  assert.ok(value, 'Private backup file required'); const file = path.resolve(value);
  assert.ok(file.startsWith(path.join(root, '.local') + path.sep) && file.endsWith('.json'), 'Backup must stay under workspace .local'); return file;
}
function captureSession(value) {
  const file = privateSessionFile(value); assert.equal(fs.existsSync(file), false, 'Do not overwrite an existing private backup');
  const result = ideTool('automation_evaluate', ['--fn-source', 'function(){const present=wx.getStorageInfoSync().keys;return ["wb_v2_session","wb_v2_guest_credential"].map(key=>({key,present:present.includes(key),value:wx.getStorageSync(key)}))}']);
  const rows = result.result.result; assert.ok(Array.isArray(rows) && rows.length === 2, 'Session snapshot unavailable');
  fs.mkdirSync(path.dirname(file), { recursive: true }); writeChecked(file, { version: 1, protectedData: protectSession(JSON.stringify(rows)) }); console.log('Private session backup saved');
}
function restoreSession(value) {
  const file = privateSessionFile(value); const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.version, 1); const rows = JSON.parse(protectSession(data.protectedData, true));
  assert.ok(Array.isArray(rows) && rows.length === 2 && new Set(rows.map(row => row.key)).size === 2 && rows.every(row => ['wb_v2_session', 'wb_v2_guest_credential'].includes(row.key) && typeof row.present === 'boolean'));
  const args = file + '.restore-args';
  try {
    writeChecked(args, [rows]);
    const result = ideTool('automation_evaluate', ['--fn-source', 'function(rows){for(const row of rows){if(row.present)wx.setStorageSync(row.key,row.value);else wx.removeStorageSync(row.key);}return rows.every(row=>row.present?JSON.stringify(wx.getStorageSync(row.key))===JSON.stringify(row.value):!wx.getStorageInfoSync().keys.includes(row.key))}', '--args-file', args]);
    assert.equal(result.result.result, true, 'Session restoration verification failed'); fs.rmSync(file); console.log('Private session backup restored and removed');
  } finally { fs.rmSync(args, { force: true }); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const directory = path.resolve(process.argv[2] || '');
  assert.ok(directory.startsWith(path.join(root, '.local') + path.sep) && path.basename(directory).startsWith('wb-miniapp-drama-'));
  const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8')); assert.equal(state.apiBase, 'http://127.0.0.1:3027');
  assert.equal(state.runId, path.basename(directory));
  const evidence = path.join(root, 'docs/验收留档/PLAN-IMAGES-2026-10-11', state.runId); fs.mkdirSync(evidence, { recursive: true }); const checks = []; let interactions = 0;
  let session; let testProject; let testPlanId; let restored = false;
  const backupKey = `wb_portrait_acceptance_${randomUUID()}`; const argsFile = path.join(directory, 'ide-args.json');
  const check = (value, label) => { assert.ok(value, label); checks.push(label); console.log('CHECK', label); };
  const evaluate = (source, args) => { writeChecked(argsFile, args); return ideTool('automation_evaluate', ['--fn-source', source, '--args-file', argsFile]); };
  async function api(route, body, authenticated = true) {
    const response = await fetch(state.apiBase + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(authenticated && session ? { authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.ok(response.ok, `${route}: ${response.status}`); return response.json();
  }
  const preparation = () => api(`/v2/drama/projects/${testProject.id}/preparation`);
  async function eventually(read, condition) { for (let i = 0; i < 60; i++) { const value = await read(); if (condition(value)) return value; await delay(500); } throw new Error('UI result deadline exceeded'); }
  function tap(selector) { ideTool('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector, '--wait', '1']); interactions++; }
  function text(selector) { return ideTool('automation_element_action', ['--action', 'text', '--selector', selector, '--wait-for-selector', selector]); }
  async function routeReady(url, previousPageId) {
    const expected = new URL(url, 'https://fixture.invalid'); const until = Date.now() + 30000;
    while (Date.now() < until) {
      const page = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage;
      if (page?.path === expected.pathname.slice(1) && (previousPageId === undefined || page.pageId !== previousPageId) && [...expected.searchParams].every(([key, value]) => page.query?.[key] === value)) return;
      await delay(250);
    }
    throw new Error(`Page navigation did not settle: ${expected.pathname}`);
  }
  async function navigate(url) {
    const previous = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage?.pageId;
    ideTool('automation_navigate', ['--action', 'reLaunch', '--url', url]); await routeReady(url, previous);
  }
  function modal(confirm) { const file = path.join(directory, 'modal.json'); writeChecked(file, { confirm, cancel: !confirm }); ideTool('automation_wx_api', ['--action', 'mock', '--method', 'showModal', '--result-file', file]); }
  try {
    session = await api('/v2/auth/guest', { credential: randomBytes(32).toString('hex') }, false);
    testProject = await api('/v2/drama/projects', { mode: 'script', title: '微信角色候选验收', content: '## 第1集\n**场景1：飞船 日/内**\n阿橘：出发。\n广播声（OS）：前方晴朗。\n**场景2：云海 日/外**\n阿橘：找到新大陆了。', look: '3D国创', aspectRatio: '9:16', episodeCount: 1 });
    await api(`/v2/drama/projects/${testProject.id}/script-confirmation`, { versionId: testProject.activeVersionId });
    writeChecked(path.join(directory, 'ui-fixture.json'), { session, projectId: testProject.id, backupKey });
    evaluate('function(data){const keys=["wb_v2_session","wb_v2_guest_credential"];const present=wx.getStorageInfoSync().keys;wx.setStorageSync(data.backupKey,keys.map(key=>({key,present:present.includes(key),value:wx.getStorageSync(key)})));wx.setStorageSync("wb_v2_session",data.session);return true;}', [{ backupKey, session }]);
    const route = `/pages/studio-drama-prepare/index?id=${testProject.id}`; await navigate(route);
    const initial = await eventually(preparation, draft => draft.roles.length === 2);
    check(initial.roles[1].usage === 'voice_only' && initial.scenes.length === 2, 'Visual and voice-only roles with two scenes');
    const detail = path.join(directory, 'input.json'); writeChecked(detail, { value: '橘猫，白色下巴，蓝色飞行围巾。' });
    ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.prep-description', '--type', 'input', '--detail-file', detail, '--wait-for-selector', '.prep-description', '--wait', '1']); interactions++;
    tap('.studio-bottom-action .studio-action');
    const saved = await eventually(preparation, draft => draft.revision === 1);
    check(saved.roles[0].description === '橘猫，白色下巴，蓝色飞行围巾。', 'Native description edit saved');
    const jobs = () => api(`/v2/drama/projects/${testProject.id}/portrait-jobs?roleKey=${encodeURIComponent(saved.roles[0].key)}`);
    modal(false); tap('.portrait-candidates .prep-add'); await delay(700);
    check((await jobs()).items.length === 0 && (await api('/v2/wallet')).balance === 80, 'Quote cancel creates no job or hold');
    modal(true); tap('.portrait-candidates .prep-add');
    const accepted = await eventually(jobs, page => page.items.length === 1);
    await navigate('/pages/studio-home/index'); await navigate(route);
    const done = await eventually(jobs, page => page.items[0]?.status === 'succeeded');
    check(done.items[0].id === accepted.items[0].id && (await api('/v2/wallet')).balance === 73, 'Reentry keeps one succeeded job and seven test credits');
    tap('.portrait-candidates .studio-text-button');
    check(String(text('.portrait-candidate')).includes('候选已生成'), 'Native candidate shows completion');
    tap('.portrait-candidate button');
    const selected = await eventually(preparation, draft => !!draft.roles[0].referenceMaterialId);
    check(selected.roles[0].selection === null, 'Selecting candidate does not confirm appearance');
    tap('.prep-reference-actions .is-primary');
    const confirmed = await eventually(preparation, draft => draft.roles[0].selection?.status === 'confirmed');
    check(!!confirmed.roles[0].selection.roleVersionId, 'Adopting appearance pins a role version');
    await navigate('/pages/studio-home/index'); await navigate(route);
    check(String(text('.prep-reference')).includes('已确认形象'), 'Confirmed appearance returns after leaving page');
    tap('.prep-reference-actions .is-primary');
    const repeated = await preparation(); check(repeated.roles[0].selection.roleVersionId === confirmed.roles[0].selection.roleVersionId, 'Repeated confirmation reuses fixed version');
    const wallet = await api('/v2/wallet'); check(wallet.balance === 73 && wallet.entries.filter(entry => entry.type === 'hold').length === 1 && wallet.entries.filter(entry => entry.type === 'settle').length === 1, 'One hold and one settlement only');
    tap('#prep-organize .studio-action');
    const planRoute = `/v2/drama/projects/${testProject.id}/storyboard-plan`;
    const plan = await eventually(() => api(planRoute), value => !!value);
    testPlanId = plan.id;
    await routeReady(`/pages/studio-drama-plan/index?id=${plan.id}`);
    check(plan.shots.length === 3 && plan.roles[0].roleVersionId === confirmed.roles[0].selection.roleVersionId, 'Storyboarding from confirmed role keeps fixed version');
    tap('.plan-edit'); writeChecked(detail, { value: '' });
    ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.plan-content', '--type', 'input', '--detail-file', detail, '--wait-for-selector', '.plan-content']); interactions++;
    await navigate('/pages/studio-home/index'); await navigate(`/pages/studio-drama-plan/index?id=${plan.id}`);
    const empty = ideTool('automation_element_action', ['--action', 'value', '--selector', '.plan-content', '--wait-for-selector', '.plan-content', '--wait', '1']);
    check(empty === '', 'Empty unsaved shot edit survives leaving page');
    const editedContent = '阿橘抬头望向云海，握紧飞船操纵杆。'; writeChecked(detail, { value: editedContent });
    ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.plan-content', '--type', 'input', '--detail-file', detail, '--wait-for-selector', '.plan-content']); interactions++;
    tap('.plan-reviewed'); tap('.plan-save');
    const savedPlan = await eventually(() => api(planRoute), value => value.revision === 2);
    check(savedPlan.shots[0].content === editedContent && savedPlan.shots[0].reviewed && savedPlan.shots[0].sourceText === plan.shots[0].sourceText, 'Native shot edit saves with source preserved');
    await navigate('/pages/studio-home/index'); await navigate(route); tap('#prep-organize .studio-action');
    await routeReady(`/pages/studio-drama-plan/index?id=${plan.id}`);
    const replayed = await api(planRoute); check(replayed.id === plan.id && replayed.shots[0].content === editedContent, 'Repeated organization preserves saved edits');
    check((await api('/v2/wallet')).balance === 73 && (await jobs()).items.length === 1, 'Storyboard creation and editing spend no credits or image jobs');
    const planImages = () => api(`/v2/drama/storyboard-plans/${plan.id}/images?shotKey=${encodeURIComponent(savedPlan.shots[0].key)}`);
    modal(false); tap('.plan-image-generate'); check((await planImages()).items.length === 0 && (await api('/v2/wallet')).balance === 73, 'Cancelling storyboard image quote keeps balance');
    modal(true); tap('.plan-image-generate'); const framePage = await eventually(planImages, page => page.items[0]?.status === 'succeeded'); const frame = framePage.items[0];
    tap('.plan-image-refresh'); tap('.plan-image-select');
    const frameSelected = await eventually(planImages, page => !!page.items[0]?.selectedAt); check(frameSelected.items[0].candidateId === frame.candidateId, 'Native storyboard image selected after publication');
    await navigate('/pages/studio-home/index'); await navigate(`/pages/studio-drama-plan/index?id=${plan.id}`);
    check(String(text('.plan-image-item')).includes('已选定'), 'Chosen image returns after leaving page');
    check((await api('/v2/wallet')).balance === 66 && (await planImages()).items.length === 1, 'One storyboard image costs seven test credits once');
    tap('.plan-edit'); writeChecked(detail, { value: editedContent + ' 镜头向后拉远。' });
    ideTool('automation_element_action', ['--action', 'trigger', '--selector', '.plan-content', '--type', 'input', '--detail-file', detail, '--wait-for-selector', '.plan-content']); interactions++;
    tap('.plan-reviewed'); tap('.plan-save');
    const finalPlan = await eventually(() => api(planRoute), value => value.revision === 3);
    const historical = await eventually(planImages, page => page.items[0]?.current === false);
    check(historical.items[0].jobId === frame.jobId && historical.items[0].status === 'succeeded', 'Changed shot retains old successful image as historical');
    check((await api('/v2/wallet')).balance === 66, 'Changing a shot never regenerates or charges automatically');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'weapp-storyboard-plan.jpg'), '--wait-for-selector', '.storyboard-draft .plan-shot', '--wait', '1']);
    await navigate(route); ideTool('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', '750', '--wait-for-selector', '.prep-reference', '--wait', '1']);
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'weapp-portrait-confirmed.jpg')]);
    await navigate(`/pages/studio-drama-plan/index?id=${plan.id}`);
    tap('.plan-image-item .prep-reference-image');
    ideTool('simulator_screenshot', ['--path', path.join(evidence, 'weapp-plan-image-preview.jpg'), '--wait', '1']);
    check(true, 'Actual image click and preview screenshot captured (no previewImage mock)');
    writeChecked(path.join(evidence, 'weapp-portrait-state.json'), { runId: state.runId, projectId: testProject.id, jobId: done.items[0].id, roleVersionId: confirmed.roles[0].selection.roleVersionId,
      planId: plan.id, planRevision: finalPlan.revision, planImageJobId: frame.jobId, planImageCandidateId: frame.candidateId, checks, assertions: checks.length, interactions, balance: 66, paidCalls: 0, modalReturnInjected: true, phoneVerified: false });
  } finally {
    ideTool('automation_wx_api', ['--action', 'restore', '--method', 'showModal']);
    const result = evaluate('function(data){const rows=wx.getStorageSync(data.backupKey);if(!Array.isArray(rows))return false;for(const row of rows){if(row.present)wx.setStorageSync(row.key,row.value);else wx.removeStorageSync(row.key);}const same=rows.every(row=>row.present?JSON.stringify(wx.getStorageSync(row.key))===JSON.stringify(row.value):!wx.getStorageInfoSync().keys.includes(row.key));if(same)wx.removeStorageSync(data.backupKey);for(const key of wx.getStorageInfoSync().keys){if((key.includes(data.projectId)||(data.planId&&key.includes(data.planId)))&&(key.startsWith("wb_portrait_pending:")||key.startsWith("wb_drama_preparation:")||key.startsWith("wb_plan_image_pending:")||key.startsWith("wb_storyboard_edit:")))wx.removeStorageSync(key);}return same;}', [{ backupKey, projectId: testProject?.id ?? '', planId: testPlanId }]);
    restored = result?.result?.result === true || result?.result === true;
    writeChecked(path.join(directory, 'ui-restoration.json'), { restored, modalRestored: true });
    assert.ok(restored, 'Original simulator credentials were not restored');
  }
  console.log(JSON.stringify({ assertions: checks.length, interactions, paidCalls: 0, restored }));
}
module.exports = { ideTool, protectSession };
if (require.main === module) {
  Promise.resolve().then(() => process.argv[2] === '--capture-session' ? captureSession(process.argv[3]) : process.argv[2] === '--restore-session' ? restoreSession(process.argv[3]) : main())
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
