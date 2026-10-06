# @wb/contracts — 契约唯一事实源

- 内容:Zod schema、统一错误码(段位见 src/errors.ts)、API 版本常量。
- 双端类型由本包生成/引用,**禁止在任何端手抄契约字段**。
- 重建更新：contract-diff现比较完整schema快照与openapi.json；Node CLI位于scripts，不允许进入src或桶导出。快照漂移检查不等于相对已发布版本的语义兼容检查，后者仍待落地。
- `pnpm client:generate`从OpenAPI生成@wb/api-client；`pnpm client:check`检查生成物。修改契约后先重签snapshot，再生成客户端，审查全部diff。
- 破坏性变更流程:改代码 → `pnpm --filter @wb/contracts contract:snapshot` → 快照与代码同提交,PR 说明原因;CI 的 contract-diff 门禁拦截未重签的漂移。
- OpenAPI 文档:改契约后跑 `pnpm --filter @wb/contracts openapi` 重新生成 `openapi.json`(提交物,禁止手改);快照覆盖端点注册表,端点增删即漂移。
- 前端类型客户端:miniapp 经 workspace 依赖直接 import 本包类型(T0.3 已通);请求封装随 T1.3。
