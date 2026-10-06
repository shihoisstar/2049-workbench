import type { paths } from './generated/schema';
import type { Method, Transport, TransportRequest } from './transport';
export type { Method, Transport, TransportRequest, TransportResponse } from './transport';
export { createTaroTransport } from './taro-transport';
export type { TaroJsonRequest, TaroRequest } from './taro-transport';
type Operation<P extends keyof paths, M extends Method> = M extends keyof paths[P]
  ? NonNullable<paths[P][M]> : never;
type RequestBody<O> = O extends { requestBody?: infer B } ? NonNullable<B> : never;
type JsonBody<O> = [RequestBody<O>] extends [never] ? never
  : RequestBody<O> extends { content: { 'application/json': infer B } } ? B : never;
type JsonPath<M extends Method> = {
  [P in keyof paths]: [Operation<P, M>] extends [never] ? never
    : Operation<P, M> extends { requestBody?: infer B }
      ? [NonNullable<B>] extends [never] ? P
        : [JsonBody<Operation<P, M>>] extends [never] ? never : P
      : P
}[keyof paths];
type Parameter<O, K extends string> = O extends { parameters: infer P }
  ? K extends keyof P ? NonNullable<P[K]> : never : never;
type ParameterOption<O, K extends 'path' | 'query'> = [Parameter<O, K>] extends [never]
  ? { [Key in K]?: never }
  : Record<never, never> extends Parameter<O, K> ? { [Key in K]?: Parameter<O, K> } : { [Key in K]: Parameter<O, K> };
type BodyOption<O> = [JsonBody<O>] extends [never] ? { body?: never }
  : O extends { requestBody: unknown } ? { body: JsonBody<O> } : { body?: JsonBody<O> };
export type RequestOptions<O> = BodyOption<O> & ParameterOption<O, 'path'> & ParameterOption<O, 'query'> & {
  headers?: Record<string, string>;
};
type ResponseBody<R> = R extends { content: { 'application/json': infer B } } ? B : undefined;
type Success<O> = O extends { responses: infer R } ? {
  [S in keyof R]: `${S & (string | number)}` extends `2${string}` ? ResponseBody<R[S]> : never
}[keyof R] : never;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly body: unknown) {
    super(`API request failed (${status})`);
    this.name = 'ApiError';
  }
}

export function createApiClient(config: { baseUrl: string; transport: Transport }) {
  return {
    async request<M extends Method, P extends JsonPath<M>>(
      method: M,
      path: P,
      ...args: Record<never, never> extends RequestOptions<Operation<P, M>>
        ? [options?: RequestOptions<Operation<P, M>>]
        : [options: RequestOptions<Operation<P, M>>]
    ): Promise<Success<Operation<P, M>>> {
      const options = (args[0] ?? {}) as {
        body?: unknown;
        path?: Record<string, unknown>;
        query?: Record<string, unknown>;
        headers?: Record<string, string>;
      };
      const pathname = String(path).replace(/\{([^}]+)\}/g, (_, key: string) => {
        const value = options.path?.[key];
        if (value === undefined || value === null) throw new Error(`Missing path parameter: ${key}`);
        return encodeURIComponent(String(value));
      });
      const query: string[] = [];
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          query.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
        }
      }
      const headers: Record<string, string> = { accept: 'application/json' };
      for (const [key, value] of Object.entries(options.headers ?? {})) headers[key.toLowerCase()] = value;
      if (headers['content-type'] && headers['content-type'] !== 'application/json') {
        throw new Error('API client supports application/json requests only');
      }
      const request: TransportRequest = {
        method: method.toUpperCase() as Uppercase<Method>,
        url: `${config.baseUrl.replace(/\/$/, '')}${pathname}${query.length ? `?${query.join('&')}` : ''}`,
        headers,
      };
      if (options.body !== undefined) {
        headers['content-type'] = 'application/json';
        request.body = JSON.stringify(options.body);
      }
      const response = await config.transport(request);
      if (response.status < 200 || response.status >= 300) throw new ApiError(response.status, response.body);
      return (response.status === 204 ? undefined : response.body) as Success<Operation<P, M>>;
    },
  };
}
