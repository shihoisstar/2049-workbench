import { ErrorCode } from './errors';
import { buildOpenApiDocument } from './openapi';

/** Stable object ordering; arrays retain their declared meaning and order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return item;
  }, 2) + '\n';
}

export function contractSnapshot(document: unknown = buildOpenApiDocument()): string {
  return canonicalJson({ errorCodes: ErrorCode, openapi: document });
}
