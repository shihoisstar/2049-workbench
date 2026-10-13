import { DomainError } from '@wb/server';
import type { Services, ScriptJobLocator } from '@wb/server';

export function createMockScriptActivity(services: Services, enabled: boolean) {
  return async (input: ScriptJobLocator): Promise<void> => {
    const job = await services.dramaScripts.get(input);
    if (job.provider !== 'mock') throw new Error('Mock activity cannot generate a real script');
    if (job.status !== 'accepted') return;
    if (!enabled) { await services.dramaScripts.fail({ ...input, failureCode: 'SCRIPT_MOCK_DISABLED' }); return; }
    const snapshot = await services.dramaScripts.snapshot(input);
    // Deterministic fixture; this is not an AI interpretation of the idea.
    const background = snapshot.idea.replace(/[\r\n]+/g, ' ').slice(0, 1000);
    if (snapshot.episodeNumber !== undefined) {
      const number = snapshot.episodeNumber;
      const content = `## 第${number}集\n**场景1：飞船 日/内**\n（开发模拟，仅用于检查分集任务。）\n橘猫：第${number}站，出发。\n**场景2：云海 日/外**\n（飞船穿过云海。）\n橘猫：${number === snapshot.episodeCount ? '最后一站，我们终于找到回家的路。' : '下一站，还有一封信等着我们。'}`;
      await services.dramaScripts.receive({ ...input, response: { provider: 'mock', model: 'script-fixture-v1', responseId: `mock-script:${job.id}`, finishReason: 'stop', text: content, textTruncated: false, usage: null } }); return;
    }
    const content = `## 第1集\n**场景1：飞船 日/内**\n（开发模拟剧本，仅用于检查流程，不代表AI成片能力。）\n旁白：输入想法为${background}\n橘猫：今天，我要找到那颗不见了的月亮。\n\n**场景2：粉色云海 日/外**\n（小飞船掠过云海，远处漂浮着一封信。）\n橘猫：这封信上，为什么写着我的名字？\n\n**场景3：飞船 黄昏/内**\n（橘猫打开信，抬头望向星空。）\n橘猫：原来，回家的路一直在这里。`;
    await services.dramaScripts.receive({ ...input, response: { provider: 'mock', model: 'script-fixture-v1',
      responseId: `mock-script:${job.id}`, finishReason: 'stop', text: content, textTruncated: false, usage: null } });
  };
}
export function createScriptFailureActivity(services: Services) {
  return async (input: ScriptJobLocator): Promise<void> => {
    const job = await services.dramaScripts.get(input);
    if (job.provider !== 'mock' || job.status !== 'accepted') return;
    try { await services.dramaScripts.fail({ ...input, failureCode: 'SCRIPT_GENERATION_FAILED' }); }
    catch (error) {
      if (!(error instanceof DomainError) || error.statusCode !== 409 || (await services.dramaScripts.get(input)).status === 'accepted') throw error;
    }
  };
}
