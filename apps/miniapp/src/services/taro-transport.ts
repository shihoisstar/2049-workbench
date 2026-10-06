import Taro from '@tarojs/taro';
import { createApiClient, createTaroTransport } from '@wb/api-client';

/** Platform bridge for generated API operations; callers supply authentication headers. */
export function createMiniappApiClient(baseUrl = process.env.TARO_APP_API_BASE ?? '') {
  return createApiClient({
    baseUrl,
    transport: createTaroTransport((options) => Taro.request<unknown>(options)),
  });
}
