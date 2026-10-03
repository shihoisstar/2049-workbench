# @wb/model-gateway — 模型网关

- 来源:2049-agent packages/gateway 瘦身移植(router/channel-pool/rate-limiter),T2.1 落地;出处注释保留(OneAPI 谱系)。
- 通道:火山 Seedance 2.0 唯一主通道 + Atlas 备用 stub(决策记录 0002);**业务层只经 `createGatewayRouter().dispatch`**,切换 = 换渠道配置,零代码改动。
- 纪律:秘钥只经 SecretResolver(环境变量),禁入日志/attempts;adapter 内不得打印 secret。
- 联调校准点清单见 `docs/specs/INF-04-模型适配层.md` §4(Ark 路径/模型 ID 未实测)。
- 测试:纯注入(fake fetch/plain channel),无网络依赖;限流器有专项单测(曾抓出"新桶未写回 Map"移植 bug)。
