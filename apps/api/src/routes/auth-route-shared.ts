import type { FastifyRequest } from 'fastify';

/** Bearer 校验;载荷即 JWT claims({ sub: userId })。auth/wallet 路由共用。 */
export async function requireAuth(req: FastifyRequest): Promise<void> {
  await req.jwtVerify();
}
