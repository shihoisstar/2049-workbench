# @wb/server — 服务端业务边界

- ADR-0037/B2：10秒剧情带货默认人物现场对白，文案要求说话人/对白与动作表情对应；原生promptRevision=2，旧报价不能静默切到新提示。模型质量仍须真实成片验收，提示存在不等于音色或口型合格。

- ADR-0036营销试用：文案接收按持久duration_sec校验口播长度，5秒最多20汉字，10秒最多40汉字；旧调用默认5秒。40字真实持久成功及41字拒绝回归进入381项隔离检查。

- ADR-0035（负责人已确认）：新原生营销在可预览原片私有保存时结算一次；capture内原片记录/原预留settle/actualCredits同事务，job锁先于wallet，accepted可有actualCredits。native_billing_point冻结preview，历史null解释export；发布时仅未结算旧任务才settle，已结算作业禁止误走生成失败退款。0032仅隔离迁移。

- ADR-0034：nativeMarketing真实offer需安全正整数售价/模型配置哈希；native_binding冻结到任务，旧请求先重放。新报价绑定内容/有序素材/商家原资料/售价/模型；真实参考图先检查300–6000像素、比例0.4–2.5、剩余5分钟有效期。0031仅生成，真实分支尚未联调，正式开关未启用。

- ADR-0033：nativeMedia保存不可替换的原视频和识别/确认稿，job锁保护版本、确认、发布；确认仅resume原任务，发布与原预留结算同事务，失败保留原片。旧complete/publish拒绝native10绕过，旧5秒仍限7秒；新10秒只显式mock，真实价格/受理继续关闭。0029/0030仅隔离迁移。

- ADR-0032：nativeMarketing仅显式mock受理，复用generation_jobs/账本/outbox，7测试积分、API成本0。原请求优先恢复，内容/素材/报价变动冲突；报价只读绑定本人、原资料及素材哈希/有效期/顺序。0028区分旧5秒和新10秒模拟记录，旧create拒绝10秒。真实价格与媒体链未开放。

- ADR-0027：production-plan用本人项目与可重复读快照计算，只合并同集同场景相邻段落并完整保留来源，不修改已选素材或分镜。时长估算不是实际配音；标缺集、短集、超时与过期，不静默删字或收费。营销只检查用户已确认口播，不补写商家事实。

- ADR-0026：新plan视频冻结选图哈希、sourceKey、零至多角色版本及原文对白；user→project→plan锁序，新入口明确mock开关/7测试积分，旧请求优先重放。报价只读不取素材写锁，受理/导出再锁定有效素材；新plan不能通过旧create/complete绕过选图与回执，未知提交不自动退款。导出manifest2逐集全镜检查、按scene/shot排序，保留对白与角色数组，标silent_preview；list兼容历史JSON字符串，v2新记录用tx.json对象。无真实TTS、无真实图像/视频付费调用。

- ADR-0025：scriptBatches复用单集job，user→project串行受理，逐集预留、仅ready集可提交，前文/角色/字数预算激活时冻结；成功/失败与后继激活/暂停退款同事务，汇总后另行确认。运营核对先定位并锁project，再取job锁，不反向锁project。marketing-copy拥有文案/回执/核对，账本仅组合层操作；generation采用copyJobId校验本人/分类/成功，并从原资料生成内部sourceFacts，不在公开视图发布。

- ADR-0024：confirmScript要求第1至计划集数全部齐全且无计划外集数，缺失返回4008；未确认导入项目可采用同一剧本修复版本，已确认引用不可更换。营销category可为commerce/store_visit，旧请求缺省保留null及原提示；同key变分类冲突，分类持久化后由marketingVideoPrompt提供供应商上下文。

- ADR-0023：planImages 只接受已核对草稿，冻结0–10个角色版本与场景/画风/画幅快照；同镜进行中任务互斥由user→project→plan锁序保护。候选/引用/hold/job/outbox同事务；报价绑定revision与内容，旧请求先重放。旧工作台/视频/导出仅处理plan_id=null，不能绕过新内容匹配检查。新路径只有显式开发mock、7测试积分，成本null，不可直接打开真实供应商。

- ADR-0021/0022：portrait核对锁job→submission→wallet，证据/审计/resume与处置同事务；简要结果不依赖当前准备。分镜草稿为免费规则整理，固定confirmed selection及原文/行号，user→project锁，sourceKey复用保留编辑、revision冲突不覆盖。空景/多角色只在新草稿中表达，未切换旧candidate/导出。场景外正文带行号拒绝，不静默丢掉。

- ADR-0020：image jobs 的 candidate/portrait 目标互斥；portrait 按 user→project 锁定准备快照和报价，同角色最多一个 accepted。unknown 不泛化退款；发布前需已受理回执。generated material 按 job 隔离、与资产同 TTL、不续期，选择仅写准备草稿，确认仍经 ADR-0019。

- ADR-0019：准备角色可选本人referenceMaterialId，save只检查归属，confirmRoleAppearance再检查有效期并锁user→project→material。选择记录按project/roleKey指向固定roleVersion及指纹，同指纹重放不得改取latest；仅配音不确认图。后续自动制作从当前准备角色的confirmed selection取固定版本，不批量使用旧workflow所有roles/latest。0019选择表不改变旧镜头引用。

- ADR-0017/0018：opsScriptReview锁job后保存回执/退款和处置记录，不在此事务反向锁project；同key同内容重放，不覆盖已处理决定，超时仅用于待核对列表。准备草稿固定confirmedVersion，JSONB+revision同文幂等/异文冲突，证据场次只由原文派生。草稿不创建无参考图的角色资产。0018为项目准备列及核对记录表；审计应用仅追加，不声称数据库不可变。

- ADR-0016：剧本报价绑定本人项目/输入/模型哈希/价格；同键重放先看历史，不被新配置挡住。create同事务job/outbox/hold，user→project→job→wallet；receive完成按project→job→wallet，格式失败保留草稿并退款，unknown不退款。quote/billing_state/request_quote_version由0017新增；reservation成本估计显式null，幂等比较禁止Number(null)。正常发布结算与失败退款只能在组合层事务中执行。

- 2026-10-10 ADR-0015：真实剧本仅内部准备，HTTP仍仅mock。job新增绑定/提交状态/令牌/请求快照/提交时间；同job只一次提交权，不按超时重领。真实回执先以token持久化为received，receive再原子发布版本/终态，旧complete禁止用于真实任务。未知保持accepted，禁止泛化fail。0016仅生成未运行，当前行为未由旧测试记录覆盖。

- 2026-10-10 输出回执：worker经dramaScripts.receive保存规范回执并原子完成/失败，response为私有字段，不能放进公开job响应。相同回执幂等，不同回执冲突；不完整/空/过长输出保留用量但不发布版本。complete保留内部旧调用兼容，新provider路径必须经receive并完成真实受理/计费保护后再开放。0015为回执列迁移。动作说明（含英文括号、多行）不计入对白角色；未闭合说明需修复。历史不可变版本不原地重算。

- 2026-10-10 DRAMA-02：drama-script拥有免费mock作业及outbox；drama拥有剧本版本与项目绑定。创建按user→project加锁，同请求键重放；完成按project→job加锁，输出与job终态同事务，草稿不自动绑定。确认校验本人/项目来源/解析状态，再绑定固定版本和confirmed_version_id。0013/0014迁移需先应用于指定库；idea保留原输入，仅已确认版本可绑定。mock不写钱包，HTTP默认关闭，运行验收与真实供应商分别报告。

- 应用只从包入口导入createServices/Services/DomainError，不能绕过模块读取schema或store。
- modules/*/public.ts只包含业务类型，不暴露SQL/事务句柄。infrastructure/services.ts是跨模块事务的唯一组合处。
- schema.ts是迁移DDL源，仅集成人修改。db:generate后读回SQL；自定义触发器使用Drizzle custom migration；db:migrate显式使用API_NEXT_DATABASE_URL，不读.env。
- 生产源码SQL必须参数化；不要从客户端接收userId后直接当访问主体。HTTP主体来自服务端会话。
- 新入账/预留先锁user再锁wallet；结算/退款只锁wallet，使注销不阻塞已预留资金终结。禁止反转锁顺序。
- generation.create先锁user，再检查同requestKey作业，随后在同事务预留积分、写job和outbox；终结按job→wallet加锁，不要求账户仍活跃。禁止在持有wallet时再锁job或user。
- generation经api-next的v2报价/受理/查询入口调用；实际worker尚未接通，生产组合根默认关闭受理。5秒价格来自contracts；预计成本为售价反推，真实成本未知保存null。outputRef只是内部引用，禁止在HTTP响应中暴露为可下载资产。
- outbox只承载generation.requested；lease用DB时钟、30秒有效、随机token。ack/release必须先锁行再检查token和到期时间，不能在等待锁之前判断lease。工作流调用在事务外，workflowId固定为generation:<jobId>，允许至少一次投递。
- provider_submissions按job唯一，先job行锁再submission行锁；拒绝最后锁wallet，与generation的job→wallet顺序一致。submitting/unknown不自动重领提交权，不能因超时直接退款。拒绝/任务失败/退款同事务，token和上游ID只供服务端使用。见ADR-0007。
- 余额+held额度不超过MAX_SAFE_INTEGER；所有金额为安全整数，失败回滚，settle/refund只能有一个终态。
- 流水不可UPDATE/DELETE，修正用追加业务记录。测试不清库，仅使用独立随机用户。
- `pnpm verify:isolated`执行真实DB测试。单独test需要显式WB_NEXT_TEST_DATABASE_URL，缺失应失败，不可skip；执行形式cd dist && node --test。
- 旧API的钱包并未因新模块落地而自动修复，切换与数据迁移另行验收。

- 2026-10-07：generation.list按本人归属与(created_at,id)倒序分页，每页20项；游标SQL保留数据库时间精度，新任务插入不改变后续页。
