# HANDOFF — 会话交接文档(2026-10-05)

> **最新进展：2026-10-06 R2.1**：@wb/server新游客会话/账本核心已落地，apps/api-next提供/v2/auth/guest、/v2/wallet、/v2/auth/deactivate。wb_next独立schema；旧API和旧余额未切换。18项DB测试覆盖50路竞争、注册/记账回滚、注销竞争及旧3项缺陷，新API14项测试。隔离门禁41任务/118测试/14次真实HTTP，失败0。下一步仍是Temporal验证、任务受理与账本联合事务，再推进营销/漫剧与UI。先读ADR-0006与REBUILD-01；旧钱包审计仍专门针对v1，预期报红。Git未提交。

> **2026-10-06 新交接优先项**：负责人已授权双流水线重建，首版明确为微信小程序 + H5、营销视频 + 漫剧核心闭环。请先读 `docs/决策记录-0005-双流水线重建与Agent协作边界.md`、`docs/specs/REBUILD-01-双流水线重建.md` 和 `docs/重建审计-2026-10-06.md`。本次实测复现钱包并发丢更新、并发预留透支、退款后重复结算三项缺陷，因此下文历史“只待线下事项上线”的结论已不适用。业务代码尚未重建；已新增隔离门禁和钱包红灯审计入口。Git 未提交，UI参考图与 figwright 为负责人此前要求保留的未跟踪资料。

> **同日第二阶段**：新增apps/api-next Nest/Fastify基础入口、完整契约快照/OpenAPI漂移检查、packages/api-client生成类型与Taro适配、依赖边界门禁。独立worktree执行`pnpm verify:isolated`：37/37任务、92测试失败0、缓存0、双端构建、6次真实数据库HTTP探测。R1.1的worker、R1.2的发布版兼容检查及业务迁移尚未完成；旧钱包3项缺陷仍在。UI直接使用参考图，Figma非前置，12屏尚未重写。源码与锁文件同步到主工作区，不含.env或部署改动，Git未提交。

> 写给**完全没有上下文的新会话**。读完本文件 + 根 AGENTS.md,你应当能不带错误预设地继续工作。
> 真值顺序(冲突时):当前代码/系统实际行为 > 本文件 > docs/ 需求池与工单板 > 历史材料。

---

## 一、我们在做什么

**产品「2049出片」**:AI 营销短视频生成小程序(微信小程序 + H5 一码双出)。
- 用户动线:游客注册(送 80 积分)→ 模板选款 → 输入创意(AI 文案润色)→ 真实 AI 生成视频(Atlas 聚合/Seedance,1-3 分钟)→ 自动水印+AI 元数据标识 → 积分账本透明 → 保存/下载 → 充值 → 反馈
- 协作模式:**单人 + AI 全栈**(AI 写码,产品负责人逐单验收;用户 = 产品负责人 = 唯一决策人)
- 代码仓库:`D:\2049-workbench`(pnpm + Turborepo monorepo),GitHub `shihoisstar/2049-workbench`(公开,main 分支,CI 强制 gate)
- 参考仓库:`D:\2049-agent-main`(2049-agent,**只读勿动**——gateway/定价矩阵的移植源)

**当前状态一句话**:V0 全部 17 工单 + V1 大部分已完成并通过验收剧本;部署包就绪并在本机 8099 全栈预演实证;**等负责人线下三件事**(服务器/域名备案/小程序认证)即可正式上线。

---

## 二、工作区与运行态(详细)

### 目录布局

```
D:\2049-workbench\                     ← 仓库根(Git Bash 默认工作目录)
├─ apps\
│  ├─ api\        @wb/api      Fastify 5 + Drizzle + @fastify/jwt + BullMQ;开发端口 **3010**(3000 被占)
│  │  ├─ src\routes\        auth/wallet/store/tasks/feedback/templates/polish/images/uploads/health
│  │  ├─ src\schema.ts      Drizzle 表(users/wallets/credit_logs/usage_logs/credit_packages/orders/generation_tasks/feedbacks/templates)
│  │  ├─ drizzle\           版本化迁移 0000-0006(纪律:generate 产出入库审查,migrate 应用;push 仅本地试验)
│  │  ├─ assets\watermark.png  品牌 PNG(GDI+ 生成,ffmpeg overlay 用)
│  │  ├─ .env               本地密钥(DATABASE_URL/REDIS_URL/JWT_SECRET/PORT=3010/ATLAS_API_KEY/ATLAS_MODEL/ATLAS_MODEL_I2V/ATLAS_CHAT_MODEL/MOCK_CHANNEL)
│  │  └─ Dockerfile         生产镜像(node24+ffmpeg;启动即 db:migrate)
│  └─ miniapp\   @wb/miniapp  Taro 4.3 + React 18 + NutUI-React-Taro 3.0.23-cpp
│     ├─ src\pages\         index(模板 feed)/create(视频+绘画双模式)/progress/mine/store/works(我的作品)
│     ├─ src\services\api.ts   请求层(Taro.request 封装/401 自愈/token 单飞/BASE_URL=process.env.TARO_APP_API_BASE)
│     ├─ src\styles\tokens.scss  黑红商业化 design tokens(视觉 v1 基线)
│     ├─ config\index.ts    defineConstants 显式注入 TARO_APP_* + splitChunks({}) 关闭 + 产物 contenthash
│     ├─ dist\weapp|dist\h5  双端产物(project.config.json 已配真实 appid wxb8b207039fa63be9,urlCheck=false)
│     └─ .env.development(.env.production   TARO_APP_API_BASE(dev=http://localhost:3010 / prod=空即同源)
├─ packages\
│  ├─ contracts\  @wb/contracts  **契约唯一事实源**:Zod schema + ErrorCode + pricing.ts(定价矩阵)+ openapi.json 生成
│  ├─ domain\     @wb/domain     纯函数:wallet.ts(账本语义)+ task-machine.ts(状态机,逐边测试锁定)
│  ├─ model-gateway\ @wb/model-gateway  瘦身移植自 2049-agent:router(dispatch/chat/generateImage)+ channel-pool + rate-limiter + adapters(atlas 视频/图像、volcengine-seedance、atlas-stub、mock)
│  └─ shared\     @wb/shared     纯工具
├─ deploy\        部署包:docker-compose.prod.yml + Caddyfile + .env.production.example + ops-credit-packages.sql + h5\(构建产物,gitignore)
├─ docs\          需求池(唯一事实源)/V0V1开发任务清单(工单板)/决策记录 0001-0004/specs/(INF-02/03/04/05/06/09)/对标APP截图 29 张/验收留档/(全部验收截图+成片)
├─ scripts\       check-secrets.mjs(gate 泄密门禁)+ backup-db.sh
├─ infra\docker-compose.yml  开发依赖:postgres(**宿主端口 5433**)+ redis(6379)+ minio(未启用)
├─ HANDOFF.md     本文件
└─ AGENTS.md      根协议(必读)
```

### 当前运行态(截至交接时)

| 项 | 位置/端口 | 说明 |
| --- | --- | --- |
| 生产预演栈 | Docker `workbench-prod-*` 5 容器,**8099** | pg/redis/api/worker/caddy;Caddy 同源(H5 静态 + /v1 反代);**还在跑**,停:`deploy` 下 `docker compose -f docker-compose.prod.yml -f docker-compose.local-override.yml down`(数据在 volume) |
| 开发依赖 | infra-postgres-1(**5433**)/infra-redis-1(6379) | Docker Desktop 重启后**要手动 `docker start`**(不自启) |
| api 开发服务 | 3010 | 命令:`cd apps/api && pnpm start`(.env 已配) |
| worker | 同栈 `pnpm start:worker` | 消费队列;**跑测试前必须停**(或依赖 db1 隔离) |
| H5 静态预览 | 4174 | `pnpm dlx http-server dist/h5 -p 4174 -a 127.0.0.1 -c-1 --silent`(**必须 -c-1**,无哈希产物会被缓存咬) |
| 微信开发者工具 | `D:\微信web开发者工具` | 项目已导入 apps/miniapp;模拟器连 8099 需 urlCheck=false(已配 project.private.config.json) |
| 密钥 | apps/api/.env(ATLAS key 在此)/deploy/.env | **不过聊天记录、不入 git**;.env 已 gitignore |
| FFmpeg | winget 8.1.2,PATH 可用 | 水印/元数据管线依赖 |

### 必跑命令速查

```bash
cd D:/2049-workbench
pnpm gate                        # 全门禁:check-secrets + lint + typecheck + test + contract-diff(全绿才可提交)
pnpm --filter @wb/api db:generate && pnpm --filter @wb/api db:migrate   # schema 变更流程
pnpm --filter @wb/miniapp build:h5 && pnpm --filter @wb/miniapp build:weapp   # 双端构建
pnpm --filter @wb/contracts contract:snapshot && pnpm --filter @wb/contracts openapi  # 契约变更流程(端点/schema 增删后必须)
```

---

## 三、已完成(全部有测试/实证背书,细节看对应提交)

### 提交链(重点,均为 main 已推送、CI 绿)

`ab677e6 仓库初始化 → 67deaec T0.1 骨架+契约+门禁 → 22f23e3 CI node24 → 8ba410c T0.2 Taro 双端 → b8160c4 T0.3 契约层+UI基线 → 8693b0a T1.1 用户体系 → 7715efa T1.2 钱包三账本 → 720934c T1.3 我的/明细页 → c7672f8 T1.4 充值门店 → a485a4c T1.5 充值页(M1 收官) → ed67f59 T2.1 网关 → 9d77997 T2.2 任务系统 → 497a38b T2.4 内容安全 → 73d824c T2.3 创作表单+进度页 → f29c0b1 T2.5 Atlas 真实出片(M2 收官) → 497a38b..84842fb T3.1 水印合规 → 9bc8655 期间 T3.3 运维基线(cd1152c)→ c17bbcf T3.4 反馈 → 41a9be7 T3.5 V1 验收(M3 收官)→ 2573fd0 传图生成 → 8ef5fe1 AI 文案 → b619cf6/e32c46b TTL → acb8e8b 定价矩阵 → 8a12924 成片管理包 → e21865e 产物出库 → 733f733/f29c0b1 部署包`

### 功能清单(全部可用)

- **用户**:游客静默登录(JWT,并发幂等+客户端单飞+401 自愈)、注销软删除、注册赠送 80 积分
- **钱包**:三账本(wallets/credit_logs/usage_logs)、预留-结算(冻结/退差/全额退)、billingKey 幂等、不变式 balance=Σ流水 由测试守护
- **生成**:视频(Atlas Seedance 2.0 Fast/Mini 真实出片实证,480P=Mini 77 积分/720P=Fast 368)、传图生成 i2v、AI 绘画/改图(Seedream v4.7)、AI 文案(DeepSeek polish)、TTL 7 天自动清理
- **任务**:BullMQ 状态机(created→queued→running→…;失败分类重试;卡单 sweep 自动退)、水印+元数据自动管线
- **合规**:词库阻断(冻结前拒+hits 高亮)、自动水印+AI 元数据(ffprobe 实证)、合规弹窗(法规引用)、TTL 提醒×2
- **商业化**:充值档位(¥9.9/49/98 方案 A 拍板)、dev-pay 模拟支付闭环(真实微信支付挂阻塞墙)
- **工程**:CI(泄密门禁 check-secrets+gitleaks、pino 日志、postgres+redis 服务)、契约快照门禁、28 api 测试+5 domain+10 gateway、备份恢复演练(5 表核对)

### 验收状态

- **T3.5 V1 剧本代跑完成**(docs/验收留档/T3.5-V1验收剧本-2026-10-04.md):14 项中 10 项实证通过,3 项如实标注(绑手机=阻塞墙/传图链路与 AI 文案当时待做——**现已补上传图与文案**),1 项部分
- 验收中抓获并修复:游客登录并发竞态 500、showModal editable 缺口

---

## 四、当前卡点(全部需要负责人线下动作,代码侧无阻塞)

| # | 卡点 | 解锁什么 | 负责人动作 |
| --- | --- | --- | --- |
| 1 | 服务器未购买 | H5 正式上线 | 阿里云/腾讯云轻量 2核4G Ubuntu 24.04(¥60-120/月);到位后照 docs/操作手册-部署.md 冷启动(10 分钟) |
| 2 | 域名+ICP 备案 | 合法域名(小程序硬要求)/HTTPS | 注册域名→提交备案(2-4 周)→解析到服务器 |
| 3 | 小程序认证 | 手机号绑定(getPhoneNumber)/真实微信支付/提审 | 微信认证(¥300/年) |
| 4 | 火山引擎开户+KEY | 上线主通道切换(当前 Atlas;切换=改 .env,演练已证零改动) | 火山控制台开通 Seedance 2.0 |
| 5 | AI 绘画正式定价 | 绘画计费(当前 V1 体验期免费,代码已标注) | BIZ 口径(参考:Atlas Seedream 成本可用同法实测) |

---

## 五、下一步计划(建议顺序)

1. **负责人线下并行**:买服务器+域名+备案;小程序认证;火山开户
2. **服务器到位后**:照 docs/操作手册-部署.md 冷启动 → 配置小程序后台合法域名 → 真机预览 → 提审材料准备
3. **上线后一周**:Atlas 账单 vs 定价矩阵对账校准(1080P/720P 实测价回填 contracts/pricing.ts)
4. **V1 收尾**:第二次到期提醒改订阅消息(等认证);AI 绘画计费接入钱包
5. **V2(漫剧工作台)**:剧本→分镜→逐镜头生成,先出 spec 再动工(需求池 §3 有验收剧本)

---

## 六、踩过的坑(绝对不要再踩——每条都真实翻过车)

### 构建/工具链

1. **`node --test dist/` 目录形式是假绿**:不执行内部文件、注入失败探针仍 exit 0(Node 24.15.0 实测)。一律 `cd dist && node --test`(无参)。
2. **Taro H5 生产构建吞渲染错误**:页面组件抛错=无报告白屏。排查第一步**起 dev server(`pnpm dev:h5`)看 React 红屏**。
3. **Taro H5 代码分割会把页面切进异步 chunk,运行时 chunk 映射缺失 → 白屏无报错**。已在 config 关闭(`splitChunks({})`),别移除。
4. **产物文件名无哈希 + 任何缓存层 = 改了代码看到旧页面**(html 有 ?t= 也救不了 js)。已根治:产物 contenthash + Caddy no-cache。**别引回无哈希命名**。
5. **Taro 内建 .env 机制在本工程未生效**(TARO_APP_* 不注入)。已改 config/index.ts 显式读 .env[.mode] + defineConstants。dev 下验证过注入。
6. **Taro 的 webpack 必须精确锁 5.91.0**(`^5.91` 漂到 5.111 会炸 webpackbar schema)。
7. **babel-preset-taro 幻影依赖 @babel/preset-react** → 必须显式声明进 devDeps(保住 pnpm 隔离,**禁用 shamefully-hoist**)。
8. **@tarojs/cli 的 peer eslint@8 会遮蔽根 eslint@9** → miniapp 显式声明 eslint@9。
9. **微信小程序 bundle 里出现 `node:` 导入直接编译炸**——contracts 桶导出曾把 node:fs 拖进去。契约包保持"纯函数在 src、CLI 在 scripts/"分层(openapi CLI 已拆 scripts/write-openapi.cjs)。**新增 node 专用工具函数时严禁从 index.ts 桶导出**。
10. **NutUI 3.0.23-cpp 的 postinstall 执行装机遥测**(@jmfe/npm-usage-stats-tool,"latest" 浮动依赖)→ pnpm-workspace.yaml allowBuilds 已显式 false;**别"顺手修好"它**。组件库出干净版可评估升级。
11. **zod 3.25.0 发布包是坏的**(只有 src 没 dist)→ 锁 `^3.25.76`。"最新 tag 带病"已遇三例(NutUI 遥测/fast 假 json),镜像源装包后多验一眼。
12. **@fastify/multipart 等 peer 变化/新依赖构建脚本**:pnpm 会生成 `allowBuilds` 待填模板,逐项核实再 true(误放行=供应链风险)。
13. **ESLint**:@typescript-eslint 默认不认 `_` 前缀豁免?已配 argsIgnorePattern;scripts/ 目录(CJS CLI)已整体 ignore;`no-unused-vars` 会抓真 bug(多次),别全局放宽。
14. **python 脚本生成/修改含转义的代码文件是雷**:`\n`/`\\n` 会变真实换行劈碎字符串(本会话踩 3 次:wallet 测试、config split、write-openapi)。**改代码用 Read+Edit/Write 工具;python 只用于纯文本 sed 类替换,且改完必 typecheck**。
15. **Git Bash 的 MSYS 路径改写**:`docker -v /etc/xxx` 会被改写到 Git 安装目录(挂载静默失效,容器跑默认配置)。一律 `MSYS_NO_PATHCONV=1` 或 Windows 盘符路径。
16. **curl 中文/UTF-8 body 的 Content-Length 坑** → 用 node fetch 发请求测试。
17. **D:\ 写入后读回校验**(工作区纪律,显示层出过污染事故)。

### 后端/数据

18. **管道退出码**:`cmd | tail` 拿到的是 tail 的退出码,不是 cmd 的。验证类命令**不接管道**(或 `${PIPESTATUS[0]}`/文件落盘)。drizzle-kit 静默失败两次皆因如此。
19. **Drizzle 清库必须连 `drizzle` schema 一起删**:`__drizzle_migrations` 存在那里,只 DROP public 会让 migrate 跳过建表(验收环境搭建时踩过)。
20. **钱包账本语义(曾犯双重扣款)**:hold(-估算)→ settle(+(估算-实际)退差,0=足额标记)→ refund(+估算 全额)。**settle 不可再扣实际额**。不变式 balance=Σcredit_logs.amount 有测试守护,改语义先改测试。
21. **并发登录竞态**:guest find-or-create 必须唯一约束冲突后读回(幂等 200)+ 客户端 ensureSession 单飞行。已修(7fb3b85),别回退。
22. **轮询读中间态**:任务状态与业务字段(videoUrl/errorMessage)必须**原子 UPDATE**(TaskService.apply 的 extra 参数)——曾因两步写导致轮询读到 succeeded 但 videoUrl 为空。
23. **BullMQ v6**:add 的 repeat 选项已移除 → `upsertJobScheduler`;**poll 阶段失败原地续轮询(不重复受理)**;poll 终态失败不计 submit attempts;同秒双签 JWT 字符串相同(幂等断言别用 token notEqual)。
24. **测试与生产/开发 worker 抢队列**(三次假失败):tasks.e2e 固定 **redis db1**(生产 db0)。已根治;若改回 db0 一定复现。
25. **快照门禁/契约门禁"能红"是特性**:改契约没重签 → gate 红 → `contract:snapshot` 重签+说明。别绕过。
26. **fastify 错误 code 数字/字符串不稳定** → 断言一律 `Number(body.code)`。
27. **postgres/redis 容器不自启**(Docker Desktop 重启后)→ `docker start infra-postgres-1 infra-redis-1`。
28. **3000 端口被 2049-agent 容器长期占用** → api 开发/本地一律 3010。

### 定价/模型

29. **定价唯一事实源 = packages/contracts/src/pricing.ts**(方案 A 拍板:1 积分=¥0.01、2× 毛利、480P=77 Mini/720P=368 Fast、注册送 80)。前后端估算/冻结/展示全走它,**别再硬编码**。
30. **Atlas 模型 ID 是全路径**(如 `bytedance/seedance-2.0-fast/text-to-video`),裸名 400 not found;有效清单 `GET /api/v1/models`(239 视频模型/158 图像模型,含 price 折扣字段)。chat/video/image 模型 **config key 分离**(chatModel/model/videoModels/modelI2v/modelImageT2i/modelImageEdit)——曾因 chat 拿了视频模型 ID 而 400。
31. **DeepSeek 推理模型把 max_tokens 吃进 reasoning_content** → content 为空。max_tokens 给足(默认 2000);空响应=502 已有兜底。
32. **chat 失败冷却策略**:仅 429 冷却(其他失败不冷却)——否则会波及同渠道视频任务。
33. **成本锚点**:Fast $0.027/s(Atlas 折后实测);Mini 480P/5s 折后 $0.0567(2049 实测矩阵 docs/product/curated-video-prices.csv)。上线后用 Atlas 账单对账校准。
34. **微信 showModal 无 editable 输入**(H5 类型也没收)→ 需要 input 用内联表单,别用弹窗。

### 前端

35. **Taro 拼写**:tempFilePaths(非 tempFilesPaths);NutUI 导出 `Progress`(非 ProgressBar);进度组件/保存相册 API 按 Taro 文档核对。
36. **H5 静态预览必须 `-c-1`**(http-server 默认缓存 1 小时);4174 是**纯静态无 /v1 反代**——完整联调走 8099 生产栈或起 api。
37. **base.url 校验**:微信模拟器拦 localhost 请求 → project.private.config.json urlCheck=false 已改(**该文件优先级高于 project.config.json**,且不入 git,导入项目后要重查);真机/正式版必须 https+备案+合法域名。
38. ** NutUI 参考**:样式入口 `dist/style.css`(无扩展名路径 webpack 不解析);版本线 `-cpp` 是当前 latest。

---

## 七、冷启动顺序(新会话照此执行)

1. **读根 `AGENTS.md`**(必跑命令+硬纪律)+ 本文件
2. 读 `docs/需求池-AI漫剧工作台.md`(**需求唯一事实源**,32 条,状态流转定义在文首)+ `docs/V0V1开发任务清单.md`(工单板,含阻塞墙)
3. 需要架构背景:决策记录 0001-0004 + docs/specs/(INF 各规格,语义定稿都在 §2.5/§3 之类小节)
4. 环境检查:`docker ps`(infra-postgres 5433 + workbench-prod 栈)→ `pnpm install` → **`pnpm gate`(必须全绿再动代码)**
5. 起服务(按需):api 3010 / worker / 4174 静态预览 / 8099 生产预演栈
6. 改动纪律:非平凡改动先给计划;工单完成当场改工单板+需求池;验证陈述用"命令+数字+未验证部分"格式,禁用"已通过"概括

---

## 八、验收与留档索引

- 验收剧本+结果:docs/验收留档/T3.5-V1验收剧本-2026-10-04.md
- 真实成片:同目录 T3.5-720P-自动水印+元数据-验收成片.mp4(可 ffprobe 验证 AI 元数据)
- 各单截图:T2.2/T2.3/T2.5/T3.2/V1-AI绘画 等 PNG(同目录)
- 定价方法论来源:D:\2049-agent-main\docs\product\billing.md(公式)+ curated-video-prices.csv(Mini 实测矩阵)+ Atlas models API(price 折扣字段,实测脚本 /tmp/probe-fast-price2.cjs 思路)
