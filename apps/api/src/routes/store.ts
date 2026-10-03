import type { FastifyInstance } from 'fastify';
import { CreateOrderRequest, ErrorCode, type StoreOrder } from '@wb/contracts';

import { requireAuth } from './auth-route-shared';
import type { StoreService } from '../store';

export function registerStoreRoutes(app: FastifyInstance, store: StoreService) {
  app.get('/v1/store/packages', async () => ({ packages: await store.listPackages() }));

  app.post<{ Body: unknown }>('/v1/store/orders', { preHandler: [requireAuth] }, async (req, reply) => {
    const { sub } = req.user as { sub: string };
    const parsed = CreateOrderRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: ErrorCode.VALIDATION, message: '参数校验失败' });
    }
    const order = await store.createOrder(sub, parsed.data.packageId);
    return reply.code(201).send(order);
  });

  app.get('/v1/store/orders', { preHandler: [requireAuth] }, async (req) => {
    const { sub } = req.user as { sub: string };
    return { orders: await store.myOrders(sub) };
  });

  /** DEV-ONLY 模拟支付:生产(NODE_ENV=production)一律 404,防误开放。 */
  app.post<{ Params: { id: string } }>(
    '/v1/store/orders/:id/dev-pay',
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(404).send({ code: ErrorCode.NOT_FOUND, message: 'not found' });
      }
      const { sub } = req.user as { sub: string };
      const order: StoreOrder = await store.devPay(sub, req.params.id);
      return order;
    },
  );
}
