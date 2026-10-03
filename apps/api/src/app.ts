import Fastify, { type FastifyInstance } from 'fastify';
import fjwt from '@fastify/jwt';

import { createDb } from './db';
import { registerAuthRoutes } from './routes/auth';
import { registerHealthRoutes } from './routes/health';
import { registerWalletRoutes } from './routes/wallet';
import { WalletService } from './wallet';

export interface AppOptions {
  databaseUrl: string;
  jwtSecret: string;
}

/** 组装应用(routes 经闭包拿 db/jwt;结构对齐 2049-agent apps/server,不做装饰器花活)。 */
export function buildApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  const { db, client } = createDb(opts.databaseUrl);
  app.addHook('onClose', async () => {
    await client.end();
  });

  app.register(fjwt, { secret: opts.jwtSecret });

  registerHealthRoutes(app);
  registerAuthRoutes(app, db);
  registerWalletRoutes(app, new WalletService(db));

  return app;
}
