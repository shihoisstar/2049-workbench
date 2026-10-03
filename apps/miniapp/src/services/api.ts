import type { GuestSession, HealthResponse } from '@wb/contracts';

/**
 * 类型化客户端骨架(T0.3):所有请求/响应类型取自 @wb/contracts,前端零手写。
 * 真实请求封装(Taro.request + 鉴权头 + 错误码映射)随 T1.3 落地;
 * 本文件当前不被页面引用,不进运行时包,由 typecheck 保证类型链路成立。
 */

export async function getHealth(): Promise<HealthResponse> {
  throw new Error('TODO(T1.3):接 Taro.request');
}

export async function guestLogin(_deviceId: string): Promise<GuestSession> {
  throw new Error('TODO(T1.3):接 Taro.request');
}
