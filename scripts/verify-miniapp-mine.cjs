// 验收：studio-mine「我的」页真实余额与积分明细（微信开发者工具自动化）。
// 前置：验收栈已恢复、.local/video-acceptance/works-api.cjs 已用新端点重启、
// dist/studio 已带 TARO_APP_API_NEXT_BASE 指向 works-api 重建。
// 断言基准来自验收库 wb_next.ledger/wallets：主账户 8ef9ec03 共 5 条流水、余额 3；
// 另一账户 65805711 另有 1 条流水（第 6 行不存在即证明无跨账号泄漏）。
// 直接以 Electron-as-Node 方式拉起 wechatide CLI，args 数组传参，绕开 cmd 引号与控制台编码问题。
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const project = path.join(workspace, 'apps/miniapp/dist/studio');
const ideDir = findIdeDir();
const electron = findElectron(ideDir);
const cli = path.join(ideDir, 'resources/app.asar.unpacked/js/common/cli/skill-index.js');
const bootstrap = "const e=process.argv[1],a=process.argv.slice(2).filter(function(x){return x!=='--electron'});if(!process.env.cwd)process.env.cwd=process.cwd();process.argv=[process.execPath,e,'--electron'].concat(a);require(e)";

function findIdeDir() {
  const out = spawnSync('powershell', ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8;(Get-Command wechatide).Source'], { encoding: 'utf8' });
  const source = out.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l.toLowerCase().endsWith('wechatide.cmd'));
  if (!source) throw new Error('wechatide not found');
  return path.dirname(source);
}
function findElectron(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (!name.toLowerCase().endsWith('.exe')) continue;
    if (/^(node|node-18|wxfilewatcher|wxfilewatcher_x64|notification_helper|wechatdevtools)\.exe$/i.test(name)) continue;
    if (fs.statSync(path.join(dir, name)).size > 50 * 1024 * 1024) return path.join(dir, name);
  }
  throw new Error('Electron executable not found under ' + dir);
}
function ideTool(name, args, timeoutMs = 120000) {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON: '' };
  const out = spawnSync(electron, ['-e', bootstrap, cli, '-c', 'Codex', name, '--project', project, ...args], { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
  const text = (out.stdout || '').toString('utf8');
  const begin = text.indexOf('{');
  if (begin < 0) throw new Error(`${name} produced no JSON: ${text.slice(0, 300)}`);
  let response;
  try { response = JSON.parse(text.slice(begin)); } catch { throw new Error(`${name} returned invalid JSON: ${text.slice(begin, 300)}`); }
  if (!response.ok) {
    const error = new Error(`${name} failed: ${response.message}`);
    error.toolError = response.message;
    throw error;
  }
  const result = response.result;
  if (result && typeof result === 'object' && 'success' in result && !result.success) throw new Error(`${name} reported failure: ${JSON.stringify(result).slice(0, 300)}`);
  return result;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
function check(condition, label) {
  if (!condition) throw new Error('Assertion failed: ' + label);
  checks.push(label);
  console.log('PASS', label);
}
function readText(selector) {
  return ideTool('automation_element_action', ['--selector', selector, '--action', 'text', '--wait-for-selector', selector, '--wait', '1']);
}
function tap(selector) {
  ideTool('automation_element_action', ['--selector', selector, '--action', 'tap', '--wait-for-selector', selector, '--wait', '1']);
}
async function main() {
  const init = spawnSync('cmd.exe', ['/d', '/c', `${path.join(ideDir, 'cli.bat')} auto --project ${project}`], { encoding: 'utf8', timeout: 180000 });
  if (init.status !== 0) {
    console.log('auto init skipped (' + String(init.stderr || init.stdout || init.error).split(/\r?\n/)[0] + '); probing existing automation session');
    const probe = ideTool('automation_evaluate', ['--fn-source', 'function(){return 1}'], 60000);
    if (!probe || !probe.result || probe.result.result !== 1) throw new Error('No responsive automation session');
  }

  let navigated = false;
  for (let attempt = 1; attempt <= 6 && !navigated; attempt++) {
    try {
      ideTool('automation_navigate', ['--action', 'reLaunch', '--url', '/pages/studio-home/index']);
      navigated = true;
    } catch (error) {
      console.log('navigate attempt ' + attempt + ' failed: ' + (error.toolError || error.message));
      await sleep(4000);
    }
  }
  if (!navigated) throw new Error('Simulator runtime never became ready');
  await sleep(2500);
  tap('.studio-credit');
  await sleep(1500);
  const viaCard = readText('#mine-balance');
  check(/当前积分/.test(viaCard) && /3/.test(viaCard), 'Home balance card navigates to mine page showing server balance 3');

  ideTool('automation_navigate', ['--action', 'navigateBack']);
  await sleep(1200);
  ideTool('automation_navigate', ['--action', 'reLaunch', '--url', '/pages/studio-home/index']);
  await sleep(2500);
  tap('#studio-nav-mine');
  await sleep(1500);

  const entries = readText('#mine-entries');
  check(/结算返还/.test(entries) && /消费预留/.test(entries) && /退款返还/.test(entries) && /积分赠送/.test(entries), 'All four ledger kinds render with Chinese labels');
  check(/\+77/.test(entries) && /-77/.test(entries) && /\+80/.test(entries) && /\+0/.test(entries), 'Signed amounts render: refund +77, holds -77, grant +80, settle +0');
  check(/注册赠送/.test(entries), 'Signup grant remark renders');
  const footer = readText('.studio-works-footer');
  check(/已显示全部明细/.test(footer), 'Five-row ledger shows all-shown footer');

  const rows = [];
  for (let i = 1; i <= 6; i++) {
    try { rows.push(readText(`#mine-entries .studio-mine-entry:nth-child(${i})`)); }
    catch (error) {
      if (i <= 5 || !/no such element|waitForSelector timeout/.test(String(error.toolError || error.message))) throw error;
      break;
    }
  }
  check(rows.length === 5, `Exactly 5 ledger rows render (acceptance DB holds 6 rows across 2 users, got ${rows.length})`);
  check(/结算返还/.test(rows[0]) && /\+0/.test(rows[0]), 'Newest row is the succeeded job settle +0');
  check(/消费预留/.test(rows[1]) && /-77/.test(rows[1]), 'Second row is the succeeded job hold -77');
  check(/退款返还/.test(rows[2]) && /\+77/.test(rows[2]), 'Third row is the failed job refund +77');
  const amounts = rows.reduce((sum, row) => { const m = /([+-]\d+)\s*$/.exec(row.trim()); return sum + (m ? Number(m[1]) : NaN); }, 0);
  check(amounts === 3, `Rendered amounts sum to balance 3 (80-77+77-77+0, got ${amounts})`);
  const deactivate = readText('#mine-deactivate');
  check(/注销账户/.test(deactivate), 'Deactivation entry renders (modal intentionally not confirmed)');

  const folder = path.join(workspace, 'docs/验收留档/MINE-2026-10-08');
  fs.mkdirSync(folder, { recursive: true });
  ideTool('simulator_screenshot', ['--path', path.join(folder, 'mine-page.jpg')]);
  const report = {
    checks,
    passed: checks.length,
    paidCalls: 0,
    limitations: ['Physical device not tested', 'Pull-down refresh and load-more not exercised (5 rows fit one page)', 'Deactivation modal intentionally not confirmed to preserve acceptance account'],
    checkedAt: new Date().toISOString(),
  };
  const target = path.join(folder, 'navigation-proof.json');
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  if (fs.readFileSync(target, 'utf8') !== JSON.stringify(report, null, 2)) throw new Error('Evidence readback failed');
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
