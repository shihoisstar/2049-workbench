# @wb/contracts — 契约唯一事实源

- ADR-0035：NativeMarketingQuote明确settlementPoint=preview；GenerationView可携带preview/export，accepted时actualCredits可以非空表示原片已结算、字幕待完成。老5秒无此标记。

- ADR-0034：NativeMarketingQuote/GenerationView允许atlas显式标记，私有nativeBinding仍strip；MarketingProductionRequest/Plan兼容5或10秒。4009用于原生模型参考图尺寸不支持；快照、OpenAPI和生成客户端同步。

- ADR-0033：NativeCaptionReview响应strip私有字段，确认严格限制revision/requestKey/非空有序字幕，原片签名独立本人接口；resume不接受外部地址或成功状态。新增4个路由，快照/OpenAPI/客户端同步生成。

- ADR-0032：旧GenerationSettings/SubmitGeneration保持5秒；独立NativeMarketingInput固定10秒/720P/9:16，报价mode仅disabled/mock且关闭时价格/版本null。GenerationView可读取5/10秒与明确mock标识，不暴露内部native_quote_version。新Schema无局部引用并同步生成客户端。

- ADR-0027：制作计划保留来源镜头与原文，时长范围标estimate_only，canGenerate固定false、estimatedCostCents为null；营销当前durationSec只允许5。新增四个schema序列化使用无引用策略，避免跨schema局部定义引用失效；生成客户端保持同步。

- 内容:Zod schema、统一错误码(段位见 src/errors.ts)、API 版本常量。
- 双端类型由本包生成/引用,**禁止在任何端手抄契约字段**。
- 重建更新：contract-diff现比较完整schema快照与openapi.json；Node CLI位于scripts，不允许进入src或桶导出。快照漂移检查不等于相对已发布版本的语义兼容检查，后者仍待落地。
- `pnpm client:generate`从OpenAPI生成@wb/api-client；`pnpm client:check`检查生成物。修改契约后先重签snapshot，再生成客户端，审查全部diff。
- 破坏性变更流程:改代码 → `pnpm --filter @wb/contracts contract:snapshot` → 快照与代码同提交,PR 说明原因;CI 的 contract-diff 门禁拦截未重签的漂移。
- OpenAPI 文档:改契约后跑 `pnpm --filter @wb/contracts openapi` 重新生成 `openapi.json`(提交物,禁止手改);快照覆盖端点注册表,端点增删即漂移。
- 前端类型客户端:miniapp 经 workspace 依赖直接 import 本包类型(T0.3 已通);请求封装随 T1.3。
