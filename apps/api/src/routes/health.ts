import type { FastifyInstance } from 'fastify';

import { healthResponse } from '../health';

export function registerHealthRoutes(app: FastifyInstance) {
  app.get('/healthz', async () => healthResponse(Math.floor(process.uptime())));
}
