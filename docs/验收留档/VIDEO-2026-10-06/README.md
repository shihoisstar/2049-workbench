# 营销视频真实闭环验收

2026-10-06，Codex通过微信开发者工具实际操作：首页进入营销创建→480P/9:16/5秒→提交咖啡馆提示词→离开页面→首页继续查看→播放至结束→保存。

## 结果

- 真实模型：Atlas / Seedance 2.0 Mini。唯一真实任务：5903130a-88f4-4724-bbc1-66a4a15c0d2f；供应商任务：0e0c9caddc8f42a48ae93a0e58001df8。
- 真实成片：2049-真实生成-480P.mp4，480×836，5.088秒，469596字节。包含可见AI标识。文件已读回校验SHA256。
- 成功账本：hold -77、settle 0各一笔，余额3。此前模拟媒体失败任务hold -77/refund +77，余额恢复80。
- 微信播放器回调显示播放结束5.1秒。点击保存后，文件位于开发者工具小程序持久文件系统；再次getFileInfo返回大小469596及MD5 4537962de301b7d4bcb993d927637cfc，与后端成片一致。
- 未登录下载端点401，其他账号404；私有对象匿名403，签名读取200、Range206，短期签名失效后拒绝。

## 证据文件

- real-task-proof.json / mock-task-proof.json：数据库、账本、归属及文件哈希核验。
- wechat-playback-proof.json / wechat-saved-file-proof.json：官方工具原始执行结果。
- real-played-saved.jpg：实际小程序播放器、扣费与保存状态截图。
- storage-proof.json：独立合成素材存储测试，非真实模型产物。

## 复验入口与边界

开发者工具项目：D:\2049-workbench\apps\miniapp\dist\studio。当前API为http://127.0.0.1:55392，首页“继续查看”可进入已有真实成片。验收服务和数据卷保留，不需要再付费生成一次。启动脚本scripts/start-video-acceptance.cjs在服务仍运行时只报告已存在；服务停止后的恢复需先核对.local/video-acceptance/state.json及进程、容器归属，不得删卷重置。

手机相册权限/保存未在真机验证；H5真实播放下载未实测；漫剧仍是创建草稿/示例分镜，未宣称全项目完成。生产生成开关、正式域名和发布包尚未切换。当前是开发联调包，不是可提审的最终包。


最终回归：`pnpm verify:isolated`退出0，53任务、161测试、0失败、0缓存，14次HTTP，238模块/601依赖无违规；H5保留8项旧样式/体积警告。`pnpm verify:worker`退出0，39事件回放、同run重启、模拟提交1次（该回归收费调用0次）。`node scripts/check-secrets.mjs`扫描476文件×6规则无发现，最终新增verification.json后另复扫。未验证范围见本文件与verification.json。
