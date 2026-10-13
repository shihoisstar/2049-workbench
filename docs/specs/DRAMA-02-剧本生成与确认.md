# DRAMA-02 剧本生成与确认

日期：2026-10-10。状态：开发中，mock后端/HTTP/Temporal已隔离运行验收，真实模型与小程序实际流程/真机仍待办。决策：ADR-0013。

## 2026-10-10 隔离验收进展

最新核对/角色准备增量：ADR-0017/0018已接入，269项隔离测试0失败；微信准备页真实保存/重进/重复保存及8项数据断言。角色准备只是云端文字草稿，未生成图片/分镜。运营核对采用独立凭证及证据/幂等记录，原worker独立处理保存回执。详细边界见`../验收留档/DRAMA-SCRIPT-2026-10-10/REVIEW-AND-PREPARATION.md`。

报价阶段最新结果：ADR-0016报价版本/预留/结算/退款/请求恢复已接入；isolated 53任务/255测试0失败，后续前端8检查0失败，worker9份history/177事件回放、新真实分支同run恢复和1次结算。价格与真实服务仍未配置，供应商均注入。运行边界见`../验收留档/DRAMA-SCRIPT-2026-10-10/BILLING-AND-RECOVERY.md`。

最新源码增量（晚于本节旧运行记录）：ADR-0015实现内部真实Atlas提交保护、已知回执独立持久化、真实分支恢复与小程序结果核对状态。0016迁移仅生成；本轮没有新增或运行测试，没有追加付费调用，公开真实受理仍关闭。静态命令与数字见`../验收留档/DRAMA-SCRIPT-2026-10-10/PROVIDER-SUBMISSION.md`，旧隔离与worker结果不能替代本次运行验收。

负责人要求继续执行上一轮运行验收计划。本轮新增7项服务端数据库用例及2项HTTP用例。首次`pnpm verify:isolated`退出1：server68项中2失败，确认idea草稿触发旧`drama_project_mode_data`约束；失败日志保留为`docs/design/ui-v2/drama-script-isolated.log`。

修正DDL而不修改正确预期：Drizzle生成`0014_productive_ultimo.sql`，idea项目只允许未绑定状态，或confirmed_version_id与active_version_id一致的已确认绑定状态；原想法/题材/语气保留。新增直接SQL绕过确认必须被数据库拒绝的断言。迁移文件写后读回。

重跑`pnpm verify:isolated`退出0：53/53任务、222项真实测试、0失败、0跳过、0缓存；290模块/878依赖/0违规；14次HTTP smoke；该轮隔离容器0。日志为`docs/design/ui-v2/drama-script-isolated-retry.log`。验证在新建独立库执行0013/0014迁移，没有修改现有开发或生产库。Temporal运行证明继续串行执行，结果单独补记。真实模型、真实小程序流程与真机未由此验收替代。

随后`pnpm verify:worker`退出0：script重投/worker重启保持同run、只1草稿、确认成功、钱包不变、closed workflow不再生成、11事件replay；连同原链路8份history/152事件全部replay，付费模型调用0、容器0。证据见`docs/验收留档/DRAMA-SCRIPT-2026-10-10/README.md`及其report引用。上面的“继续执行”与后文“未运行测试”属于各阶段历史记录，以此补记为最新运行状态。

## 本轮实现

本人未绑定剧本的idea project提交UUID请求键；同事务保存不可变输入快照、accepted作业和outbox。用户范围请求键唯一，换项目复用冲突；同项目最多一个accepted作业。

Temporal固定workflowId `drama-script:<jobId>`，outbox至少一次投递、30秒租约、DB时钟、随机token和过期重领。重复启动核对工作流类型；activity重放已成功内容必须一致，不重复产生版本。mock worker输出一集固定小猫样例，输入想法作为旁白原文引用，不声称AI改写。

成功输出独立剧本及不可变版本，source为mock_generated；格式不合法保留needs_repair版本。用户可沿现有修复页新增版本；确认时核对所有者、项目来源和解析成功，确认后绑定版本及confirmedVersionId。已绑定版本不允许由不同版本覆盖。导入项目保留现有固定版本，新增确认入口；原分镜API的历史使用方式未在本轮全面迁移。

免费mock不调用供应商、不预留积分、不写账本；API受理默认关闭。开发主入口只有`NODE_ENV=development`且`DRAMA_SCRIPT_MOCK_ENABLED=1`时启用，worker需mock模式；非mock worker拒绝该模拟作业。生产启动不开放此开关。真实模型、输出集数/长度与计价单独冻结。

## HTTP契约

- `POST /v2/drama/projects/:id/script-jobs`：提交或幂等重放，201；关闭时503。
- `GET /v2/drama/projects/:id/script-jobs`：最新作业或null，用于重新进入后找回。
- `GET /v2/drama/script-jobs/:id`：本人作业与草稿。
- `POST /v2/drama/projects/:id/script-confirmation`：确认版本并返回项目，201。

主体由会话推导，UUID/请求体校验；前端使用生成客户端。网络结果不确定保留原请求键，确定拒绝清理。项目页隐藏时停止轮询、显示时重新读取；解析失败不可确认。底部合并为一个操作栏。

## 迁移与静态证据

`0013_late_silver_sable.sql`由Drizzle生成，读回为2张新表、项目confirmed_version_id及版本source约束扩展；未应用到任何现有数据库。部署或本地联调必须先在指定非生产库迁移，不能只更新worker/API代码。

执行结果：

- `pnpm client:generate`、`pnpm --filter @wb/contracts contract:snapshot`：生成物更新，退出0；新增job/确认契约、source枚举和确认字段为有意变更。
- `build`：contracts、api-client、server、worker、api-next共5个包退出0。
- `typecheck`：contracts、server、worker、api-next、miniapp共5个包退出0。
- `lint`：contracts、server、worker、api-next、miniapp共5个包退出0。
- `node scripts/generate-api-client.mjs --check`：退出0，客户端匹配OpenAPI。
- `node packages/contracts/scripts/check-contract.cjs`：退出0，完整schema快照与OpenAPI匹配。
- `pnpm --filter @wb/miniapp build:studio:weapp`：退出0，新项目页已编译到微信联调产物；保留旧大素材/分包建议警告。
- `pnpm exec depcruise --config .dependency-cruiser.cjs --output-type err apps packages`：289模块 / 873依赖 / 0违规。

本轮没有新增或运行测试，没有运行数据库迁移、Temporal运行验收、完整gate或真机验证；以上为编译/静态证据，不能标记mock闭环或商用剧本生成完成。微信联调构建结果另记录于`docs/design/ui-v2/drama-script-weapp-build.log`。

## 后续验收条件

独立非生产环境：提交/查询/离开恢复；同键重复仅1作业/1版本；并发请求不产生重复accepted；换项目复用键409；跨账户404；worker恢复/outbox重投保持同run；失败保留原输入/版本；解析失败修复后可确认；确认重放相同结果，不同版本不能覆盖；模拟路径钱包无变化。

再评估真实文本模型、输出长度与单次集数、费用与超时处置，接报价/账本/真实供应商。高质量60–120秒样片不是当前固定mock草稿的验收结论。
