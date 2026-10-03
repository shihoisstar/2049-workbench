import { API_VERSION, type HealthResponse } from '@wb/contracts';

/**
 * /healthz 处理器(纯函数形态;HTTP 框架接入随 T1.1)。
 * 返回值类型直接取自 @wb/contracts —— 服务端同样零手写契约。
 */
export function healthResponse(uptimeSec: number): HealthResponse {
  return { status: 'ok', apiVersion: API_VERSION, uptimeSec };
}
