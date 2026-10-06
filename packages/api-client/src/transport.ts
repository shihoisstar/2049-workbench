export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

export interface TransportRequest {
  method: Uppercase<Method>;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface TransportResponse {
  status: number;
  body?: unknown;
}

export type Transport = (request: TransportRequest) => Promise<TransportResponse>;
