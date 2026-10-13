# ADR-0028：Atlas内中文选声与小额试听

2026-10-11。负责人要求继续推进选声与试听，强调积极、自然的普通话女声；团队仅有Atlas账户，先在现有渠道寻找可用声音。需要确认的事项须单独简短提出，新增付费仍先授权。

已证实失败路径：旧适配器把English_expressive_narrator写死，仅加Chinese语言提示；负责人试听反馈有外国口音、不够活泼。Atlas MiniMax页面及API文档均只公布15个英文预设，不能把MiniMax官方中文ID直接当作该转售入口支持。仅这一结果不能判断Atlas全部语音模型品质。

免费核对发现Atlas提供google/gemini-2.5-flash-tts，文档支持30种预设、在text中用自然语言指定风格。保留Atlas账户，不新增供应商账户；先以Aoede、Leda及相同普通话正文做最多2次纯语音试听。文档候选不等于中文音质、性别听感和商用品质验收。公开价$0.04/千字符，申请人民币1元上限、程序保守总限额$0.10（每次预留$0.05）。此新范围未获付费授权前不得执行，不复用已耗尽的12次媒体授权。

实现最小增量：现有speech.submit要求显式model/voice，MiniMax显式speed及可选emotion，Gemini仅发送其文档参数；沿用一次POST与原ID轮询，不自动换模型或重发。历史试片调用改为显式传原参数，内容指纹不变。受控试听脚本锁定2款声音和同一文案、提交前记录、次数/保守金额限额、unknown停止，公开文件去除私有回执。

代价为一个模型参数分支及小额试听脚本；不新增业务表、调度框架、收费API或不可试听的假选择项。先确认声音，再将已验收的少量候选接入小程序。换配音复用画面，音频时长和字幕重新核对；本阶段不重生成图片或视频。

来源：[Atlas Gemini接口](https://www.atlascloud.ai/docs/more-models/google/gemini-2.5-flash-tts/generateAudio)、[模型与公开价格](https://www.atlascloud.ai/models/google/gemini-2.5-flash-tts)、[Atlas音频模型](https://www.atlascloud.ai/generator/audio)。xAI TTS也是Atlas内中文候选，但本轮先少量评测Gemini，不一次扩展多套适配器。

免费准备验证：`pnpm verify:isolated`退出0，53任务、358测试、失败/skip/缓存0，363模块/1287依赖0违规，14HTTP；运行号wb-verify-6030091c-0c14-4908-9e26-9ca0833705ca。预算保护8项离线检查失败0/网络0，无授权标记execute探针退出1且调用0；脚本语法检查退出0，旧媒体计划指纹不变。真实Gemini受理、普通话听感及用户选声UI尚未验证；没有提交或部署。详见VOICE-2026-10-11/preparation-report.json。

负责人后续明确批准两次合计不超过1元。`node scripts/real-voice-audition.cjs --execute --authorized-voice-cny=1`退出0，实际POST2、重复0、两任务completed；Aoede 12891ms、Leda 11931ms，两文件哈希读回一致。原ID免费GET返回price各0.00484，合计$0.00968，账户实扣仍null。授权额度已用完；中文口音、活泼程度、正文完整与指令未被读出须负责人实际试听，不能由时长/HTTP成功推定。公开试听文件及报告在VOICE-2026-10-11，私有ID保留.local。

负责人听感反馈：Aoede、Leda均无口音，但活泼度和真人感未达标，均未选用。两次调用成功不能作为声音验收成功。后续先用单一场景的连贯口语文案（避免把漫剧/带货/探店四句拼成试听），参考具体重音、节奏和自然停顿；必要时比较Atlas内Gemini 3.1 Flash TTS与现有2.5，使用相同声线和同一文案以区分模型差异。已只读核对3.1接口存在、支持预设与text风格指令，尚未实现/调用，不能宣称一定更自然。已向负责人单独征求可选的满意配音参考。新试听计划尚未冻结、未获付费授权，不覆盖旧计划和回执。
