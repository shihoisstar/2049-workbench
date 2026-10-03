# INF-02 积分钱包 — 规格(骨架)

> 状态:骨架(2026-10-03,随 T1.2 工单充实)。真值链:需求池 INF-02 → 本规格 → 实现;本文与需求池冲突时以需求池为准。

## 1. 需求与验收(引自需求池)

- 充值档位;**账本三分(估算/上报/实扣)**;积分不过期(D3);生成前展示积分估算,账本估算/实扣分离(D11)。
- 验收:每笔生成可查估算与实扣明细。

## 2. 模式权威(引自 复用评估-2049agent.md,借模式不搬范围)

- **预留-结算**:`估算上限 → 幂等键冻结 → 调用 → 按实际用量结算 → 写余额 + CreditLog + UsageLog + 审计`;天然实现"失败即时退"。
- `CreditLog.billingKey` 唯一约束防重复扣费;amount 正充值、负消耗。
- **三账本分离**:CreditLog(余额流水)/ UsageLog(用量成本)/ PaymentLog(支付回调);Order / CreditPackage 各司其职。
- 明确砍掉:Tenant、团队钱包、六档套餐、席位、兑换卡(V1 只做个人钱包 + 订阅 + 积分双轨)。

## 2.5 落地语义定稿(2026-10-03,T1.2 实现)

- 表:`wallets`(余额)+ `credit_logs`(**(billing_key, type) 全局唯一**)+ `usage_logs`(estimated/actual 两列,分)。
- 条目语义(不变式:`balance = SUM(credit_logs.amount)`,测试守护):
  - `grant(+n)` 发放;`hold(-估算)` 冻结即扣;`settle(+(估算-实际))` 结算退差(0=足额标记);`refund(+估算)` 失败全额退。
  - 净消耗 = -(hold+settle) = 实际用量;V0 封顶:实际>估算时抛错不补扣。
- 幂等:同键同类型重放 = no-op(findEntry 先行 + 唯一约束兜底);跨键类型由唯一索引结构性拒绝。
- 迁移纪律:**版本化 SQL**(`db:generate` 产出 `drizzle/*.sql` 入库审查,`db:migrate` 应用);`db:push` 仅限本地试验。

## 3. 数据模型草案(Drizzle,T1.2 定稿)

- User / CreditLog(billingKey 唯一)/ Order / CreditPackage / GenerationTask(与 INF-03 共享)。
- 字段级设计待定:T1.2 开工第一步先读 2049-agent `packages/db/prisma` 与 `docs/product/billing.md` 再定稿。

## 4. 开放问题

- [ ] 免费额度(BIZ-05)与充值积分在账本上如何并存呈现?"积分不过期"承诺下两轨是否共用一个余额视图?
- [ ] 估算偏差的结算规则:按实扣多退少补,还是封顶于估算?(D11 信任承诺的落地细节)
- [ ] 钱包流水查询接口形状何时进 contracts?(与 T0.3 排期对齐)

## 5. 工单映射

T1.2 [后] 积分钱包+三账本+预留-结算 —— 验收:每笔生成可查估算/冻结/实扣/退款全链路。
