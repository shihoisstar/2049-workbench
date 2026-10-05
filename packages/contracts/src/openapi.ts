import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { GuestLoginRequest, GuestSession } from './auth';
import { ErrorBody } from './errors';
import { HealthResponse } from './health';
import { CreateOrderRequest, StoreOrder, StoreOrders, StorePackages } from './store';
import { CreateFeedbackRequest, FeedbackCreated } from './feedback';
import { CreateTaskRequest, GenerationTask, GenerationTasks } from './tasks';
import { Templates } from './templates';
import { UploadResult } from './uploads';
import { WalletSummary } from './wallet';
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
          summary: '游客登录(实现:T1.1 Fastify)',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('GuestLoginRequest') } },
          },
          responses: {
            '200': {
              description: '会话签发',
              content: { 'application/json': { schema: ref('GuestSession') } },
            },
            '400': {
              description: '参数校验失败',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/auth/deactivate': {
        post: {
          summary: '账号注销(软删除;实现:T1.1)',
          security: [{ bearerAuth: [] }],
          responses: {
            '204': { description: '已注销' },
            '401': {
              description: '未登录/凭证失效',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/uploads': {
        post: {
          summary: '上传参考图(V1 传图生成;multipart 字段 file,≤10M,jpg/png/webp)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: { file: { type: 'string', format: 'binary' } },
                  required: ['file'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: '上传完成',
              content: { 'application/json': { schema: ref('UploadResult') } },
            },
          },
        },
      },
      '/v1/wallet': {
        get: {
          summary: '钱包概览:余额+最近流水(实现:T1.2)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '余额与流水',
              content: { 'application/json': { schema: ref('WalletSummary') } },
            },
            '401': {
              description: '未登录',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
      },
      '/v1/store/packages': {
        get: {
          summary: '充值档位列表(T1.4)',
          responses: {
            '200': {
              description: '档位',
              content: { 'application/json': { schema: ref('StorePackages') } },
            },
          },
        },
      },
      '/v1/store/orders': {
        post: {
          summary: '创建充值订单(T1.4;微信支付参数随商户号接入,当前阻塞墙)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateOrderRequest') } },
          },
          responses: {
            '201': {
              description: '订单已创建',
              content: { 'application/json': { schema: ref('StoreOrder') } },
            },
            '401': {
              description: '未登录',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
        get: {
          summary: '我的订单列表(T1.4)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '订单',
              content: { 'application/json': { schema: ref('StoreOrders') } },
            },
          },
        },
      },
      '/v1/store/orders/{id}/dev-pay': {
        post: {
          summary: 'DEV-ONLY:模拟支付回调(NODE_ENV=production 时 404;真实微信回调随商户号)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '订单已支付并入账',
              content: { 'application/json': { schema: ref('StoreOrder') } },
            },
          },
        },
      },
      '/v1/templates': {
        get: {
          summary: '模板 feed(T3.2 首页;生成同款→预填创作表单)',
          responses: {
            '200': {
              description: '模板列表',
              content: { 'application/json': { schema: ref('Templates') } },
            },
          },
        },
      },
      '/v1/feedback': {
        post: {
          summary: '提交用户反馈(OPS-01;落库后运营可见)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateFeedbackRequest') } },
          },
          responses: {
            '201': {
              description: '已受理',
              content: { 'application/json': { schema: ref('FeedbackCreated') } },
            },
          },
        },
      },
      '/v1/tasks': {
        post: {
          summary: '创建生成任务(冻结估算积分并入队;实现:T2.2)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('CreateTaskRequest') } },
          },
          responses: {
            '202': {
              description: '任务已受理',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
            '402': {
              description: '积分不足',
              content: { 'application/json': { schema: ref('ErrorBody') } },
            },
          },
        },
        get: {
          summary: '我的任务列表',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '任务列表',
              content: { 'application/json': { schema: ref('GenerationTasks') } },
            },
          },
        },
      },
      '/v1/tasks/{id}': {
        get: {
          summary: '任务详情(进度轮询)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '任务',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
          },
        },
      },
      '/v1/tasks/{id}/cancel': {
        post: {
          summary: '取消任务(失败/取消全额退积分)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: '取消后的任务',
              content: { 'application/json': { schema: ref('GenerationTask') } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        UploadResult: zodToJsonSchema(UploadResult, { target: 'openApi3' }),
        CreateFeedbackRequest: zodToJsonSchema(CreateFeedbackRequest, { target: 'openApi3' }),
        FeedbackCreated: zodToJsonSchema(FeedbackCreated, { target: 'openApi3' }),
        Templates: zodToJsonSchema(Templates, { target: 'openApi3' }),
        CreateTaskRequest: zodToJsonSchema(CreateTaskRequest, { target: 'openApi3' }),
        GenerationTask: zodToJsonSchema(GenerationTask, { target: 'openApi3' }),
        GenerationTasks: zodToJsonSchema(GenerationTasks, { target: 'openApi3' }),
        StorePackages: zodToJsonSchema(StorePackages, { target: 'openApi3' }),
        CreateOrderRequest: zodToJsonSchema(CreateOrderRequest, { target: 'openApi3' }),
        StoreOrder: zodToJsonSchema(StoreOrder, { target: 'openApi3' }),
        StoreOrders: zodToJsonSchema(StoreOrders, { target: 'openApi3' }),
        WalletSummary: zodToJsonSchema(WalletSummary, { target: 'openApi3' }),
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
