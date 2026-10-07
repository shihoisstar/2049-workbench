# @wb/miniapp — Taro 双端前端

- 重建页面按ADR-0005与UI-01采用自有样式，替代下文历史NutUI唯一方案。当前studio是联调入口，只有报价接入新API，其余示例不代表生产功能。TARO_APP_API_NEXT_BASE单独配置，不回退到旧API；H5可用4175的报价专用代理，微信模拟器使用http://127.0.0.1:3011，真机另配可达地址。
- build:studio:weapp生成dist/studio/project.config.json，开发者工具导入dist/studio；保留原project.config.json及普通发布入口。预览大图未经发布优化，不上传该联调包。
- 微信studio包入口是studio-home，营销/分镜为独立页面，使用微信原生导航和返回；不得把H5设计参考板的切屏栏或三列布局放回小程序。MobilePage负责全屏容器与底部安全区，shared.PageHeader在微信端不重复渲染。
- 本机连续入口验收用scripts/verify-miniapp-navigation.ps1：官方cli auto先初始化自动化环境，操作等待控件就绪；仅有automation_element_action返回success不足以验收，必须断言路由、参数和返回后状态。此脚本不属于无桌面CI门禁。

- 一码双出:`dev:weapp` / `build:weapp`(微信小程序)、`dev:h5` / `build:h5`(浏览器)。**没有第二个 H5 工程**(INF-07 验收 = 同一代码库产出双形态)。
- 技术栈护栏(2026-10-04 确认,对齐 ADR-0004):**业务逻辑零 Taro 依赖**——数据/规则放纯 TS 层(services/),`Taro.*` 调用只出现在页面与 services 的封装内;这是"将来换壳,业务可整体迁移"的保障。性能墙预案:个别页面(如模板 feed 长列表)真到瓶颈时,用 Taro 原生页面混合单页优化,不换框架。
- UI 只用 NutUI-React-Taro(ADR-0004):不自研通用组件、不引 CSS-in-JS;design tokens 进契约层共享。组件库可替换是拼装路线的天然优势。
- designWidth=375(NutUI 设计基准),写样式按 375 系 px;design tokens 在 `src/styles/tokens.scss`。
- 本地预览 h5 产物必须带 `-c-1` 起静态服务(如 `pnpm dlx http-server dist/h5 -p 4174 -c-1`):Taro 产物文件名不带哈希,默认 max-age 缓存会让你看到旧页面(2026-10-03 实测踩坑);换端口可强避浏览器缓存。
- 接口形状一律从 @wb/contracts 引用(T0.3 已通);请求层在 `src/services/api.ts`(Taro.request 封装 + token/deviceId 存储)。
- 本地联调:先起 api(`apps/api`:postgres 5433 + `pnpm start`,**端口 3010**——3000 被参考项目容器占用)与 worker(`pnpm start:worker`),再 `build:weapp` 后开发者工具导入(urlCheck 已关);H5 直连 3010(CORS 已开)。
- 微信 appid 已配正式号(wxb8b20703…,project.config.json);上线前需在小程序后台配置 request 合法域名并恢复 urlCheck。

- 2026-10-07：studio营销与成片已真实接通；studio-works从v2本人分页接口读取，首页最近任务也来自后端，不依赖last-job本机缓存。其余演示入口仍需逐项替换。
