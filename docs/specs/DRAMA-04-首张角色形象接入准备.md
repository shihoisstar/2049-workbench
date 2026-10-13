# DRAMA-04 首张角色形象接入准备

2026-10-10，基于ADR-0019。首张形象候选链路已按 ADR-0020 实施，正在隔离验收；本页保留官方协议依据，不代表真实生图质量已经验收。

## 官方协议核对

- 首张可用型号候选：`google/nano-banana-2/text-to-image`，区别于原ADR-0010的reference-to-image。[官方API](https://www.atlascloud.ai/docs/en/more-models/google/nano-banana-2-text-to-image/generateImage)
- POST `/api/v1/model/generateImage`，必填model/prompt，可设aspect_ratio（如3:4）、resolution（1k/2k/4k）、output_format（png/jpeg）；异步模式enable_sync_mode=false，不需要images。
- 返回任务标识data.id；GET `/api/v1/model/prediction/{id}`读取data.status/outputs/error。文档状态列表有processing/completed/failed和created，示例注释存在succeeded差异，不能不核对就视为已兼容。[Predictions](https://www.atlascloud.ai/docs/en/predictions)
- 型号页公开价标为$0.08/image，账户折扣及参数对应的实际价格未知，未据此设商用积分。官方billing说明提供不生成/不扣费的`POST /api/v1/model/calculate`；本轮也未调用calculate。[型号公开费率](https://www.atlascloud.ai/models/google/nano-banana-2/text-to-image)、[官方计费说明](https://www.atlascloud.ai/docs/billing/model-billing)

## 待实现顺序

1. 为现有image jobs加portrait目标与互斥约束，保留旧candidate路径；冻结项目、确认剧本、准备角色key/描述/画风和图片参数快照。
2. 补齐gateway目前遗漏的aspect_ratio、resolution与output_format，单次submit先持久提交权，取得id后独立poll。未知受理不重新POST。
3. 由真实字节校验类型、尺寸、体积与SHA后入私有存储；成功图是可选候选，不能自动替用户确认。
4. 候选转参考素材必须真实复制字节并保持hash/期限，按ADR-0019同一个入口确认固定角色版本。不得伪造materialId或缺失的对象。
5. 旧任务、未知受理、进程重启、素材到期和本地确认变化都用注入供应商隔离验证，再申请具体的小额真实生图评测。

## 不确定项

当前账户可用性、真实折扣/耗时、动物角色与中文描述质量、实际像素尺寸/格式均未测试。未找到可依赖的上游请求幂等键或按我方key找回超时任务的承诺。本页没有追加付费授权，不采用文档中的价格作为实扣证明。
