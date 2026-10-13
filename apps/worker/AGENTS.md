# @wb/worker

- ADR-0040：本地免费恢复启动设置MARKETING_PILOT_NO_PAID_CALLS=1，pilot fetch在写消费记录/联网前拒绝POST，原回执GET仍可读取。API关闭新报价/受理，历史审批与消费文件不改。此开关不替代正常真实模式的单独费用授权，不把真实旧任务降级mock。

- ADR-0037/B2：原生绑定promptRevision=2；剧情带货经实际序列化请求检查人物现场对白/禁止旁白/对白后切特写。旧绑定任务继续受不匹配保护，不复用新提示擅自重发；本次试用更新前已确认无未完成任务。

- ADR-0035：已保存原片可以已结算但job仍accepted等待字幕，不能据此重发或退款；媒体优先读取持久来源。正式分支T2V/参考图序列化、并发/重启一次POST、未知保留/明确拒绝退款已有免费注入验证；常驻运行19份315事件回放，未新增真实付费。

- ADR-0034：NATIVE_MARKETING_PROVIDER_MODE独立disabled/atlas；真实native使用独立固定T2V/参考图渠道，任务绑定不匹配时在claim前阻止，原生音频/high明确发送。submit/poll按已保存nativeBinding路由，不能把真实任务降级mock；启用要求私有存储与媒体队列。新增接线只做编译/静态检查，真实分支联调待完成。

- ADR-0033：nativeMarketing标记由持久outbox作业时长派生，新10秒工作流先读取媒体再请求原回执；字幕待核对/合成失败等待resume并保留原任务，已保存来源不再依赖供应商URL。仅mock渠道允许native提交，真实仍在claim前拒绝；旧5秒活动序列不变。

- ADR-0032：10秒nativeMarketing目前只做模拟受理，submitVideo在申请供应商提交权之前拒绝该类作业，防止测试记录流入真实渠道；验证0次供应商调用、0提交记录。工作流代码本轮未更改，后台原生音画/字幕阶段另接。

- ADR-0025：旧dramaScriptWorkflow活动处理ready分集，series提示绑定与旧单集分开；新增marketingCopyWorkflow，复用text-gateway的一次POST及回执持久化保护。MARKETING_COPY_PROVIDER_MODE默认disabled。2026-10-11独占验证19份history/315事件、五集和两类文案重启同run，paid0；字数/内容质量和24轮续接未作为已验结论。

- ADR-0023：新草稿候选仍复用candidateImageWorkflow的mock执行与私有发布，model为mock-plan-image-v1。当前没有该路径的真实生成；不得仅改provider地址就接真实POST。原video/export只读旧镜头，新计划的视频与导出另接。2026-10-11运行验证新增成功17事件与存储故障23事件，12份历史共240事件重放、付费0。

- ADR-0021：角色unknown核对后由既有image.resume唤醒原工作流，只恢复GET与发布，不重新POST。2026-10-11独占运行已覆盖该恢复路径及一次结算，10份history共200事件回放、付费0。分镜草稿不创建worker任务。

- ADR-0020：rolePortraitWorkflow 独立于旧 candidate 工作流；DRAMA_PORTRAIT_PROVIDER_MODE 默认 disabled，付费 POST 一次提交权，poll 独立重试。明确 completed 无输出走失败退款；未知受理保留核对，不能超时退款。PNG 校验与两份私有字节写完后再原子发布/结算。verify-runtime 的 portrait 仅 mock。

- ADR-0016：server导出的scriptProviderBinding/buildScriptRequest为API和worker共同绑定源。真实作业必须带报价/预留后领取提交权。verify-runtime显式DRAMA_SCRIPT_PROVIDER_MODE=disabled，使用注入回执验证真实分支同run重启/一次结算；2026-10-10九份history共177事件replay，付费0。24轮续接边界尚未强制触发。

- 2026-10-10：真实剧本分支由内部job.provider=atlas选择，独立DRAMA_SCRIPT_PROVIDER_MODE默认disabled；WORKER_PROVIDER_MODE管理原视频模式，不能据它单独推断文本开关。真实文本使用单渠道、绑定模型/提示词哈希、提交前持久领取、记录回执后再发布。失败核对与保存原回执可重试，付费POST不可重试；旧mock分支保持原命令。新分支24轮后continueAsNew沿用job提交记录，尚未运行history replay，不能发布。

- main.ts已装配Temporal常驻worker和outbox dispatcher。workflows.ts只写确定性控制流，IO在activities；workflow-types只允许类型导入业务实现。工作流升级必须运行pnpm verify:worker的真实history replay。
- 业务只能经@wb/server公开入口；禁止直接SQL、账本写入或导入apps/api实现。
- 每笔任务先提交数据库的submission记录，再调用固定channel；重放不得再次发送付费POST。submitting/unknown需要核对，不能因租约过期或重启就重新提交。
- providerKey绑定渠道ID、供应商、地址和模型配置的哈希；修改配置后不能把旧任务静默路由到新渠道。
- API受理继续关闭，直到Temporal、资产和标识闭环接通。测试只用注入供应商与隔离数据库，不读取旧.env、不自动调用真实收费模型。
- provider mode必须显式选择；mock不发真实模型请求。Temporal signal/query不向客户端暴露；resume只重新检查后端状态，不接受前端传成功、素材地址或计费金额。
- verify:runtime脚本可查询其独占临时数据库来核验outbox；业务模块仍禁止直接SQL。按随机标签验证所有权后清理本次容器，不触碰旧栈。
