import type { Transport, TransportRequest } from './transport';

export interface TaroJsonRequest {
  url: string;
  method: TransportRequest['method'];
  header: Record<string, string>;
  data?: string;
  dataType: 'json';
  responseType: 'text';
}

export type TaroRequest = (options: TaroJsonRequest) => Promise<{ statusCode: number; data: unknown }>;

/** Taro handles platform networking; this adapter never retries or manages authentication. */
export function createTaroTransport(request: TaroRequest): Transport {
  return async (input) => {
    const options: TaroJsonRequest = {
      url: input.url, method: input.method, header: input.headers,
      dataType: 'json', responseType: 'text',
    };
    if (input.body !== undefined) options.data = input.body;
    const response = await request(options);
    let body: unknown = response.data;
    // Some Taro H5 versions return text despite dataType=json. Preserve non-JSON errors.
    if (typeof body === 'string' && response.statusCode !== 204) {
      try { body = JSON.parse(body); } catch { /* Leave the original body available to callers. */ }
    }
    return { status: response.statusCode, body: response.statusCode === 204 ? undefined : body };
  };
}
