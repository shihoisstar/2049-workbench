# 本人作品列表与重新打开验收

日期：2026-10-07（Asia/Shanghai）。子项：R3.1 / MKV-06。

## 实现

- 新增GET /v2/generation，按会话主体限定归属，每页20项，created_at/id倒序游标；不接受客户端userId，不返回上游成本、内部资产引用。
- 契约/OpenAPI/生成客户端同步更新。新增端点为兼容性增量，旧生成接口形状未变；本次快照更新原因是新增列表能力。
- 微信studio-works显示真实成功、进行中、失败任务及积分状态，可下拉刷新、加载更多、进入成片；空列表和加载失败提供对应提示。
- 首页最近任务由服务端读取；成片页增加全部作品入口。作品列表使用文字和状态图标，尚未生成真实视频封面。
- 微信截图第一次发现右侧裁切，补border-box和按钮样式优先级后重新构建、截图并读回；最终图为works-list.jpg。

## 验证

- `pnpm verify:isolated`：退出0，53任务、0缓存、162测试、0失败；14次HTTP，240模块/608依赖无违规。新增1项集成测试覆盖22条任务分页、新任务插入、归属隔离、非法游标和内部字段剔除。普通H5构建仍有历史样式/体积警告。
- `pnpm --filter @wb/miniapp typecheck`、`lint`：最后UI调整阶段退出0；最终`build:studio:weapp`与`build:studio:h5`均退出0，联调包仍含未优化大图，不用于上传发布。
- PowerShell 7运行`./scripts/verify-miniapp-works.ps1`：5项实际微信断言，0失败、付费调用0。详见navigation-proof.json。脚本复用10月6日真实成片，需相同验收账户和数据库；Windows PowerShell 5默认编码不适用本UTF-8脚本。
- `node scripts/check-secrets.mjs`：新增页面和脚本纳入意向跟踪后488文件×6规则，0发现；本README随后另复扫。`git diff --check`退出0。

## 运行环境和未验证

微信项目仍为D:\2049-workbench\apps\miniapp\dist\studio。附加本地API http://127.0.0.1:55197装配新列表接口，沿用原验收数据库和私有对象存储；原55392监督进程与worker继续运行。忽略目录.local/video-acceptance/works-api.cjs和works-api.json记录当前本地进程。没有修改旧部署或迁移旧数据。

真机、H5实际页面交互、模拟器空列表/断网恢复未实测；空列表接口已经集成测试。清除last-job缓存验证不等于清除游客凭据后仍可恢复账号；微信绑定尚未完成。“我的”、素材上传和漫剧后端继续开发，本次不宣称全项目完成。未提交或推送本轮改动。
