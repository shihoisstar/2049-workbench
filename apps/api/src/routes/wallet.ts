import type { FastifyInstance } from 'fastify';

import { WalletSummary, type WalletEntry } from '@wb/contracts';

import { requireAuth } from './auth-route-shared';
import type { WalletService } from '../wallet';

export function registerWalletRoutes(app: FastifyInstance, wallet: WalletService) {
  app.get('/v1/wallet', { preHandler: [requireAuth] }, async (req) => {
    const { sub } = req.user as { sub: string };
    const s = await wallet.summary(sub);
    const body: WalletSummary = {
      balance: s.balance,
      entries: s.entries.map((e): WalletEntry => ({
        billingKey: e.billingKey,
        type: e.type as WalletEntry['type'],
        amount: e.amount,
        remark: e.remark,
        createdAt: e.createdAt.toISOString(),
      })),
    };
    return body;
  });
}
