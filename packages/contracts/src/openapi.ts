import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { GuestLoginRequest, GuestSession } from './auth';
import { ErrorBody } from './errors';
import { HealthResponse } from './health';
import { API_VERSION } from './version';

/**
 * OpenAPI 文档唯一生成处:T0.3 契约 = health + 统一错误码 + 鉴权骨架。
 * 新端点流程:加 Zod schema → 注册进 paths → contract:snapshot 重签 → 前端经 @wb/contracts 取类型,零手写。
 */
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: '2049出片 API',
      version: API_VERSION,
      description: '契约唯一事实源 @wb/contracts 生成;禁止手改 openapi.json。',
    },
    servers: [{ url: '/', description: '相对路径,按部署环境替换' }],
    paths: {
      '/healthz': {
        get: {
          summary: '存活探测(LB / CI)',
          responses: {
            '200': {
              description: '健康',
              content: { 'application/json': { schema: ref('HealthResponse') } },
            },
          },
        },
      },
      '/v1/auth/guest': {
        post: {
          summary: '游客登录(鉴权骨架,实现随 T1.1)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('GuestLoginRequest') } },
          },
          responses: {
            '200': {
              description: '会话签发',
              content: { 'application/json': { schema: ref('GuestSession') } },
            },
            '401': {
              description: '鉴权失败',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        HealthResponse: zodToJsonSchema(HealthResponse, { target: 'openApi3' }),
        ErrorBody: zodToJsonSchema(ErrorBody, { target: 'openApi3' }),
        GuestLoginRequest: zodToJsonSchema(GuestLoginRequest, { target: 'openApi3' }),
        GuestSession: zodToJsonSchema(GuestSession, { target: 'openApi3' }),
      },
    },
  };
}

/** 端点注册表(进 contract-snapshot:端点增删即契约漂移)。 */
export function endpointList(doc = buildOpenApiDocument()): string[] {
  return Object.entries(doc.paths)
    .flatMap(([path, item]) => Object.keys(item).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}

if (require.main === module) {
  const file = join(__dirname, '..', 'openapi.json');
  writeFileSync(file, JSON.stringify(buildOpenApiDocument(), null, 2) + '\n', 'utf8');
  console.log(`openapi written: ${file}`);
}
