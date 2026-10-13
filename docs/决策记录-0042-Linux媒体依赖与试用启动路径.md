# ADR-0042：Linux媒体依赖与试用启动路径

2026-10-13。负责人授权在UI/UX与异常收口后准备Linux私有验收环境；尚无服务器、域名管理权限或公网部署授权。

现有营销启动器把字体和Python解释器固定到Windows。采用一个供启动器使用的路径函数：Windows保留现有安装位置；Linux使用Noto CJK与venv/bin/python，沿用现有worker的四个环境变量作为部署位置。两平台默认值及明确环境覆盖进入gate。未改API、工作流、数据迁移、账本、模型路由或收费规则。

离线识别的三项直接依赖按本机已用版本形成requirements清单；Linux需重建自己的Python/Node原生依赖，不能拷贝Windows运行库。现有模型按source-manifest核验，运行时不联网取模型。代价为维护两种路径与Linux媒体依赖说明，不新增Docker云平台或生产编排系统。

本机Linux容器用只读的旧样片和模型完成5段离线ASR、Noto中文烧字幕及720×1280/10.08秒H.264/AAC文件验证，源文件摘要一致，新增付费0。未装配完整Linux API/Temporal/存储栈，未部署云端，未作生产稳定性结论。配置/备份/访问准备与未验范围见 `docs/specs/DEPLOY-01-Linux私有验收环境准备.md`。
