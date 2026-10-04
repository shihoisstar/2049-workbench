# INF-09 安全与运维基线 — 规格(骨架→实现中)

> 状态:T3.3 核心落地(2026-10-04)。验收口径:泄密检查进 CI;备份恢复演练一次;告警可达。

## 1. 已落地

- **泄密门禁(双保险)**:
  - 本地:`scripts/check-secrets.mjs` 在 `pnpm gate` 链头——只读、只打文件名/规则/行号(**不打印密钥值**)、退出码区分"泄漏(1)/检查没跑成(2)";规则集 6 条(PEM/AWS/apik/sk/JWT/AppSecret),直读工作区(未暂存文件也在射程)。
  - CI:`gitleaks/gitleaks-action@v2` 扫 git 历史,与本地门禁互补。
  - 能红实证:注入假 `apik-` 密钥 → exit 1 且定位到文件:行;处置话术 = 轮换密钥优先于删文本(AGENTS.md §六)。
- **结构化日志**:Fastify 内建 pino + `genReqId`(UUID,尊重 `x-request-id`);`authorization`/`cookie` 头 redact。
- **告警**:worker 连续失败 ≥3(`ALERT_CONSECUTIVE_FAILURES`)触发 `[ALERT]`;`ALERT_WEBHOOK` 配置后投递(未配置只高声日志,不丢事件)。
- **备份恢复演练(2026-10-04)**:`scripts/backup-db.sh`(pg_dump)→ 恢复到临时库 → **5 表行数逐一核对一致**(users 432 / wallets 387 / credit_logs 1023 / generation_tasks 159 / orders 30)→ 清理。生产策略:托管库自动备份 + 每次结构变更后手动备份。

## 2. 待办

- [ ] 告警可达"两人"(当前单人+AI,webhook 到微信/飞书随渠道定)
- [ ] 生产日志聚合与留存策略(部署工单)
- [ ] 恢复演练周期化(建议每月,进运维手册)

## 3. 工单映射

T3.3 [后] 运维基线(INF-09)——泄密检查进 CI ✓;备份恢复演练一次 ✓;告警钩子 ✓;告警可达两人待渠道。
