# Windows / Grok Bot 接手说明（2026-10-13）

## 先判断是否拿到最新代码

仓库：https://github.com/shihoisstar/2049-workbench 。默认分支main，当前开发分支codex/rebuild-core。

本次交接以2a8511b为基线，负责人已于2026-10-13明确授权将369个源码与必要文档文件提交并推送到codex/rebuild-core。本文与配套源码属于同一交接提交；交接版本以远程该分支中包含本文件的最新提交为准，可用git log -1 --oneline和git log -1 -- docs/HANDOFF-2026-10-13-Windows-Grok.md核对。仅有旧基线2a8511b并不包含本轮成果。527个验收媒体/设计参考/临时文件及Git忽略的运行数据单独保留，本文不表示这些数据已迁至新机。

本仓库目前公开。交接前逐项审查提交清单；凭据、会话、付费授权、运行数据和私有媒体独立交接，不能git add全部工作区。此说明不包含任何密钥，也不授予新的付费调用权限。

## 已确认产品范围与优先级

产品为2049出片，同一Taro应用交付微信小程序与H5。

营销剧情带货/探店进入真人独立操作、实际质量、云端真机及受控试用验收阶段。UI暂以现状为基线，优先修真实卡点。ADR-0043已依据负责人最新指令恢复漫剧免费开发，不必等待营销公开上线。

漫剧先完成单集：剧本确认→角色/场景→分镜→画面/逐镜视频→台词音轨/字幕/合成→退出找回与保存，再验证真实多集。现有多集实现保留。默认顺序见需求池和任务板最上方2026-10-13记录；较早“漫剧暂停”的记录为历史安排。

## 必读顺序

1. 根AGENTS.md及将修改模块的AGENTS.md。
2. docs/需求池-AI漫剧工作台.md、docs/V0V1开发任务清单.md，先读最新记录。
3. docs/决策记录-0005-双流水线重建与Agent协作边界.md和docs/specs/REBUILD-01-双流水线重建.md。
4. ADR-0038至0043，尤其付费隔离、营销验收和漫剧恢复开发边界。
5. docs/specs/MARKETING-QUALITY-02-默认流程小额真实验收方案.md。

历史HANDOFF-2026-10-09文件可帮助理解架构，但其“门禁被中断”“不要标完成”等当时状态已经被后续验收更新；不得忽略最新记录。

## 当前代码与实际验收

新服务是apps/api-next、apps/worker、apps/media-worker、packages/server和packages/media；旧apps/api与旧生产栈继续保留，不能误用旧端口或迁移旧数据库。

营销已经覆盖资料/文案编辑、确认、任务受理、字幕修改与恢复、成片查找与保存、重复请求幂等及计费。最近营销微信免费彩排58项检查/48次控件交互；真人参与0。已有两条真实样片获认可，但不能据此声称所有新场景的真实质量稳定。

漫剧最新改动在apps/miniapp/src/pages/studio-drama-project/index.tsx：已确认项目点击继续制作，读取latestStoryboardPlan，仅当current且scriptVersionId匹配confirmedVersionId时恢复原planId，否则进入角色准备。读取失败留在项目页重试。微信专项10检查/6交互、H5六项操作结果及四项接口核对完成；余额、流水不变，新增付费0。

最近完整命令pnpm verify:isolated退出0：53任务、386个Node测试、29缓存断言、16展示断言、5剪贴板断言、14HTTP，0失败/跳过/缓存。studio的H5/weapp构建各退出0。数字仅代表旧电脑验收结果，新机必须重新运行并记录自己的结果。

原始详细证据在本机docs/验收留档/UX-04-2026-10-13及DRAMA-RESUME-2026-10-13等目录；部分证据可能单独私下交接，不能假设公开仓库包含所有媒体、凭据或临时验证脚本。

## Windows新机第一轮

先确保Grok Bot能读取本地目录、编辑文件和运行PowerShell/终端。纯聊天入口只能提供建议，不能据此声称已经执行测试。

准备Git、Node.js（源机已验证24.15.0）、pnpm 11.21.0及Docker Desktop Linux容器。媒体需要FFmpeg/FFprobe可在PATH访问。Taro和其他依赖以pnpm-lock.yaml为准，不顺手升级。

确认远程分支已包含本说明后，在新机执行：

```powershell
git clone --branch codex/rebuild-core https://github.com/shihoisstar/2049-workbench.git D:\2049-workbench
Set-Location D:\2049-workbench
git log -1 --oneline
git status --short
node --version
pnpm --version
docker version
pnpm install --frozen-lockfile
pnpm verify:isolated
```

若D盘不存在，先选定实际工作目录，再核查路径依赖；不能全局字符串替换。新机是全新克隆则不需要git reset/clean。已有目录先检查，避免覆盖其他项目。

verify:isolated创建带所有权标签的临时PostgreSQL/Redis，结束后只清理自己的资源。不要指向旧生产库，不要docker system prune，不要对共享Redis flushdb。Windows写入后读回校验。门禁成功后按当前任务需要构建新API/worker和studio页面，不能用旧dist假装最新源码。

微信开发者工具需在新机重新安装、本人扫码登录。scripts/verify-miniapp-portrait.cjs当前安装目录绑定D:/微信web开发者工具，先检查实际安装路径。联调项目配置由build:studio:weapp生成于apps/miniapp/dist/studio，营销演示包由build:pilot:weapp生成于dist/marketing-pilot；普通dist与这两个入口不能混用。

先运行免费隔离测试。不要直接启动真实试用或执行real-*.cjs；本机旧付费授权、额度或旧会话不能被当作新机的新授权。

## 数据和环境不随Git迁移

原机营销演练API为127.0.0.1:3036；原真实作品API为127.0.0.1:3037，以--live --no-paid-calls运行。localhost地址在另一台电脑指向另一台自己，并不会访问原机。

原机营销有独立PostgreSQL、Temporal和Garage持久卷。源机原库核对过8类业务表及10媒体对象，真实库5视频/3文案；原作品入口显示带货和探店两条作品。这些不是代码文件。迁数据需单独准备一致备份、私下传输、恢复及摘要/账本核对；当前未执行迁移，不得声称真实作品已随clone恢复。

.local/marketing-pilot中的state.json含本机端口、进程号、容器名和数据库/存储凭据，不能复制后原样启动。审批/消费记录需要原样保留用于审计，但不得重置或据此开放新费用。

新机离线字幕还需重新创建Python虚拟环境（scripts/local-speech-requirements.txt），安全转移或重新准备离线Whisper模型并核对摘要，以及准备固定演练样片。Windows虚拟环境与node_modules不复制。启动器默认样片路径在.local/native-commerce-2026-10-11/source.mp4及.local/native-visit-2026-10-11/source.mp4。只有源码时这些文件并不存在。

微信、Cloudflare、GitHub及模型供应商登录须在新机重新建立。不要复制整套浏览器Cookie或Codex登录资料；此前DPAPI会话备份绑定旧Windows用户，不能视为跨电脑凭据备份。

## 仍待完成的外部事项

- 小程序配置AppID为wxb8b207039fa63be9。用户已用第一个gh_账号登录公众平台，但后台AppID和主体名称仍未核对，不能称公司账号已确认。已看到该账号页面显示未认证、未备案。
- yiduoai.com.cn DNS使用Cloudflare；实际管理账号/管理人未知。未购买新服务器、未改DNS、未做公开部署。
- 新机代码接手不阻塞于上述账号，但真机/公开发布有独立前置。
- 模型实际价格与历史估算存在待核对差异，费用保护需校准；新增真实模型调用必须另行获得负责人具体预算授权。

## 下一开发切片

先收口单集制作计划、镜头选择和单镜失败恢复。PlanVideo目前只允许mock报价；PlanExports为静音开发预览。packages/media/src/drama-export.ts已有可选WAV混音能力，apps/media-worker/src/activity.ts的导出活动目前只传镜头字节和字幕。下一步补台词音轨任务、资产、时长与导出快照的衔接，复用已有媒体能力；不要另建第二套账本和工作流。

所有新改动保持小范围，先写假设与验收条件。模拟、H5、开发者工具、真实模型、实体手机的结果分别报告。失败修实现，不删正确断言。完成后即时更新需求池和任务板。Git提交/推送、公开发布、真实支付、旧库迁移仍按负责人授权执行。

## 可直接发给Grok Bot的第一条指令

请接手本目录的2049出片项目。先阅读AGENTS.md和docs/HANDOFF-2026-10-13-Windows-Grok.md，再读需求池、任务板最新记录和相关ADR。先核对当前分支、交接提交、未提交改动、Node/pnpm/Docker/FFmpeg以及目录路径，使用pnpm install --frozen-lockfile与pnpm verify:isolated验证新机环境。请先报告实际执行结果，再继续ADR-0043后的单集漫剧开发。不要启动付费模型，不要重置授权/账本，不要迁移或清理原数据，也不要未经负责人授权提交推送。源码里已有大量功能，请核实实现后补缺口，不从零重写。营销仍需真人/真实质量/真机验收；漫剧先完成单集恢复与音轨导出，再做真实多集。
