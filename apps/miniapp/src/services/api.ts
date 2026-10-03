import Taro from '@tarojs/taro';

import type { GuestSession, WalletSummary } from '@wb/contracts';

/** API 基址:本地开发(3000 被参考项目容器占用,开发用 3010);
 * TODO(部署):正式域名 + weapp 合法域名白名单,并经 Taro defineConstants 注入。 */
const BASE_URL = 'http://localhost:3010';
const TOKEN_KEY = 'wb_token';
const USER_KEY = 'wb_user_id';
const DEVICE_KEY = 'wb_device_id';

interface ApiErrorShape {
  code: number;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, data?: unknown, auth = false): Promise<T> {
  const header: Record<string, string> = { 'content-type': 'application/json' };
  const token = Taro.getStorageSync(TOKEN_KEY) as string;
  if (auth && token) header.authorization = `Bearer ${token}`;

  const res = await Taro.request<T | ApiErrorShape>({ url: `${BASE_URL}${path}`, method, data, header });
  if (res.statusCode >= 400) {
    const body = res.data as ApiErrorShape;
    throw new ApiError(body?.code ?? res.statusCode, body?.message ?? `HTTP ${res.statusCode}`);
  }
  return res.data as T;
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
