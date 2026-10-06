import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ErrorCode, GuestLoginRequest, SIGNUP_GRANT_CREDITS, type GuestSession } from '@wb/contracts';

import type { Db } from '../db';
import { users } from '../schema';
import { isUniqueViolation } from '../wallet';
import type { WalletService } from '../wallet';

/** 会话有效期:游客态 7 天,过期前端静默重登(契约注释)。 */
const SESSION_TTL_SEC = 7 * 24 * 3600;

/** 注册赠送积分(BIZ-05「新用户 1 条 480P」的额度形态;换算随 T1.4 定价校准)。 */
const SIGNUP_GRANT = SIGNUP_GRANT_CREDITS;

export { requireAuth } from './auth-route-shared';
import { requireAuth } from './auth-route-shared';

export function registerAuthRoutes(app: FastifyInstance, db: Db, wallet: WalletService) {
  app.post<{ Body: unknown }>('/v1/auth/guest', async (req, reply) => {
    const parsed = GuestLoginRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '参数校验失败' });
    }
    const { deviceId } = parsed.data;

    const existing = await db.select().from(users).where(eq(users.deviceId, deviceId)).limit(1);
    let user = existing[0];
    if (!user) {
      try {
        user = (await db.insert(users).values({ deviceId }).returning())[0];
      } catch (e) {
        // 并发登录竞态:唯一约束冲突 → 读回已有用户(幂等,登录永远 200)
        if (!isUniqueViolation(e)) throw e;
        user = (await db.select().from(users).where(eq(users.deviceId, deviceId)).limit(1))[0];
        if (!user) throw e;
      }
    }

    // 注册即赠:幂等键按用户域,重复登录不重复发放
    await wallet.grant(user.id, SIGNUP_GRANT, `signup-grant:${user.id}`, '注册赠送(1 条 480P 预览)');

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: SESSION_TTL_SEC });
    return { token, userId: user.id, expiresInSec: SESSION_TTL_SEC } satisfies GuestSession;
  });

  /** 注销(软删除):清 deviceId/phone 可重新注册,行留存合规审计。 */
  app.post('/v1/auth/deactivate', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    await db
      .update(users)
      .set({ status: 'deactivated', deviceId: null, phone: null, deactivatedAt: new Date() })
      .where(eq(users.id, sub));
    return reply.code(204).send();
  });
}
