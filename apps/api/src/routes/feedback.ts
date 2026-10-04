import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { CreateFeedbackRequest, ErrorCode, FeedbackCreated } from '@wb/contracts';

import { requireAuth } from './auth-route-shared';
import type { Db } from '../db';
import { feedbacks } from '../schema';

export function registerFeedbackRoutes(app: FastifyInstance, db: Db) {
  app.post<{ Body: unknown }>('/v1/feedback', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const parsed = CreateFeedbackRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '内容不能为空(1000 字内)' });
    }
    const row = (
      await db
        .insert(feedbacks)
        .values({ userId: sub, content: parsed.data.content, contact: parsed.data.contact })
        .returning({ id: feedbacks.id })
    )[0];
    return reply.code(201).send({ id: row.id } satisfies FeedbackCreated);
  });

  /** 我的反馈(前端"我的反馈"列表;全量运营视图随 admin 后台)。 */
  app.get('/v1/feedback/mine', { preHandler: [requireAuth] }, async (req) => {
    const { sub } = req.user as { sub: string };
    const rows = await db
      .select({ id: feedbacks.id, content: feedbacks.content, status: feedbacks.status, createdAt: feedbacks.createdAt })
      .from(feedbacks)
      .where(eq(feedbacks.userId, sub));
    return { feedbacks: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  });
}
