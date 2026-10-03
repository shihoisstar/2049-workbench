# AGENTS.md — 2049-workbench 工作区协议

产品「2049出片」(仓库代号 workbench)。开发模式:单人 + AI 全栈——AI 写码,负责人逐单验收。通用纪律见 README.md;需求以 `docs/需求池-AI漫剧工作台.md` 为唯一事实源。

## 布局与职责

| 路径 | 职责 |
| --- | --- |
| `apps/api` @wb/api | 后端服务(框架随 T1.1 落地) |
| `apps/admin` @wb/admin | 运营后台(后续工单) |
| `apps/miniapp` @wb/miniapp | Taro 双端前端:**一码双出** `dist/weapp`+`dist/h5`(无独立 H5 工程) |
| `packages/contracts` @wb/contracts | **契约唯一事实源**:Zod schema + 统一错误码;双端类型由这里生成,禁止手抄 |
| `packages/domain` @wb/domain | 领域模型与状态机(INF-02/INF-03 落点) |
| `packages/model-gateway` @wb/model-gateway | 模型网关(T2.1 自 2049-agent 瘦身移植) |
| `packages/shared` @wb/shared | 跨端纯工具(无业务决策) |
| `infra/` | 本地开发依赖 docker-compose;生产用托管服务 |
| `docs/` | 需求池 / 工单板 / ADR / specs / 对标证据 |

## 必跑命令

- 全门禁:`pnpm gate`(= lint + typecheck + test + contract-diff;CI 同款,红即不可合入)
- 契约有意变更:`pnpm --filter @wb/contracts contract:snapshot` 重生成快照,与代码同提交并说明原因
- ⚠️ node --test 写法:一律 `cd dist && node --test`(无参)。**禁用 `node --test dist/` 目录参数**——Node v24.15.0 实测目录形式不执行内部文件、注入失败探针仍 exit 0(假绿,2026-10-03 探针验证过)

## 硬纪律

1. 工单完成后**当场**改需求池对应需求状态;工单阻塞立即写进工单板"阻塞墙"。
2. 新决策 = 新 ADR(`docs/决策记录-00NN-*.md`);做"明确不做"清单内的事 = 新 ADR。
3. **D:\ 写入后读回校验**(显示层出过污染事故)。
4. **git 提交需负责人口令**(人工确认后执行)。
5. 提结构性方案前,先证明当前失败路径未被堵死,并给出代价(保真度/维护面/新增故障面)。
6. 验证陈述用"命令 + 数字 + 未验证部分"格式,禁止用"已通过"概括。
