/**
 * @wb/model-gateway —— 模型网关(自 2049-agent packages/gateway 瘦身移植,T2.1)。
 * 主通道:火山 Seedance 2.0;备用:Atlas stub(ADR-0002)。切换演练 = 业务层仅经 createGatewayRouter。
 */
export {
  createGatewayRouter,
  createEnvSecretResolver,
  type GatewayRouter,
  type GatewayRouterDeps,
  type SecretResolver,
} from './router/router';
export { ChannelPool } from './router/channel-pool';
export { createMemoryRateLimiter, rateLimiterKey, type SyncRateLimiter } from './router/rate-limiter';
export { openAiCompatibleChatAdapter, buildChatMessages } from './router/chat';
export type { ChatAdapter, ChatRequest } from './router/chat';
export { volcengineSeedanceAdapter } from './router/adapters/volcengine-seedance';
export { atlasVideoAdapter } from './router/adapters/atlas';
export { atlasVideoStub } from './router/adapters/atlas-stub';
export type {
  AdapterContext,
  ChannelView,
  GatewayAttempt,
  GatewayErrorCode,
  GatewayRequest,
  GatewayResponse,
  GatewayUsage,
  ModelType,
  TaskOperation,
  VideoAdapter,
} from './router/types';
export { GatewayError } from './router/types';
