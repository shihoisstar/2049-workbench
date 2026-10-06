# R1.3 实测结果：2026-10-06

命令：`./experiments/temporal/run.ps1`。最后一轮退出 **0**，SDK proof 用时 **19.032 秒**，独立 `npm ci` 安装 **148 包、23 秒**。

最终证据目录：[wb-temporal-e2687e231d6d](evidence/wb-temporal-e2687e231d6d/report.json)。Temporal SDK **1.24.0**、Server **1.32.0**、CLI **1.9.1**、Node **24.15.0**；两镜像 digest 见该目录 image-digests.txt。

| 验收 | 实测数字与依据 |
| --- | --- |
| 等待用户期间 worker 崩溃恢复 | SIGKILL **1 个原 worker**；无 worker 时 signal 写入服务 history；不同 PID worker 继续 **同一 runId** |
| 镜头并行与单镜重试 | 首轮 **3 个 child 活动时间区间重叠**；a/c 各执行 **1 次**，b 执行 **2 次**；共 **4 个 shot child** |
| 不重试错误 | activity 配置 maximumAttempts=2，但非重试错误实际只调用 **1 次** |
| 超时 | startToClose=1 秒，最多 **2 次**活动调用后 workflow 失败 |
| 历史回放 | **7 份**磁盘 ProtoJSON、合计 **111 个事件**，**7/7**被 SDK replay 接受 |
| 不兼容反例 | 故意立即结束的 workflow 被真实 replay 引擎拒绝 **1 次**，错误 **TMPRL1100 Nondeterminism**；测试捕获预期失败 |
| 清理 | 最终 cleanup.json：容器 **0**、网络 **0**、依赖 volume **0** |

前四次尝试保留了证据，不拿失败尝试冒充成功：前两次分别因默认镜像下载慢、Windows bind mount 安装慢而主动停止；第三次撞到重复 protobufjs 实例造成 Type 错误；第四次撞到普通 JSON 时间戳与 ProtoJSON 不兼容。改为官方 npm 下载、Linux 独立依赖 volume、单一 protobufjs 8.8.0 副本、SDK historyToJSON 后，第五次验证 7 份正例；第六次补充不兼容负例并完成最终验证。

资源代价：新增服务与 runner 两容器；上限分别为 **2 CPU/1 GiB**、**2 CPU/2 GiB**。本机镜像显示大小分别 **218 MB**、**325 MB**，保留为 Docker 镜像缓存。实验未调用付费模型，未接触业务库、旧队列或旧容器。

未验证：生产 HA/PostgreSQL 后端、服务重启和灾备、真实上游幂等/取消、outbox 与钱包事务、媒体产物、长历史 rollover、跨 SDK/服务版本升级兼容、生产权限/加密/负载。本次证明可以支持继续设计业务接入，不等于 Temporal 已替代旧任务链路。
