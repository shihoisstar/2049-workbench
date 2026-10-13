// Authorized small text-only evaluation. Credentials never enter the evidence.
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { createRequire } = require('node:module');
const root = resolve(__dirname, '..');
const gatewayRequire = createRequire(join(root, 'packages/model-gateway/package.json'));
const { openAiCompatibleChatAdapter, ChatResponseError } = gatewayRequire('./dist/index.js');
const { parseDramaScript } = createRequire(join(root, 'packages/server/package.json'))('./dist/index.js');
const directory = join(root, 'docs/验收留档/DRAMA-SCRIPT-2026-10-10/real-text');
const env = {};
for (const line of readFileSync(join(root, 'apps/api/.env'), 'utf8').split(/\r?\n/)) {
  const match = /^(ATLAS_API_KEY|ATLAS_CHAT_MODEL|ATLAS_BASE_URL)=(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
}
const model = env.ATLAS_CHAT_MODEL || 'deepseek-ai/deepseek-v4.1-flash';
const baseUrl = env.ATLAS_BASE_URL || 'https://api.atlascloud.ai';
if (new URL(baseUrl).origin !== 'https://api.atlascloud.ai' || model !== 'deepseek-ai/deepseek-v4.1-flash') throw new Error('Evaluation price is verified only for the existing Atlas Flash model');
if (!env.ATLAS_API_KEY) throw new Error('Existing Atlas credential unavailable');
mkdirSync(directory, { recursive: true });
const reportPath = join(directory, 'report.json');
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : {
  model, provider: 'Atlas', budgetCny: 20, internalBudgetUsd: 0.1, inputUsdPerMillion: 0.3, outputUsdPerMillion: 1.2,
  pricingSource: 'https://www.atlascloud.ai/pricing/models', attempts: [],
};
function save() { const text = JSON.stringify(report, null, 2) + '\n'; writeFileSync(reportPath, text); if (readFileSync(reportPath, 'utf8') !== text) throw new Error('Evidence readback mismatch'); }
const samples = [
  ['cat', '云海来信', '橘猫驾驶飞船穿过粉色云海，寻找失踪月亮。结尾发现一封写给自己的信。'],
  ['mystery', '明日订单', '夜班便利店收到未来自己的订单，店员必须在天亮前找出真正的送货人。'],
  ['commerce', '最后一杯', '一家咖啡店的店员与赶时间的客人发生小误会，用故事自然表现现磨咖啡的特点，禁止夸大功效与堆砌广告口号。'],
  ['commerce-repair', '最后一杯', '一家咖啡店的店员与赶时间的客人发生小误会，用故事自然表现现磨咖啡的特点，禁止夸大功效与堆砌广告口号。'],
  ['cat-v2', '云海来信', '橘猫驾驶飞船穿过粉色云海，寻找失踪月亮。结尾发现一封写给自己的信。'],
  ['mystery-v2', '明日订单', '夜班便利店收到未来自己的订单，店员必须在天亮前找出真正的送货人。'],
  ['commerce-v2', '最后一杯', '一家咖啡店的店员与赶时间的客人发生小误会，用故事自然表现现磨咖啡的特点，禁止夸大功效与堆砌广告口号。'],
];
const system = '你是中文短剧编剧。只输出可拍摄的第1集剧本，不输出解释、推理、代码围栏。必须以“## 第1集”开始；场景行必须为“**场景1：地点 日/内**”这种格式；对白为“角色名：对白”，动作指示单独用中文括号且不要使用冒号。2至4场景，不超过3个角色，正文500至900字。开头有吸引力，中间有冲突，结尾有转折；人物名字保持一致，不引入难以制作的大量镜头。营销题材未提供的价格、地址、产品功效和优惠不得编造，必要时写[待填写]；不得泛化或贬低竞品。优先通过对白和简单动作推动故事，不使用巨型生物、复杂变形、多人群战或大量特效。';
async function main() {
  report.authorizedRequestLimit = 7;
  if (report.attempts.some(item => item.status === 'pending' || item.status === 'unknown')) throw new Error('Unknown acceptance recorded; refusing another paid request');
  for (const [name, title, idea] of samples) {
    if (report.attempts.some(item => item.sample === name)) continue;
    if (report.attempts.length >= 7) throw new Error('Authorized request limit reached');
    const user = `名称：${title}\n故事想法：${idea}\n只写第1集，场景序号从1递增。`;
    const promptBytes = Buffer.byteLength(system + user);
    const maximumUsd = promptBytes * 0.3 / 1e6 + 2000 * 1.2 / 1e6;
    const reserved = report.attempts.reduce((sum, item) => sum + item.maximumUsd, 0);
    if (reserved + maximumUsd > 0.1) throw new Error('Conservative evaluation budget exceeded');
    const attempt = { sample: name, status: 'pending', promptRevision: 2, maxTokens: 2000, reasoning: 'disabled', maximumUsd, startedAt: new Date().toISOString() };
    report.attempts.push(attempt); save();
    let responsePayload;
    const fetchImpl = async (...args) => {
      const response = await fetch(...args);
      try { responsePayload = await response.clone().json(); } catch { /* Preserve unknown accounting rather than retry. */ }
      return response;
    };
    try {
      const result = await openAiCompatibleChatAdapter.chat({ secret: env.ATLAS_API_KEY, fetchImpl, timeoutMs: 90000 },
        { id: 2, providerName: 'atlas', name: 'Existing text account', baseUrl, secretRef: 'local-only', weight: 1, rpmLimit: null, status: 'active', health: 'ok', config: { chatModel: model } },
        { modelName: model, system, user, maxTokens: 2000, timeoutMs: 90000, disableThinking: true, requireComplete: true });
      const parsed = parseDramaScript(result.text);
      writeFileSync(join(directory, `${name}.md`), result.text);
      if (readFileSync(join(directory, `${name}.md`), 'utf8') !== result.text) throw new Error('Sample readback mismatch');
      Object.assign(attempt, { status: 'succeeded', parse: parsed, characters: result.text.length, receipt: result.receipt });
      attempt.finishReason = responsePayload?.choices?.[0]?.finish_reason ?? null;
    } catch (error) {
      if (error instanceof ChatResponseError) attempt.receipt = error.receipt;
      attempt.status = responsePayload ? 'failed_response' : 'unknown';
      attempt.failure = responsePayload ? 'Provider returned no usable script' : 'Response unavailable; no retry';
    }
    if (responsePayload?.usage) {
      attempt.usage = responsePayload.usage;
      const input = Number(responsePayload.usage.prompt_tokens); const output = Number(responsePayload.usage.completion_tokens);
      if (Number.isFinite(input) && Number.isFinite(output)) attempt.calculatedUsd = (input * 0.3 + output * 1.2) / 1e6;
    }
    attempt.finishedAt = new Date().toISOString(); save();
    console.log(JSON.stringify({ sample: name, status: attempt.status, parse: attempt.parse?.status, calculatedUsd: attempt.calculatedUsd ?? null }));
    if (attempt.status !== 'succeeded' || attempt.parse.status !== 'parsed') break;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
