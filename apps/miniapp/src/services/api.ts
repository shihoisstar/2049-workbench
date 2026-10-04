import Taro from '@tarojs/taro';

import type { GenerationTask, GuestSession, StoreOrder, StorePackage, Template, WalletSummary } from '@wb/contracts';

/** API 基址:本地开发(3000 被参考项目容器占用,开发用 3010);
 * TODO(部署):正式域名 + weapp 合法域名白名单,并经 Taro defineConstants 注入。 */
export const BASE_URL = 'http://localhost:3010';
const TOKEN_KEY = 'wb_token';
const USER_KEY = 'wb_user_id';
const DEVICE_KEY = 'wb_device_id';

interface ApiErrorShape {
  code: number;
  message: string;
  details?: { hits?: string[] };
}

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
    public details?: { hits?: string[] },
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, data?: unknown, auth = false): Promise<T> {
  const header: Record<string, string> = { 'content-type': 'application/json' };
  const token = Taro.getStorageSync(TOKEN_KEY) as string;
  if (auth && token) header.authorization = `Bearer ${token}`;

  const res = await Taro.request<T | ApiErrorShape>({ url: `${BASE_URL}${path}`, method, data, header });
  const status = res.statusCode ?? (res as unknown as { status?: number }).status ?? 0;
  // H5 端部分 Taro 版本返回字符串 body(dataType 未自动解析),此处统一兜底解析
  let body: unknown = res.data;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* 保留原字符串 */ }
  }
  if (status >= 400) {
    const errBody = (body ?? {}) as ApiErrorShape;
    throw new ApiError(Number(errBody?.code ?? status), errBody?.message ?? `HTTP ${status}`, errBody?.details);
  }
  return body as T;
}

function ensureDeviceId(): string {
  let id = Taro.getStorageSync(DEVICE_KEY) as string;
  if (!id) {
    id = `wb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    Taro.setStorageSync(DEVICE_KEY, id);
  }
  return id;
}

/**
 * 游客会话(登录授权屏的服务端部分):幂等登录,缓存 token/userId。
 * 401 时由调用方清缓存重试(T1.3 简化为手动刷新触发)。
 */
export async function ensureSession(): Promise<GuestSession> {
  const token = Taro.getStorageSync(TOKEN_KEY) as string;
  const userId = Taro.getStorageSync(USER_KEY) as string;
  if (token && userId) return { token, userId, expiresInSec: 0 };

  const session = await call<GuestSession>('POST', '/v1/auth/guest', { deviceId: ensureDeviceId() });
  Taro.setStorageSync(TOKEN_KEY, session.token);
  Taro.setStorageSync(USER_KEY, session.userId);
  return session;
}

/** 钱包概览(我的/积分明细屏数据源)。 */
export async function getWallet(): Promise<WalletSummary> {
  return call<WalletSummary>('GET', '/v1/wallet', undefined, true);
}

/** 注销:服务端软删除 + 清本地会话;同 deviceId 下次登录为新用户。 */
export async function deactivate(): Promise<void> {
  await call<void>('POST', '/v1/auth/deactivate', undefined, true);
  Taro.removeStorageSync(TOKEN_KEY);
  Taro.removeStorageSync(USER_KEY);
}

/** 充值档位列表(T1.5 充值页数据源)。 */
export async function getPackages(): Promise<StorePackage[]> {
  const res = await call<{ packages: StorePackage[] }>('GET', '/v1/store/packages');
  return res.packages;
}

/** 创建充值订单;真实微信支付参数随商户号接入(阻塞墙),当前返回后走开发态支付。 */
export async function createOrder(packageId: string): Promise<StoreOrder> {
  return call<StoreOrder>('POST', '/v1/store/orders', { packageId }, true);
}

/**
 * 开发态支付(DEV-ONLY):模拟支付回调完成入账;生产环境该端点 404。
 * 商户号到位后替换为 wx.requestPayment(真实 prepay)。
 */
export async function devPay(orderId: string): Promise<StoreOrder> {
  return call<StoreOrder>('POST', `/v1/store/orders/${orderId}/dev-pay`, undefined, true);
}

/** 提交用户反馈(OPS-01)。 */
export async function submitFeedback(content: string, contact?: string): Promise<{ id: string }> {
  return call<{ id: string }>('POST', '/v1/feedback', { content, contact }, true);
}

/** 模板 feed(T3.2 首页)。 */
export async function getTemplates(): Promise<Template[]> {
  const res = await call<{ templates?: Template[] } | undefined>('GET', '/v1/templates');
  return res?.templates ?? [];
}

/** 创建生成任务(T2.3):命中违禁词抛 ApiError(5001 + hits 高亮)。 */
export async function createTask(input: {
  prompt: string;
  aspectRatio: string;
  resolution: string;
  durationSec: number;
}): Promise<GenerationTask> {
  return call<GenerationTask>('POST', '/v1/tasks', input, true);
}

/** 任务详情(进度页轮询)。 */
export async function getTask(taskId: string): Promise<GenerationTask> {
  return call<GenerationTask>(`GET`, `/v1/tasks/${taskId}`, undefined, true);
}

/** 取消任务(queued/running;失败/取消自动全额退)。 */
export async function cancelTask(taskId: string): Promise<GenerationTask> {
  return call<GenerationTask>('POST', `/v1/tasks/${taskId}/cancel`, undefined, true);
}
