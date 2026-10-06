# @wb/api-client

- src/generated/schema.ts 由 pnpm client:generate 生成，禁止手改；唯一上游是contracts/OpenAPI。
- 核心只依赖ES2022，不使用Node、DOM、Taro运行时或后端源码。平台通过Transport注入。
- JSON客户端不承诺运行时响应校验，也不处理multipart。认证/会话归应用适配层；不得自动重试付费POST。
- 生产类型检查必须含tsconfig.platform.json；非法端点、字段、参数的@ts-expect-error必须真正生效。
- 测试通过cd dist && node --test发现，不使用目录参数；dist不要复制或提交。
