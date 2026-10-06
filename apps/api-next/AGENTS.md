# @wb/api-next

- 这是过渡期独立 Nest/Fastify 入口，默认3011；现有v2游客/钱包/注销核心链路，旧API业务没有迁移完成。
- 仅通过 @wb/contracts 定义公开数据。业务实现进入后续 server 模块，HTTP层不直接写账本。
- 显式 API_NEXT_DATABASE_URL，无.env自动加载，无旧DATABASE_URL回退。测试用注入探针或 verify:isolated。
- 错误不回显异常、URL或数据库连接串；Nest和Fastify早期错误都走统一契约。
- 身份从会话解析，不能信任payload/query里的userId；积分写操作不作为客户端端点公开。业务只经@wb/server入口。
- 构建与测试：pnpm --filter @wb/api-next build / test；测试脚本必须 cd dist && node --test。
- 迁移完所有业务和切换演练后，由单独工单替换旧apps/api，删除api-next过渡命名；现在不改旧部署入口。
