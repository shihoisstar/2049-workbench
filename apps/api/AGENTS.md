# @wb/api — 后端服务

- 栈:Fastify 模块化单体 + Drizzle(postgres)+ @fastify/jwt(ADR-0003 v1.1,对齐 2049-agent apps/server 结构:扁平 routes/,不做装饰器花活)。
- 接口形状一律从 @wb/contracts 引用(校验用 Zod safeParse,错误 body 用 ErrorCode),不得本地定义重复类型。
- 本地跑:`cp .env.example .env` → `infra/docker-compose up -d postgres`(**宿主端口 5433**,避本机原生 pg)→ `pnpm db:migrate` → `pnpm start`。
- **迁移纪律(大厂对齐)**:改 schema.ts 后 `pnpm db:generate` 产出 `drizzle/*.sql` **提交入库审查**,部署用 `pnpm db:migrate`;`db:push` 仅限本地试验,禁入 CI/生产。
- 钱包:所有余额变动只经 `WalletService`(事务双写,不变式见 domain/wallet);不得绕过直写表。
- 任务(T2.2):状态迁移只经 `TaskService.apply`(内含 @wb/domain 状态机校验);worker 处理器(handleX)与 BullMQ 解耦可单测;**api 进程只入队,消费在 worker 进程**(`pnpm start:worker`);开发/测试用 mock 通道(weight 100,生产不注册)。
- redis:本地/CI 均走 compose 的 6379;周期任务用 `upsertJobScheduler`(BullMQ v6 移除了 add 的 repeat 选项)。
- ⚠️ 跑测试前停掉本地开发 api/worker(3010 端口 + worker-main 进程):它们会和测试 worker **互抢队列任务**,造成超时假失败(2026-10-04 实测踩坑)。
- 测试:node --test + `app.inject`(无 supertest 依赖);集成测试需 postgres 在 5433。
- 新端点流程:contracts 加 schema+注册 openapi → `contract:snapshot`+`openapi` → 实现 → 测试。
