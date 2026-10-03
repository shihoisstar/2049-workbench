# INF-04 模型适配层 — 规格(骨架→实现中)

> 状态:T2.1 网关移植完成(2026-10-04)。真值链:需求池 INF-04 → 本规格 → 实现;ADR-0002 通道决策。

## 1. 需求与验收(引自需求池)

- 火山引擎官方主通道(已备案模型);Atlas 为可选(免费层);适配层可插拔;**切换演练**。
- 验收:切换火山↔Atlas 演练通过,业务层零改动。

## 2. 落地(@wb/model-gateway,瘦身移植自 2049-agent packages/gateway)

- 结构:`router/`(types / channel-pool / rate-limiter / router)+ `adapters/`(volcengine-seedance / atlas-stub)。
- 借用与出处:channel-pool = OneAPI weighted-random + 冷却窗(借 2049-agent 移植版);rate-limiter = 内存 sliding window(多实例时换 Redis,签名不变);router 主流程 = pick → 限流 → 秘钥 → adapter → 5xx/429 冷却换下一家、4xx 直接抛 → attempts 审计。
- 砍掉(相对参考实现):tenant 隔离、Prisma loader(渠道构造注入)、chat 流式(Phase 2 回补)。
- 视频任务语义:submit 拿 `providerTaskId`;poll 复用受理 channel(`channelId` 钉定,任务恢复安全)。

## 3. 切换演练(验收已测)

业务层唯一调用点 = `router.dispatch(GatewayRequest)`;测试证明:火山主/Atlas 主两套渠道配置下,同一调用点返回形状一致(attempts/channelId/providerTaskId)。failover(5xx→冷却 30s→备用)、限流(429→retryAfter)、凭证缺失冷却均有测试覆盖。

## 4. 联调校准点(未验证,真实调用前必须过一遍)

- [ ] Ark API 路径与字段:`POST /api/v3/contents/generations/tasks` / `GET .../{id}` 按公开文档映射,**未经真实调用验证**(T2.5 前置);校准面收窄在 `volcengine-seedance.ts` 单文件。
- [ ] 模型 ID:`doubao-seedance-2-0-fast` 为占位,以火山控制台实际开通为准。
- [ ] 环境变量:`VOLC_ARK_API_KEY` 注入(refToEnv 映射);密钥纪律:禁入日志/Body(INF-09 检查覆盖)。
- [ ] Atlas 真实接入:当前 stub(503);免费层启用时替换 adapter 即可(业务层零改动)。

## 5. 工单映射

T2.1 [后] 模型网关移植 —— 依赖 T1.2(钱包估算入账对);下一步 T2.2 任务系统把 dispatch 接进 BullMQ 流水线。
