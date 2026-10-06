import { z } from 'zod';

/** POST /v1/auth/guest 请求 —— 游客登录(鉴权骨架;完整账号体系见 INF-01 / T1.1)。 */
export const GuestLoginRequest = z.object({
  deviceId: z.string().min(8).max(64),
});
export type GuestLoginRequest = z.infer<typeof GuestLoginRequest>;

/** V2 guest proof: a client-held cryptographically random 256-bit secret, never a device identifier. */
export const GuestBootstrapRequest = z.object({
  credential: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GuestBootstrapRequest = z.infer<typeof GuestBootstrapRequest>;

/** POST /v1/auth/guest 响应 —— 会话签发。 */
export const GuestSession = z.object({
  token: z.string().min(1),
  userId: z.string().min(1),
  /** 有效期(秒);过期由前端静默重登 */
  expiresInSec: z.number().int().positive(),
});
export type GuestSession = z.infer<typeof GuestSession>;
