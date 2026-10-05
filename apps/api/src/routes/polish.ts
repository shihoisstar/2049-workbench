import type { FastifyInstance } from 'fastify';
import { PolishRequest, PolishResult } from '@wb/contracts';
import type { GatewayRouter } from '@wb/model-gateway';

import { requireAuth } from './auth-route-shared';

const SYSTEM_PROMPT =
  '你是营销短视频文案专家。把用户给出的一句卖点扩写成 30 秒口播稿:开头 3 秒强钩子、中段 3 个卖点、结尾行动号召。直接输出文案正文,不要标题、不要解释、不要 markdown。总长不超过 200 字。';

export function registerPolishRoutes(app: FastifyInstance, router: GatewayRouter) {
  app.post<{ Body: unknown }>('/v1/polish', { preHandler: [requireAuth] }, async (req, reply) => {
    const parsed = PolishRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 1001, message: '请输入 2-1000 字的卖点' });
    }
    try {
      const { text } = await router.chat({
        modelName: process.env.ATLAS_CHAT_MODEL ?? 'deepseek-ai/deepseek-v4.1-flash',
        system: SYSTEM_PROMPT,
        user: parsed.data.text,
        maxTokens: 1000,
      });
      return { text: text.slice(0, 3000) } satisfies PolishResult;
    } catch (e) {
      const err = e as { code?: string };
      return reply.code(503).send({ code: 1003, message: `文案服务暂不可用(${err.code ?? 'upstream'}),请稍后再试` });
    }
  });
}
