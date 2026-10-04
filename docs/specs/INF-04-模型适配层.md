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

## 4. 联调校准点(T2.5 真实联调 2026-10-04 已验证 ✓)

- [x] **鉴权**:`Authorization: Bearer {key}` 正确;曾 401 系 KEY 过期,换 KEY 后通过。
- [x] **模型 ID 为全路径**:Atlas 的模型形如 `bytedance/seedance-2.0-fast/text-to-video`(裸名 `seedance-2.0-fast` 返回 400 not found);有效模型清单经 `GET /api/v1/models`(type=Video,239 个)查询。
- [x] **真实生成实证**:Seedance 2.0 Fast / 480P / 5s,受理→轮询→completed→outputs[0] 视频URL(火山 TOS),全链路(worker 轮询 2s)约 3 分钟出片;账本三流水(grant/hold/settle)严丝合缝。
- [x] duration 必须数字(2049-agent 真机结论,适配器已强转)。
- [x] 模型清单发现:Atlas 聚合含 Seedance 2.5 / 2.0 / Mini、Kling V3/O3、Vidu Q3、Wan 3.0、MiniMax H3 等——免费层与后续档位选型空间大。
- [ ] Atlas 各模型的计费/分辨率参数细则:按所选模型在 Atlas 控制台核对(随 T1.4 定价)。
- [ ] 火山 Seedance 2.0 官方直连:待 `VOLC_ARK_API_KEY`(上线主通道,提审前切换——演练已证零改动)。

## 5. 工单映射

T2.1 [后] 模型网关移植 —— 依赖 T1.2(钱包估算入账对);下一步 T2.2 任务系统把 dispatch 接进 BullMQ 流水线。
