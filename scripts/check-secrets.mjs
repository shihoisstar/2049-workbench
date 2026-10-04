#!/usr/bin/env node
/**
 * Secret 泄漏检查(INF-09 / T3.3)——进 pnpm gate 的强制门禁。
 * 纪律:只读;只打印文件名/规则/行号,**不打印密钥值**;退出码区分原因:
 *   0 = 通过 | 1 = 发现泄漏 | 2 = 检查本身没跑成(环境问题,不得记为通过)
 * 规则集保守起步(误报可加 allowlist);git 历史扫描由 CI 的 gitleaks 负责(双保险)。
 */
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const RULES = [
  { name: 'PEM 私钥块', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'AWS AccessKey', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'apik 风格长密钥', pattern: /apik[-_][A-Za-z0-9_-]{24,}/ },
  { name: 'sk 风格长密钥', pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  { name: 'JWT 三段式', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { name: '微信 AppSecret 赋值', pattern: /\bapp_?secret\s*[:=]\s*['"][A-Za-z0-9]{16,}['"]/i },
];

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

let files;
try {
  files = execSync('git ls-files -z', { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
} catch (e) {
  fail(`无法列出 git 文件(git 不可用?): ${e.message}`);
}
if (!files || files.length === 0) fail('git ls-files 返回空——确认在仓库根目录运行');

const findings = [];
for (const file of files) {
  let content;
  try {
    content = await readFile(file, 'utf8'); // 直读工作区:未暂存/新文件也在检查范围
  } catch {
    continue; // 二进制或已删除 → 跳过该文件(不中断整体)
  }
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const rule of RULES) {
      if (rule.pattern.test(lines[i])) {
        findings.push({ file, line: i + 1, rule: rule.name });
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`发现 ${findings.length} 处疑似密钥泄漏(详情不含密钥值):`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.file}:${f.line}`);
  console.error('处置:立即轮换该密钥,再移除文本(见 AGENTS.md §六);allowlist 需在 RULES 注明理由。');
  process.exit(1);
}
console.log(`check-secrets: PASS(${files.length} 个受控文件 × ${RULES.length} 条规则)`);
