/** @wb/shared —— 跨端/跨包纯工具类型与函数。边界:不放业务决策,业务概念进 domain。 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
