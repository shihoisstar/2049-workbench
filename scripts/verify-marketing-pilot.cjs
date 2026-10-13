// Free end-to-end rehearsal of the dedicated marketing build. Never enables a paid provider.
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict'); const { randomBytes, randomUUID } = require('node:crypto'); const { setTimeout: delay } = require('node:timers/promises');
assert.ok(!process.argv.includes('--live'), 'Real recording is a separately approved, user-operated session');
const root = path.resolve(__dirname, '..'); process.env.WB_WECHAT_PROJECT = path.join(root, 'apps/miniapp/dist/marketing-pilot');
const { ideTool } = require('./verify-miniapp-portrait.cjs'); const directory = path.join(root, '.local/marketing-pilot/rehearsal'); const state = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'))); assert.equal(state.mode, 'rehearsal');
const evidence = path.join(root, 'docs/验收留档/MARKETING-PILOT-2026-10-12', randomUUID()); fs.mkdirSync(evidence, { recursive: true });
const checks = []; let interactions = 0, session;
function save(file, value) { const content = JSON.stringify(value, null, 2); fs.writeFileSync(file, content); assert.equal(fs.readFileSync(file, 'utf8'), content); }
function evaluate(fn, args = []) { const file = path.join(directory, 'ui-args.json'); save(file, args); try { return ideTool('automation_evaluate', ['--fn-source', fn, '--args-file', file]).result.result; } finally { fs.unlinkSync(file); } }
function text(selector) { return String(ideTool('automation_element_action', ['--action', 'text', '--selector', selector, '--wait-for-selector', selector])); }
function tap(selector) { ideTool('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector, '--wait', '1']); interactions++; }
function input(selector, value) { const file = path.join(directory, 'input.json'); save(file, { value }); ideTool('automation_element_action', ['--action', 'trigger', '--selector', selector, '--type', 'input', '--detail-file', file, '--wait-for-selector', selector]); interactions++; }
function check(value, name) { assert.ok(value, name); checks.push(name); console.log('CHECK', name); }
async function api(route, body, authenticated = true) { const r = await fetch(state.apiBase + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${session.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); assert.ok(r.ok, `${route}: ${r.status}`); return r.status === 204 ? null : r.json(); }
async function wait(read, accept) { const deadline = Date.now() + 240000; while (Date.now() < deadline) { const result = await read(); if (accept(result)) return result; await delay(700); } throw new Error('Pilot UI state timeout'); }
async function navigate(url) { const previous = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage?.pageId; ideTool('automation_navigate', ['--action', 'reLaunch', '--url', url]); await wait(async () => ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage, p => p?.pageId !== previous && p?.path === url.slice(1).split('?')[0]); }
async function main() {
  const credential = randomBytes(32).toString('hex'); session = await api('/v2/auth/guest', { credential }, false);
  save(path.join(directory, 'demo-account.json'), { credential, userId: session.userId });
  evaluate('function(session,credential){wx.setStorageSync("wb_v2_session",session);wx.setStorageSync("wb_v2_guest_credential",credential);return true;}', [session, credential]);
  const modal = path.join(directory, 'modal.json'); save(modal, { confirm: true, cancel: false }); ideTool('automation_wx_api', ['--action', 'mock', '--method', 'showModal', '--result-file', modal]);
  const results = []; let imageMock = false;
  try {
    for (const category of ['commerce', 'store_visit']) {
      await navigate('/pages/studio-marketing/index');
      const nav = text('.studio-bottom-nav'); check(nav.includes('创作') && nav.includes('作品') && nav.includes('我的') && !nav.includes('漫剧'), 'marketing-only navigation ' + category);
      if (category === 'store_visit') tap('.studio-category-tabs button:nth-child(2)');
      input('.studio-prompt', category === 'commerce' ? '奶白色帆布袋，正面有橘色虎斑猫印花和浅色提带。拍出门前忙乱，找到包，把手机钥匙装好出门的轻松剧情。不要添加价格、优惠、容量或质量承诺。' : '虚构火锅店示例：明亮暖色店内，桌上有红油火锅、牛肉和蔬菜。呈现食材特写和开吃的自然互动。不要添加店名、地址、价格、优惠或顾客评价。');
      if (category === 'commerce') {
        const reference = fs.readFileSync(path.join(root, 'docs/验收留档/NATIVE-COMMERCE-2026-10-11/product-reference.png'));
        const local = evaluate('function(){const file=wx.env.USER_DATA_PATH+"/pilot-product.png";wx.getFileSystemManager().writeFileSync(file,"");return file;}');
        for (let offset = 0; offset < reference.length; offset += 64 * 1024) evaluate('function(file,base64){wx.getFileSystemManager().appendFileSync(file,base64,"base64");return true;}', [local, reference.subarray(offset, offset + 64 * 1024).toString('base64')]);
        check(evaluate('function(file){return wx.getFileSystemManager().statSync(file).size;}', [local]) === reference.length, 'complete product fixture prepared');
        assert.equal(typeof local, 'string'); const choice = path.join(directory, 'image-choice.json'); save(choice, { tempFilePaths: [local], tempFiles: [{ path: local, size: reference.length }] });
        ideTool('automation_wx_api', ['--action', 'mock', '--method', 'chooseImage', '--result-file', choice]); imageMock = true; tap('.studio-add-material');
        await wait(async () => text('.studio-materials'), value => value.includes('×'));
        check(true, 'product image uploaded through actual endpoint');
      }
      await wait(async () => text('.marketing-copy-assistant'), value => value.includes('开发模拟'));
      tap('.copy-generate'); const copy = await wait(() => api('/v2/marketing/copy/jobs/latest?category=' + category), value => value?.status === 'succeeded');
      check(copy.durationSec === 10 && copy.provider === 'mock', 'ten-second copy snapshot ' + category);
      await wait(async () => text('.copy-result-text'), value => value.includes('口播')); const originalCopy = text('.copy-result-text'); tap('.copy-adopt');
      const editedCopy = originalCopy + '\n当前编辑稿：保留真实资料，不添加价格或优惠。'; input('.studio-prompt', editedCopy);
      await wait(async () => text('#copy-adoption-state'), value => value.includes('已采用后修改'));
      tap('#copy-toggle-original');
      check(text('.copy-result-text') === originalCopy && text('#marketing-current-copy').includes('上方输入框'), 'original suggestion preserved and edited draft clearly identified ' + category);
      tap('#copy-toggle-original'); check(text('#copy-toggle-original').includes('查看原始'), 'adopted suggestion collapses to keep current draft prominent ' + category);
      check(text('#marketing-draft-state').includes('修改已保存在本机'), 'draft save result explicitly shown ' + category);
      tap('#studio-generate-video'); await wait(async () => text('.studio-price'), value => value.includes('7')); ideTool('simulator_screenshot', ['--path', path.join(evidence, category + '-confirm.jpg')]);
      check(text('.v2-marketing-review').includes('当前编辑稿'), 'confirmation uses edited draft ' + category);
      ideTool('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', '100000', '--wait', '1']);
      const layout = evaluate('function(){return new Promise(resolve=>{wx.createSelectorQuery().select("#marketing-cost-note").boundingClientRect().select("#marketing-back-edit").boundingClientRect().select(".studio-bottom-action").boundingClientRect().exec(resolve)})}');
      check(layout[0]?.bottom < layout[2]?.top && layout[1]?.bottom < layout[2]?.top, 'fee explanation and return control fully above fixed footer ' + category);
      check(layout[1]?.top >= layout[0]?.bottom, 'return control does not overlap fee text ' + category);
      save(path.join(evidence, category + '-bottom-layout.json'), layout); ideTool('simulator_screenshot', ['--path', path.join(evidence, category + '-bottom-visible.jpg')]);
      tap('#studio-generate-video');
      const jobs = await wait(() => api('/v2/generation'), value => value.items.some(item => item.category === category)); const job = jobs.items.find(item => item.category === category);
      check(job.copyJobId === copy.id && job.materialIds.length === (category === 'commerce' ? 1 : 0), 'source facts and material retained ' + category);
      check(job.prompt === editedCopy, 'accepted request uses current edited draft ' + category);
      const review = await wait(() => api('/v2/marketing/video/' + job.id + '/review'), value => value?.state === 'review');
      await navigate('/pages/studio-progress/index?id=' + job.id); await wait(async () => text('.native-caption-review'), value => value.includes('核对字幕'));
      check(text('.studio-field-heading').includes('请核对字幕') && text('#marketing-task-steps').includes('核对字幕'), 'actual review phase identifies user next action ' + category);
      const captionLayout = evaluate('function(){return new Promise(resolve=>wx.createSelectorQuery().select(".native-caption-confirm").boundingClientRect().exec(resolve))}');
      check(captionLayout[0]?.height >= 44 && captionLayout[0]?.bottom <= evaluate('function(){return wx.getWindowInfo().windowHeight}'), 'caption primary action visible with a full touch target ' + category);
      const preview = await api('/v2/generation/' + job.id); check(preview.actualCredits === 7 && preview.status === 'accepted', 'preview settles exactly once ' + category);
      ideTool('simulator_screenshot', ['--path', path.join(evidence, category + '-captions.jpg')]);
      const corrected = review.cues[0].text.replaceAll('孤独', '咕嘟').replace(/[。！？]?$/, '。');
      tap('.native-caption-edit'); input('.native-caption-input', corrected);
      await wait(async () => text('#native-caption-draft-state'), value => value.includes('修改已保存在本机'));
      await navigate('/pages/studio-works/index'); await navigate('/pages/studio-progress/index?id=' + job.id);
      await wait(async () => text('.native-caption-review'), value => value.includes(corrected));
      check(true, 'caption edit recovered after page reentry ' + category);
      tap('.native-caption-confirm'); await wait(() => api('/v2/generation/' + job.id), value => value.status === 'succeeded');
      const confirmed = await api('/v2/marketing/video/' + job.id + '/review');
      check(confirmed.state === 'ready' && confirmed.cues[0].text === corrected, 'corrected caption persisted ' + category);
      await navigate('/pages/studio-works/index'); check(text('#works-list').includes('已消耗 7'), 'completed work recovered ' + category);
      const worksPage = ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage.pageId; tap('#work-' + job.id);
      await wait(async () => ideTool('automation_runtime_info', ['--action', 'currentPage']).currentPage, p => p?.pageId !== worksPage && p?.path === 'pages/studio-progress/index' && p.query.id === job.id);
      await wait(async () => text('.studio-field-heading'), value => value.includes('成片已就绪')); tap('#save-generated-video'); await wait(async () => text('#video-save-state'), value => value.includes('已保存到小程序本地文件'));
      check(true, 'file saved in developer tool ' + category); ideTool('simulator_screenshot', ['--path', path.join(evidence, category + '-complete.jpg')]);
      const cacheBefore = evaluate('function(userId){return new Promise((resolve,reject)=>wx.getFileSystemManager().getSavedFileList({success:r=>resolve({rows:wx.getStorageSync("wb_v2_saved_media:"+userId).length,files:r.fileList.length}),fail:reject}))}', [session.userId]);
      tap('#save-generated-video'); await wait(async () => text('#video-save-state'), value => value.includes('已复用校验完整'));
      const cacheAfter = evaluate('function(userId){return new Promise((resolve,reject)=>wx.getFileSystemManager().getSavedFileList({success:r=>resolve({rows:wx.getStorageSync("wb_v2_saved_media:"+userId).length,files:r.fileList.length}),fail:reject}))}', [session.userId]);
      check(JSON.stringify(cacheBefore) === JSON.stringify(cacheAfter), 'repeat save reuses file without cache growth ' + category);
      const savedLayout = evaluate('function(){return new Promise(resolve=>wx.createSelectorQuery().select("#video-save-state").boundingClientRect().exec(resolve))}');
      check(savedLayout[0]?.top >= 0 && savedLayout[0]?.bottom <= evaluate('function(){return wx.getWindowInfo().windowHeight}'), 'save feedback immediately visible in fixed action area ' + category);
      const wallet = await api('/v2/wallet'); const entries = wallet.entries.filter(item => item.billingKey === 'generation:' + job.id); check(entries.filter(item => item.type === 'hold').length === 1 && entries.filter(item => item.type === 'settle').length === 1, 'no repeat charge ' + category);
      results.push({ category, jobId: job.id, copyJobId: copy.id });
    }
    tap('#clear-video-cache'); await wait(async () => text('#video-save-state'), value => value.includes('已清理本账户'));
    check(evaluate('function(userId){return wx.getStorageSync("wb_v2_saved_media:"+userId).length}', [session.userId]) === 0, 'explicit cache cleanup clears only the rehearsal account index');
    await navigate('/pages/studio-mine/index'); check(text('#mine-balance').includes('66'), 'trial balance matches two videos');
    check(text('#mine-entries').includes('已结算') && !text('#mine-entries').includes('+0'), 'zero settlement clearly described without a false positive inflow');
    save(path.join(evidence, 'report.json'), { runId: state.runId, mode: 'rehearsal', checks, assertions: checks.length, interactions, results, paidCalls: 0, modalReturnInjected: true, imageSelectionInjected: true, realUpload: true, phoneVerified: false });
    save(path.join(directory, 'acceptance.json'), { completed: true, evidence, results, userId: session.userId, paidCalls: 0 });
    console.log(JSON.stringify({ evidence, assertions: checks.length, interactions, paidCalls: 0 }));
  } finally { ideTool('automation_wx_api', ['--action', 'restore', '--method', 'showModal']); if (imageMock) ideTool('automation_wx_api', ['--action', 'restore', '--method', 'chooseImage']); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
