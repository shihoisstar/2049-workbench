# @wb/api-client

JSON API client with generated OpenAPI request/response types. The app injects a transport;
this package does not import Taro, fetch, Node, or browser APIs in production code.

```ts
const api = createApiClient({ baseUrl, transport });
const session = await api.request('post', '/v1/auth/guest', {
  body: { deviceId },
});
const task = await api.request('get', '/v1/tasks/{id}', {
  path: { id: taskId }, headers: { authorization: `Bearer ${session.token}` },
});
```

Transport receives an uppercase method, full URL, lowercase headers, and an optional
JSON string body. It returns the HTTP status and decoded JSON body; it must preserve
non-2xx responses. The client throws `ApiError` with `status` and `body`, never retries,
and returns `undefined` for HTTP 204. Transport failures propagate unchanged.

Types derive from `src/generated/schema.ts`; regenerate from the contracts OpenAPI
document rather than editing generated types. Numeric bounds and response validation
remain runtime server responsibilities; TypeScript is not a network data validator.
Only JSON bodies are supported. Multipart uploads use a separate platform upload adapter.
Query arrays use OpenAPI's default repeated-key form serialization.

`createTaroTransport(options => Taro.request<unknown>(options))` maps the transport to
Taro's `header`, `data`, and `statusCode`. It requests JSON decoding and parses JSON text
returned by some H5 versions. Non-JSON bodies and network rejections remain available
to callers. HTTP 204 maps to undefined. No authentication or retry policy is introduced.

`typecheck` also compiles production code with ES2022-only libraries and no ambient
platform types. `test` builds and runs Node tests from `dist` without a directory argument.
