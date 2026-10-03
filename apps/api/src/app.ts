import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
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

  // H5 端跨源(开发期全放行;生产按域名收窄,随部署工单)
  app.register(cors, { origin: true });
  app.register(fjwt, { secret: opts.jwtSecret });

  const wallet = new WalletService(db);
  registerHealthRoutes(app);
  registerAuthRoutes(app, db, wallet);
  registerWalletRoutes(app, wallet);

  return app;
}
