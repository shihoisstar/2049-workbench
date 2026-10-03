# @wb/api — 后端服务

- 栈:Fastify 模块化单体 + Drizzle(postgres)+ @fastify/jwt(ADR-0003 v1.1,对齐 2049-agent apps/server 结构:扁平 routes/,不做装饰器花活)。
- 接口形状一律从 @wb/contracts 引用(校验用 Zod safeParse,错误 body 用 ErrorCode),不得本地定义重复类型。
- 本地跑:`cp .env.example .env` → `infra/docker-compose up -d postgres`(**宿主端口 5433**,避本机原生 pg)→ `pnpm db:push` → `pnpm start`。
- 测试:node --test + `app.inject`(无 supertest 依赖);集成测试需 postgres 在 5433。
- 新端点流程:contracts 加 schema+注册 openapi → `contract:snapshot`+`openapi` → 实现 → 测试。
