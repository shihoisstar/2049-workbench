import type { FastifyInstance } from 'fastify';
import { GenerateImageRequest, GenerateImageResult } from '@wb/contracts';
import type { GatewayRouter } from '@wb/model-gateway';

import { requireAuth } from './auth-route-shared';

/** 简易用户级限流(内存;V0 防滥用,生产换 Redis 计数)。 */
const RATE = { max: 5, windowMs: 3600_000 };
const buckets = new Map<string, number[]>();

function allow(userId: string): boolean {
  const now = Date.now();
  const list = (buckets.get(userId) ?? []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) return false;
  list.push(now);
  buckets.set(userId, list);
  return true;
}

export function registerImageRoutes(app: FastifyInstance, router: GatewayRouter) {
  app.post<{ Body: unknown }>('/v1/images/generate', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const parsed = GenerateImageRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: 1001, message: '请输入描述(2-1000 字)' });
    }
    if (!allow(sub)) {
      return reply.code(429).send({ code: 1003, message: '绘画次数已达每小时上限(5 次)' });
    }
    try {
      const { imageUrl } = await router.generateImage({
        prompt: parsed.data.prompt,
        imageUrls: parsed.data.imageUrls,
        aspectRatio: parsed.data.aspectRatio,
      });
      return { imageUrl } satisfies GenerateImageResult;
    } catch (e) {
      const err = e as { code?: string };
      return reply.code(503).send({ code: 1003, message: `绘画服务暂不可用(${err.code ?? 'upstream'}),请稍后再试` });
    }
  });
}
