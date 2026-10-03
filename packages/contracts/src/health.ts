import { z } from 'zod';
import { API_VERSION } from './version';

/** GET /healthz 响应契约(LB / CI 探活用)。 */
export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  apiVersion: z.literal(API_VERSION),
  uptimeSec: z.number().int().nonnegative(),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
