# DEPLOY-01：Linux私有验收环境准备

2026-10-13。准备范围为现有营销服务的Linux媒体依赖与运行说明，尚未购买服务器、配置公网域名或发布。现有启动器仍是本地试用组合，不是生产部署完成声明。

## 已解决的路径差异

`scripts/marketing-pilot-media.cjs`被现有启动器使用：Windows保留微软雅黑及Scripts/python.exe；Linux使用Noto中文字体及bin/python。已有MEDIA_FONT_FILE、NATIVE_ASR_PYTHON、NATIVE_ASR_SCRIPT、NATIVE_ASR_MODEL_DIR环境变量可指定部署位置；不会将Windows绝对路径带入Linux。

## 主机准备与启动

安装项目固定Node.js和pnpm版本，以package.json及锁文件为准。Linux原生依赖须重新安装，不能拷贝Windows node_modules、Temporal原生库或Python虚拟环境。

Debian/Ubuntu环境需要Python3/venv、FFmpeg/FFprobe、Noto CJK字体和系统CA证书。精简容器先准备CA证书，再访问HTTPS软件源；不关闭证书或软件包签名验证。其他发行版依其包管理器等价安装。

```bash
python3 -m venv .local/voice-analysis-env
.local/voice-analysis-env/bin/pip install -r scripts/local-speech-requirements.txt
export MEDIA_FONT_FILE=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc
export NATIVE_ASR_PYTHON="$PWD/.local/voice-analysis-env/bin/python"
export NATIVE_ASR_SCRIPT="$PWD/scripts/local-speech-transcribe.py"
export NATIVE_ASR_MODEL_DIR="$PWD/.local/voice-models/faster-whisper-small"
```

依赖版本来自本机已使用版本：faster-whisper 1.2.1、opencc-python-reimplemented 0.1.7、huggingface-hub 2.2.0。当前清单锁定直接依赖；完整平台依赖锁定仍需在最终部署镜像记录，不能把它当成Windows环境可直接迁移。

将现有离线模型及source-manifest.json安全拷贝到模型目录，逐文件核验manifest摘要。运行时使用local_files_only，不在线拉模型。提前检查字体、解释器、模型文件、FFmpeg/FFprobe均可访问。

在新主机创建独立演练环境并构建API/两个worker后，可使用 `node scripts/start-marketing-pilot.cjs --rehearsal` 验证现有样片。需要两份固定样片的本地路径。原服务器state.json含数据库/存储秘密且绑定原端口，不提交Git，不原样拷贝到另一主机后启动。恢复真实作品使用 `--live --no-paid-calls`，前提是已有授权文件、数据与配置已单独核验，不代表新的费用授权。

## 已实测与未实测

本机Docker的Linux Node 24.15.0/bookworm-slim容器，以只读挂载的现有模型和样片运行离线识别。5段识别、10.08秒，源SHA-256与本机样片一致；Noto中文字幕实际烧录成720×1280的H.264/AAC文件，并检查了截图中文字。路径选择/已有环境覆盖2个测试进入gate。容器未配置后端、模型密钥或付费供应商。临时容器运行完成自动移除，保留本轮证据。

尚未实测完整Linux API/Temporal/对象存储服务栈、云端HTTPS/签名媒体访问、账号恢复、备份恢复或长时间负载。当前Temporal start-dev是持久本地实验，不据此宣称生产运维完成。源码中的旧infra/compose是旧栈，不拿它替代新营销服务组合。

## 云端落地前还需核实

- 小程序主体、后台权限及认证/备案状态。
- 公司域名管理权限；API与私有媒体的HTTPS访问方案，由域名管理员核实。公司官网原解析保留。
- 私有验收身份、限额和服务访问范围；内测guest与测试积分不作为公开收费身份系统。
- 数据库、对象文件、Temporal数据及秘密的成套备份与恢复方案。旧生产库迁移/切换另行确认。

这些信息未齐全时继续本地准备，不先购买服务器或执行公开部署。未采购、未DNS写入、未Git提交。
