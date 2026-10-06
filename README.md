# 2049-workbench — AI 漫剧+营销短视频工作台

> 产品名:**2049出片**(2026-10-03 定稿;商标/软著申请发起中)。仓库代号 workbench 与产品名解耦。
> **开发模式(2026-10-03):单人 + AI 全栈**——AI 写码,产品负责人逐单验收;[后]=后端工作流,[前]=前端工作流,[线下]=线下动作。

> **当前工作(2026-10-06)**：双流水线重建中，首版同时包含微信小程序 + H5、营销视频 + 漫剧。新API已有游客会话与账本核心，旧API仍是未切换基线；任务/漫剧/UI尚未重建完成。入口：[ADR-0005](docs/决策记录-0005-双流水线重建与Agent协作边界.md)、[身份账本决策](docs/决策记录-0006-新身份与账本事务边界.md)、[执行规格](docs/specs/REBUILD-01-双流水线重建.md)。

## 隔离验证

- `pnpm verify:isolated`：需要 Docker 和已安装依赖；自动创建本次独占的 PostgreSQL/Redis、迁移、强制执行 gate，并清理自己的容器和匿名卷。默认不读取共享数据库作为测试目标。
- `pnpm gate`现在要求明确且一致的隔离连接变量，缺失时在任何数据库测试前失败；本地优先使用上面的自动入口，不要指向普通开发库。
- `pnpm verify:isolated --wallet-audit`：在同一临时环境额外执行钱包不变量检查；旧实现存在 3 个已复现缺陷，预期退出码 1。不能把普通 gate 的成功当作这些问题已修复。
- `pnpm audit:wallet`：高级手动入口，要求显式 `WB_AUDIT_DATABASE_URL` 指向本机临时审计库，且 API 已构建并迁移；不加载 `.env`，不接受生产库名。

隔离数据库解决测试状态竞争，不代替独立 worktree：禁止两个 Agent 在同一 checkout 同时构建同一 `dist`。

## 重建基础入口

- 新API：显式设置 `API_NEXT_DATABASE_URL`，先执行 `pnpm --filter @wb/server db:migrate`并构建contracts/server/api-next，再运行`pnpm start:api-next`。默认3011，不读取旧.env；已有healthz/readyz和v2游客/钱包/注销，尚无生成业务。
- 契约：有意修改后 `pnpm --filter @wb/contracts contract:snapshot`、`pnpm client:generate`；完整快照/OpenAPI/生成客户端漂移均进入gate。发布版本兼容性检查仍待实施。
- 边界：`pnpm check:architecture` 执行真实反例测试和源码依赖扫描。
- `pnpm verify:isolated` 在gate后执行新API真实PostgreSQL/HTTP smoke，并清理本次服务。
- UI按认可参考图直接开发，Figma可选；[视觉实施规范](docs/specs/UI-01-参考图落地规范.md)。

## 文档索引(docs/)

| 文档 | 用途 |
| --- | --- |
| 需求池-AI漫剧工作台.md | **需求单一事实源**(32 条,带验收标准) |
| V0V1开发任务清单.md | **工单板**(M0-M3,17 张,带验收标准) |
| 决策记录-0001~0004 | 范围/渠道/架构/前端栈(含修订) |
| 功能链路总结-给开发搭档.md | 对标拆解(引用截图 S01-S29) |
| AI短剧工作台-对标APP拆解模板.md | 拆解证据全量 |
| 对标APP截图/ | 证据链(29 张) |
| diagrams/ | 泳道图/时序图/状态机(交互 HTML) |
| specs/ | 需求级规格(INF-02/03 骨架已立,随工单充实) |
| 复用评估-2049agent.md | 网关/计费/Atlas 移植方案 |
| 上线准备清单-资质与备案.md | 资质链总表(A-F 组,19 项) |
| 技术确认会-证据包.md | 技术选型证据 |
| 产品经理导师方法论蒸馏.md | 方法论 |
| 合规文本/(工作区) | 内容安全制度等初稿 |

## 开工顺序(V0V1开发任务清单.md)

1. T0.1 [后] monorepo 骨架 + contracts 首个契约 + CI 门禁
2. T0.2 [前] Taro+NutUI 双端初始化
3. T0.4 [线下] 资质 A-F 组(执照→平台账号→域名备案→AI 类目→商标软著)

## 纪律

1. 需求池是唯一事实源;工单状态变更当场改文件
2. 决策走 ADR;功能讨论引用截图编号(S01-S29)
3. **D:\ 写入后读回校验**(显示层曾出过污染)
4. 新决策 = 新 ADR;不做清单违反 = 新 ADR
