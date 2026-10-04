/**
 * 网关装配(从环境变量):火山主通道(有 KEY 时)+ Atlas stub + 开发期 mock 通道。
 * 渠道配置集中此处——业务层只拿 GatewayRouter,切换/增删渠道零改动(INF-04 验收)。
 */
import {
  atlasVideoStub,
  createEnvSecretResolver,
  createGatewayRouter,
  volcengineSeedanceAdapter,
  type ChannelView,
  type GatewayRouter,
  type VideoAdapter,
} from '@wb/model-gateway';

import { mockVideoAdapter } from './mock-adapter';

export type GatewayEnv = Partial<
  Record<'VOLC_ARK_API_KEY' | 'VOLC_ARK_BASE_URL' | 'VOLC_RPM_LIMIT' | 'VOLC_SEEDANCE_MODEL' | 'NODE_ENV', string>
>;

export function buildGatewayRouterFromEnv(env: GatewayEnv = process.env): GatewayRouter {
  const isDev = env.NODE_ENV !== 'production';
  const channels: ChannelView[] = [];
  const adapters: Record<string, VideoAdapter> = {};

  if (env.VOLC_ARK_API_KEY) {
    channels.push({
      id: 1,
      providerName: 'volcengine',
      name: '火山 Seedance 主通道',
      baseUrl: env.VOLC_ARK_BASE_URL ?? 'https://ark.cn-beijing.volces.com',
      secretRef: 'volc-key',
      weight: 10,
      rpmLimit: Number(env.VOLC_RPM_LIMIT ?? 60),
      status: 'active',
      health: 'ok',
      config: { model: env.VOLC_SEEDANCE_MODEL ?? 'doubao-seedance-2-0-fast' },
    });
    adapters.volcengine = volcengineSeedanceAdapter;
  }

  // Atlas:V0 stub(503)——演练 failover/切换用;免费层启用时替换为真实 adapter
  channels.push({
    id: 2,
    providerName: 'atlas',
    name: 'Atlas 备用(stub)',
    baseUrl: null,
    secretRef: 'atlas-key',
    weight: 5,
    rpmLimit: null,
    status: 'active',
    health: 'ok',
    config: {},
  });
  adapters.atlas = atlasVideoStub;

  if (isDev) {
    channels.push({
      id: 3,
      providerName: 'mock',
      name: 'Mock 通道(开发)',
      baseUrl: null,
      secretRef: 'mock-key',
      weight: 100, // 开发期权重压过真实通道:无 KEY 也全链路可跑
      rpmLimit: null,
      status: 'active',
      health: 'ok',
      config: {},
    });
    adapters.mock = mockVideoAdapter;
  }

  const router = createGatewayRouter({
    channels,
    adapters,
    secretResolver: createEnvSecretResolver({
      refToEnv: {
        'volc-key': 'VOLC_ARK_API_KEY',
        'atlas-key': 'ATLAS_API_KEY',
        'mock-key': 'MOCK_KEY',
      },
      env: { ...env, MOCK_KEY: 'mock' } as Record<string, string | undefined>,
    }),
  });
  return router;
}
