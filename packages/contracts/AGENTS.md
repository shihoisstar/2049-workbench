# @wb/contracts — 契约唯一事实源

- 内容:Zod schema、统一错误码(段位见 src/errors.ts)、API 版本常量。
- 双端类型由本包生成/引用,**禁止在任何端手抄契约字段**。
- 破坏性变更流程:改代码 → `pnpm --filter @wb/contracts contract:snapshot` → 快照与代码同提交,PR 说明原因;CI 的 contract-diff 门禁拦截未重签的漂移。
- Zod→OpenAPI/前端客户端生成随 T0.3 工单接入。
