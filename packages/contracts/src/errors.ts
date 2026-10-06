import { z } from 'zod';

/**
 * 统一错误码 —— 所有端点错误 body 的唯一契约来源。
 * 段位分配:1xxx 通用 | 2xxx 账号鉴权 | 3xxx 计费钱包 | 4xxx 生成任务 | 5xxx 内容安全。
 * 增删或改号错误码 = 契约变更:重跑 contract:snapshot 并与代码同提交。
 */
export const ErrorCode = {
  INTERNAL: 1000,
  VALIDATION: 1001,
  NOT_FOUND: 1002,
  RATE_LIMITED: 1003,

  UNAUTHORIZED: 2001,
  CREDENTIAL_EXPIRED: 2002,
  ACCOUNT_DEACTIVATED: 2003,

  INSUFFICIENT_CREDITS: 3001,
  HOLD_CONFLICT: 3002,
  LEDGER_INCONSISTENT: 3003,
  PAYMENT_STATE_CONFLICT: 3004,

  TASK_NOT_FOUND: 4001,
  TASK_ILLEGAL_TRANSITION: 4002,
  QUEUE_FULL: 4003,
  GENERATION_UNAVAILABLE: 4004,
  QUOTE_CHANGED: 4005,

  CONTENT_BLOCKED: 5001,
  BANNED_WORD_HIT: 5002,
  ASSET_EXPIRED: 6001,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 错误响应 body 契约;message 供排查,前端展示按 code 自行映射文案。 */
export const ErrorBody = z.object({
  code: z.nativeEnum(ErrorCode),
  message: z.string(),
  /** 跨服务链路追踪 ID */
  requestId: z.string().optional(),
  /** 结构化补充(如字段校验错误明细) */
  details: z.unknown().optional(),
});

export type ErrorBody = z.infer<typeof ErrorBody>;
