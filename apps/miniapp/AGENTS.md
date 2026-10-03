# @wb/miniapp — Taro 双端前端

- 一码双出:`dev:weapp` / `build:weapp`(微信小程序)、`dev:h5` / `build:h5`(浏览器)。**没有第二个 H5 工程**(INF-07 验收 = 同一代码库产出双形态)。
- UI 只用 NutUI-React-Taro(ADR-0004):不自研通用组件、不引 CSS-in-JS;design tokens 进契约层共享。
- designWidth=375(NutUI 设计基准),写样式按 375 系 px;design tokens 在 `src/styles/tokens.scss`。
- 本地预览 h5 产物必须带 `-c-1` 起静态服务(如 `pnpm dlx http-server dist/h5 -p 4174 -c-1`):Taro 产物文件名不带哈希,默认 max-age 缓存会让你看到旧页面(2026-10-03 实测踩坑);换端口可强避浏览器缓存。
- 接口形状一律从 @wb/contracts 引用(T0.3 接入类型生成后)。
- 微信 appid 当前为 touristappid(游客态),正式 appid 随 T0.4 资质落地替换。
