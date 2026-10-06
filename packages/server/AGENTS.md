# @wb/server — 服务端业务边界

- 应用只从包入口导入createServices/Services/DomainError，不能绕过模块读取schema或store。
- modules/*/public.ts只包含业务类型，不暴露SQL/事务句柄。infrastructure/services.ts是跨模块事务的唯一组合处。
- schema.ts是迁移DDL源，仅集成人修改。db:generate后读回SQL；自定义触发器使用Drizzle custom migration；db:migrate显式使用API_NEXT_DATABASE_URL，不读.env。
- 生产源码SQL必须参数化；不要从客户端接收userId后直接当访问主体。HTTP主体来自服务端会话。
- 新入账/预留先锁user再锁wallet；结算/退款只锁wallet，使注销不阻塞已预留资金终结。禁止反转锁顺序。
- 余额+held额度不超过MAX_SAFE_INTEGER；所有金额为安全整数，失败回滚，settle/refund只能有一个终态。
- 流水不可UPDATE/DELETE，修正用追加业务记录。测试不清库，仅使用独立随机用户。
- `pnpm verify:isolated`执行真实DB测试。单独test需要显式WB_NEXT_TEST_DATABASE_URL，缺失应失败，不可skip；执行形式cd dist && node --test。
- 旧API的钱包并未因新模块落地而自动修复，切换与数据迁移另行验收。
