# 2049-agent 可复用资产评估(给两位开发)

> 结论:**三大件直接搬,外围只借思想**。2049 与本项目同为 pnpm monorepo + TS,移植摩擦低。你的原则(复用优先、不造轮子)在这里可以兑现得非常具体。
> 来源:`D:\2049-agent-main`(2026-10-03 盘点)。注意:只借鉴,**不被它的架构束缚**(ADR-0003 仍是我们的事实源)。

## 一、直接复用三大件

### 1. 模型网关 → 我们的 INF-04(几乎整包搬)
`packages/gateway` 是生产级 Provider 路由包,与我们缺的东西一一对应:
- `router/router.ts` + `channel-pool.ts`:按模型配置选 Channel、权重选择、**冷却/故障转移**;失败分"明确失败(5xx/连接错误→换渠道或原地重试)"与"歧义失败(Timeout/Abort→只冷却**不重试**)"——**付费调用防重复扣费语义是现成的**
- `rate-limiter.ts`:RPM/TPM 滑动窗口
- `router/adapters/atlas-video.ts`:**Atlas 视频适配器现成**(异步 submit `POST /api/v1/model/generateVideo` → 轮询 `GET /api/v1/model/prediction/{id}`,4s 间隔;连"duration 参数在 prediction 阶段才报错"的坑都注释了)
- `adapters/openai-compatible.ts`:接其他 OpenAI 兼容模型的路已铺好
- Secret 防泄漏纪律:Adapter 拿已解析 Secret,禁止入 Body/日志/错误

**移植方式**:按 ADR-0003 瘦身复制为 `packages/model-gateway`(剥掉 CosyVoice/voice-clone 等我们用不到的适配器,保留 router/channel-pool/rate-limiter/atlas-video,新增 `volcengine-video.ts` 适配器)。

### 2. 计费设计 → 我们的 INF-02/03(照抄模式,简化范围)
`docs/product/billing.md` + `packages/db/prisma`(CreditLog/Order/CreditPackage/plan-product-seed-policy):
- **预留-结算模式**:`估算上限 → 幂等键冻结 → 调用 → 按实际用量结算 → 写余额+CreditLog+UsageLog+审计`——比"先扣后退"更优雅,天然实现"失败即时退"
- `CreditLog.billingKey` 唯一键防重复扣费;amount 正充值负消耗
- 三账本分离:CreditLog(余额流水)/UsageLog(用量成本)/PaymentLog(支付回调),Order/CreditPackage 各司其职
- 定价源优先级:数据库配置 > pricing.ts 公式 > 官方报价 > 文案;未知模型/缺成本单位**调用前拒绝**
- 折后成本 ×2 换算积分的定价规则(我们用 3-5×,见 ADR-0002)

**移植方式**:借模式与字段,不搬范围——**砍掉** Tenant/团队钱包/六档套餐/席位/兑换卡(V1 只做个人钱包+订阅+积分双轨),保留 CreditLog(加 billingKey)+ 预留-结算 flow + 三账本。

### 3. Atlas 实操经验 → 我们的供应商熟悉度
你们已跑通过 Atlas:`generateVideo`/`prediction` 端点、字段、轮询节奏、坑位清单。**开发期用 Atlas 主通道(熟悉+现成适配器+最便宜),小程序类目提交前接火山(登记材料),上线双通道**——见 ADR-0002 v1.2。

## 二、只借思想、不搬代码

| 2049 的东西 | 处置 |
| --- | --- |
| Tenant/团队计费/席位/六档套餐 | 不搬(V1 个人钱包;团队是 V3 议题) |
| legal 域、xhs-extension、desktop、connectors(tikhub 等) | 与本项目无关,不搬 |
| FastGPT/systemd/sidecars 基础设施 | 不搬(我们用 docker-compose,ADR-0003) |
| HBuilderX 类工具链 | 不适用(Taro 路线,ADR-0004) |
| docs/ 的 ADR/incidents/runbooks 制度 | **借制度**(我们已在做:决策记录/AGENTS.md) |

## 三、移植顺序(进 V0 任务清单)

1. 起新仓库骨架(ADR-0003 结构)+ 根 AGENTS.md
2. `packages/model-gateway` ← 2049 gateway 瘦身移植 + 新增火山适配器(stub)
3. Drizzle schema:User/CreditLog(billingKey)/Order/CreditPackage/GenerationTask(镜序状态机字段)——照 2049 模式
4. 计费服务:预留-结算 flow + 三账本
5. Atlas video 适配器接通(端到端打通免费预览)
6. 火山适配器 + 盖章协议(上线前)

## 四、许可与边界

2049-agent 是我们自己的项目,代码复制无许可障碍。**唯一红线**:不把它的架构约定(如平台 LLM 配置、Tenant 模型)无脑带过来——每个搬进来的文件按 ADR-0003 重新审查归属与命名。
