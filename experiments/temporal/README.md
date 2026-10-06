# R1.3 Temporal 恢复实验

隔离的技术验证，不接入业务 API、数据库、钱包、付费模型或现有队列。独立 npm 锁文件，不纳入主 pnpm workspace 门禁。

## 运行

在安装 Docker Linux engine 的 Windows PowerShell 中运行：

```powershell
./experiments/temporal/run.ps1
```

使用固定镜像 digest 的 Temporal CLI 1.9.1（内含 Server 1.32.0）和 Node 24.15.0 Debian Linux；Temporal TypeScript SDK 固定 1.24.0。脚本自动创建随机名称、带本轮标签的网络及两个容器，gRPC 仅映射至随机的 `127.0.0.1` 端口。runner 最大 2 CPU/2 GiB，server 最大 2 CPU/1 GiB。依赖和镜像首次下载需要网络，复跑按独立 package-lock 执行 npm ci。

输出在 `evidence/wb-temporal-<runId>/`；依赖安装在本轮独立 Docker volume，避免 Windows bind mount 展开大量小文件。脚本 finally 中删除本轮容器、网络和依赖 volume，`cleanup.json` 记录残留数。不删除其他容器，也不清理共享缓存或镜像。

## 验证路径

1. 启动真正的 Temporal 服务，服务用 SQLite 文件存历史。启动 episodeWorkflow，查询到 waiting-approval 后 SIGKILL worker 进程。
2. 没有 worker 时发送 approve signal，读取实际服务 history 验证 signal 已持久记录。启动不同 PID 的 worker，确认仍是同一 runId。
3. 并行启动 3 个 shot child workflow。shot-b 第一次活动抛非重试异常，使该 child 失败；a/c 完成后父工作流等待 retryShot signal。重试仅创建 b 的第二代 child，保留 a/c 产物。活动时间戳证明首轮执行重叠，实际调用日志证明完成镜头没有再次调用。
4. 两个独立失败探针：明确非重试错误只执行一次；1 秒 start-to-close timeout 最多执行两次、随后工作流失败。schedule-to-close 8 秒与 workflow execution timeout 限制总等待。
5. 用 SDK historyToJSON 导出父工作流、4 个 child、2 个失败工作流共 7 份完整 ProtoJSON。停止 activity worker，从磁盘重新读取文件，调用 SDK runReplayHistory 验证确定性。另用故意不兼容的 workflow fixture 验证回放会拒绝错误改动。

## 明确成本与未覆盖部分

- 此实验是 Temporal 官方开发服务的真实事件历史执行，不能替代生产部署。未验证 PostgreSQL 多副本、HA、服务端升级、备份恢复、TLS、namespace 权限或真实负载。
- 新增独立服务、持久存储、worker 二进制兼容、namespace/task queue 生命周期与监控；生产需承担其部署、数据库 schema 升级及恢复成本。
- history replay 兼容性需要成为 workflow 修改的独立门禁，不能把历史删除或重签当兼容。业务 SDK 升级需要旧 history 回放、patch/version 策略及活动契约兼容。
- SDK 1.24.0 使用 protobufjs 8。首轮实际回放遇到 common/proto 的多副本 Type 身份错误；实验显式固定顶层 protobufjs 8.8.0，使 Temporal 包共用同一副本，gRPC 保留自己的 7.x。锁文件拓扑也是验证的一部分，不能只记录 SDK 版本。
- mock 活动没有付费副作用；本实验不能证明供应商未知受理、outbox 投递、数据库结算或媒体处理已实现 exactly-once。活动仍按至少一次交付，真实付款/生成必须稳定幂等键和业务对账。
- 手工 retryShot 仅演示失败镜头重试，不代表生产权限校验或所有重试策略已设计完成；workflow 不直接使用数据库/网络 IO。
- 超时不是远端取消保证。活动超时后供应商仍可能继续执行，必须另行设计取消、迟到回调与成本归属。

## 官方依据

- [运行开发服务](https://docs.temporal.io/develop/run-a-development-server)
- [TypeScript child workflows](https://docs.temporal.io/develop/typescript/workflows/child-workflows)
- [Worker replay API](https://typescript.temporal.io/api/classes/worker.Worker#runreplayhistory)
- [Event History](https://docs.temporal.io/encyclopedia/event-history)
- [Self-hosted deployment](https://docs.temporal.io/self-hosted-guide)
- [TypeScript SDK 1.24.0 release notes（protobufjs 8 迁移）](https://github.com/temporalio/sdk-typescript/releases/tag/v1.24.0)

实际结果以每轮 report.json、history、activity trace 和 cleanup.json 为准；脚本存在不代表实验已执行。

本次实测数字和未覆盖范围见 [RESULTS.md](RESULTS.md)。
