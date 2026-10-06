# 常驻业务worker恢复验收

命令：`pnpm verify:worker`，退出0。证据：[report.json](wb-worker-4b5eea54-10bc-4cc1-9080-8d19e63b7ecf/report.json)、同目录history.json；worker日志保留于本机（*.log被Git忽略）。

- 真实PostgreSQL、Temporal Server和两个先后运行的worker子进程；SDK1.24.0、protobufjs8.8.0，Temporal CLI镜像1.9.1固定digest。
- 工作流启动成功后注入丢失outbox确认，实际重投后仍为原runId。
- 强制停止第一个worker，停机期间写入resume信号，再启动第二个worker；同run继续查询，模拟供应商POST共1次。
- 工作流停在awaiting_media，不发布伪造视频。验证脚本通过fixture失败终结返还预留，再signal使workflow结束。
- 结束后同ID启动不创建新run；其他类型占用ID时不把它误当作本任务受理。
- 39个历史事件由真实SDK回放接受。清理后本次容器0个，真实收费模型调用0次。

另执行`pnpm verify:isolated`：45任务/154测试/0失败/0缓存、14次HTTP smoke、架构扫描216模块535依赖无违规。普通微信/H5构建保留原警告；这不是本轮UI真机验证。

未验证：媒体入库/标识/成片、真实收费供应商、未知受理人工核对、Temporal服务灾备/TLS/生产HA及CI里的runtime proof。本轮没有将API受理开关打开，没有修改旧部署或数据。
