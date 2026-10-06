# @wb/worker

- main.ts已装配Temporal常驻worker和outbox dispatcher。workflows.ts只写确定性控制流，IO在activities；workflow-types只允许类型导入业务实现。工作流升级必须运行pnpm verify:worker的真实history replay。
- 业务只能经@wb/server公开入口；禁止直接SQL、账本写入或导入apps/api实现。
- 每笔任务先提交数据库的submission记录，再调用固定channel；重放不得再次发送付费POST。submitting/unknown需要核对，不能因租约过期或重启就重新提交。
- providerKey绑定渠道ID、供应商、地址和模型配置的哈希；修改配置后不能把旧任务静默路由到新渠道。
- API受理继续关闭，直到Temporal、资产和标识闭环接通。测试只用注入供应商与隔离数据库，不读取旧.env、不自动调用真实收费模型。
- provider mode必须显式选择；mock不发真实模型请求。Temporal signal/query不向客户端暴露；resume只重新检查后端状态，不接受前端传成功、素材地址或计费金额。
- verify:runtime脚本可查询其独占临时数据库来核验outbox；业务模块仍禁止直接SQL。按随机标签验证所有权后清理本次容器，不触碰旧栈。
