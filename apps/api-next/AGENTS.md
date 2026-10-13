# @wb/api-next

- ADR-0034：API_NATIVE_MARKETING_ENABLED=1时必须明确NATIVE_MARKETING_CREDITS；config生成与worker一致的Atlas原生模型绑定，报价/创建复用native服务。未启用保持disabled/空价格；不自动套用旧5秒积分价，不代表媒体ASR服务已就绪。

- ADR-0032：marketing/video/quote及marketing/video要求本人会话和strict十秒输入；nativeMarketingMockAvailable仅测试装配、默认false。关闭时价格/版本null；已受理同键请求仍可重放，不接受客户端价格/模型/userId。真实原生视频受理仍关闭。

- ADR-0027：本人storyboard-plans/:id/production-plan只读；marketing/production-plan鉴权且strict输入，仅估算用户已输入内容的5秒口播。两者不收费、不创建任务、价格未知为null，不能据此开启真实批量生成。

- ADR-0026：新增选定候选的plan-video报价/提交/最近任务，仍仅显式planImageMockAvailable与对象存储同时具备时开放mock；公开视图不含plan_snapshot或私有对象键。导出可同时提交planId/planRevision（缺一拒绝），列表按本人plan返回每集最近任务。video requestKey可用于恢复匹配；不借旧视频available开关开放真实新计划。

- ADR-0025：projects/:id/script-batch-quote、script-batches及latest和script-batches/:id只接受本人项目和报价指纹；真实批次独立API_DRAMA_BATCH_ENABLED与正整数DRAMA_BATCH_EPISODE_CREDITS。marketing/copy报价/任务/查询严格字段，API_MARKETING_COPY_ENABLED与MARKETING_COPY_CREDITS独立默认关闭；copy ops仍须独立运营凭证。mock仅开发装配，不把文本完成称为成片。

- ADR-0023：storyboard-plans/:id/image-quote、images 与 storyboard-images/:id/select 接服务端固定引用。planImageMockAvailable 仅装配参数、默认false，并要求对象存储；不接受客户端价格、角色版本或来源快照。旧 image-job 媒体端点可读取本人新候选，旧候选选择和视频入口不可操作新草稿镜头。

- ADR-0021：/v2/ops/review/portraits沿用独立运营凭证，receipt要核实归属/provider/model/taskId，reject要confirmedNotAccepted；普通会话不可处置，不接收userId/token。ADR-0022：storyboard-plan免费组织/本人读取与单镜编辑，strict字段防止伪造来源、角色版本和hash；真实画面生成尚未接入。

- ADR-0020：portrait quote/create/list/get/select 只接受角色 key/准备 revision/报价版本/请求键，归属来自会话。实际价格与模型不可由客户端指定；API_DRAMA_PORTRAIT_ENABLED 默认关闭。旧 image get/media 对 portrait ID 返回404；候选通过本人 materials/access 预览。

- ADR-0019：GET materials/:id/access校验本人有效素材后才签发，最多600秒且不超TTL；POST projects/:id/role-appearance仅收准备revision/剧本版本/角色key，服务端读取参考图和描述，不接受客户端指定角色版本或hash。

- ADR-0017/0018：`/v2/ops/review/drama-scripts`必须独立运营口令，操作需requestKey/原因/证据，拒绝需确证未受理声明；不接受客户端指定userId/提交令牌，回执须匹配模型。`/v2/drama/projects/:id/preparation`按会话归属和确认版本读取/保存草稿，strict输入禁止伪造证据/场次，冲突409不覆盖。

- ADR-0016：script-quote为本人项目第1集报价；真实POST必须带报价版本，客户端不可传价格/绑定。API_DRAMA_SCRIPT_ENABLED默认关闭，显式开启须配置正整数DRAMA_SCRIPT_CREDITS和文本模型；现阶段没有配置商用价格/开放生成。受理开关在新任务检查，历史同键重放不受开关变化影响。

- 这是过渡期独立 Nest/Fastify 入口，默认3011；现有v2游客/钱包/注销、生成、素材、漫剧与运营处置链路，旧API业务没有迁移完成。
- 仅通过 @wb/contracts 定义公开数据。业务实现进入后续 server 模块，HTTP层不直接写账本。
- 显式 API_NEXT_DATABASE_URL，无.env自动加载，无旧DATABASE_URL回退。测试用注入探针或 verify:isolated。
- 错误不回显异常、URL或数据库连接串；Nest和Fastify早期错误都走统一契约。
- 身份从会话解析，不能信任payload/query里的userId；积分写操作不作为客户端端点公开。业务只经@wb/server入口。
- v2/generation提供报价、幂等受理和本人查询；v2/wallet/entries为本人流水游标分页；v2/materials为图片入库（类型/尺寸校验、SHA-256、7天TTL）；v2/drama为项目/剧本/角色/场景/分镜候选与候选图像作业；v2/ops为未知受理人工处置（须显式配置API_OPS_TOKEN）。
- 执行链已接通并本地实证（视频与候选图像，mock 供应商），但生产main仍不打开generationAvailable（默认关闭受理）；本地验收栈与隔离集成测试显式启用。不能仅因存在供应商密钥就打开受理。报价不预留积分，响应剔除内部资产引用与上游成本。
- 构建与测试：pnpm --filter @wb/api-next build / test；测试脚本必须 cd dist && node --test。
- 迁移完所有业务和切换演练后，由单独工单替换旧apps/api，删除api-next过渡命名；现在不改旧部署入口。

- 2026-10-07：GET /v2/generation为本人任务分页，cursor只能引用本人任务；模型/媒体链已在本地验收装配接通，生产main仍关闭生成。
- 2026-10-08：v2/materials、v2/drama、v2/ops 控制器落地；main 装配对象存储并在启动时 probe。分镜页候选图像受理/发布/重做与失败退款兜底见 docs/验收留档/STORYBOARD-2026-10-08/；生产受理开关仍关闭。
