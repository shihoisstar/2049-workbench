# @wb/model-gateway — 模型网关

- ADR-0031：Seedance 2.0 Fast reference-to-video用reference_images保留图片顺序，拒绝空值及1–9张外的数量，沿用ratio/generate_audio/bitrate_mode；本轮只支持图片参考。不发送该型号不需要的legacy image_url/image_urls。候选图片大小/内容/哈希由调用方绑定。

- ADR-0030：仅Seedance 2.0 Fast T2V使用ratio/generate_audio/bitrate_mode；拒绝传图、自动时长-1或4–15秒外的值。其余型号保持原协议。原生声音不等于配音品质、台词与口型已验收；不得默示开启商用生成。

- ADR-0028：speech.submit必须显式model/voice，无默认音色。仅按Atlas文档接受MiniMax预设及speed/emotion、或Gemini 2.5 Flash预设（风格写在text），模型参数不得串用；文档支持不代表已试听合格。旧试片显式传旧参数保留原指纹；不自动换模型、不重试POST。生产选声/试听还未开放。

- ADR-0027：Atlas speech适配器一次POST、按原ID轮询，不重试提交、不降级；试片使用固定Chinese提示与WAV，不代表已接生产配音任务。图像/视频回执兼容顶层和data封装；Seedance V1 Pro Fast I2V使用image字段。供应商图像可能在请求PNG时返回JPEG，生产素材校验仍保持严格；受控试片仅本地规范化。

- 2026-10-10：文本入口为router.chat；ChatRequest的disableThinking/requireComplete必须透传。requireComplete调用遇到上游错误最多发起一次POST，retryable=false不能继续换渠道。ChatResult/ChatResponseError保留规范化回执与用量；未知用量为null。回执文本截取须保持Unicode字符完整，不能把截断内容当作可保存正文。规范类型来自@wb/contracts；不新增真实模型调用来跑单元测试。

- 来源:2049-agent packages/gateway 瘦身移植(router/channel-pool/rate-limiter),T2.1 落地;出处注释保留(OneAPI 谱系)。
- 通道:火山 Seedance 2.0 唯一主通道 + Atlas 备用 stub(决策记录 0002);**业务层只经 `createGatewayRouter().dispatch`**,切换 = 换渠道配置,零代码改动。
- 纪律:秘钥只经 SecretResolver(环境变量),禁入日志/attempts;adapter 内不得打印 secret。
- 联调校准点清单见 `docs/specs/INF-04-模型适配层.md` §4(Ark 路径/模型 ID 未实测)。
- 测试:纯注入(fake fetch/plain channel),无网络依赖;限流器有专项单测(曾抓出"新桶未写回 Map"移植 bug)。
