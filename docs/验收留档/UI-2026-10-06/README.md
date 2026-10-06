# 首批三屏实际页面验收

## 最新：连续入口验收完成

执行 `& ./scripts/verify-miniapp-navigation.ps1`，退出0，8项交互断言满足；[navigation-runtime.json](navigation-runtime.json)已读回。脚本要求微信开发者工具已安装并在PATH中提供wechatide、已登录、服务端口及Codex自动化授权已开启。

1. 官方cli auto初始化运行环境，重新进入首页；等待控件就绪后操作。
2. 点击AI漫剧→已有剧本，确认实际路由mode=script和maxlength=20000。
3. 原生返回只保留首页，弹层不残留；重新打开后点击关闭，确认弹层消失。
4. 点击AI漫剧→输入想法，确认实际路由mode=idea和maxlength=1000；返回仍只有首页。

首次脚本仍遇连接重发现/控件超时，加入当前页面确认与工具支持的交互前等待后，完整执行成功。此结果替代下文“入口链路未稳定”的当前阻塞状态；历史记录保留。未修改业务代码、未更换AppID、未改权限；未验证手机真机、真实生成或所有异常网络状态，本轮未重跑工程全门禁。

## 后续：29图交互依据与漫剧双模式

- 完整逐屏记录见UX-02。新建漫剧先选模式；已有项目才进入分镜。新增studio-drama-create（微信联调包第四页），不代表后端项目生成完成。
- 模拟器：想法模式输入16字并保存；切到已有剧本后maxlength=20000、无故事类型/剧本风格；输入24字剧本，41集保存被拒，改1集可保存；切回想法仍为原16字；重建剧本页面后点击恢复，回读24字原文。未调用模型、未扣费。
- `weapp-drama-idea.jpg`与`weapp-drama-script.jpg`来自模拟器并已读回查看。模式弹层改为小程序View/Button可交互卡片，使用当前品牌样式。
- `weapp-drama-mode-sheet.jpg`已截图读回，确认两个入口和关闭按钮可见；连续点击入口→选项→路由的自动化未稳定完成（getCurrentPagesByDomain、选择器超时），与已实证的直接进入表单/草稿操作区分。重开本次联调项目后仍有超时，已记阻塞墙。最终代码补充稳定元素ID和事件停止冒泡，但不把这当作已定位根因或完成该项验收。
- `pnpm verify:isolated`：41任务/137测试/0失败；这137项不包含自动化表单单元测试，表单由上述模拟器步骤验证。弹层最后调整另执行miniapp typecheck/lint与独立双端构建。未验证手机真机、云同步、模型生成、清空确认的真机行为、所有字数边界输入。

## 后续：小程序独立页面

- 用户强调微信小程序优先后，参考本地对标02/03/17/18改进移动交互。微信联调包注册3页：studio-home、studio-marketing、studio-storyboard；H5参考板仍单独保留用于对照。
- 模拟器实际点击首页营销入口后，pageStack为home→marketing；navigateBack后仅home；再次点击漫剧入口，读到独立分镜页内容。微信导航栏承担标题和返回，组件不再重复显示标题。
- 首页导航和创作操作固定底部，分镜实读position=fixed；表单滚动时保留操作区，内容预留底部空间。未新增原生tabBar，作品/我的仍是待实现入口。
- `weapp-native-home.jpg`、`weapp-native-marketing.jpg`、`weapp-native-storyboard.jpg`已逐张读回查看。截图过程中一次TLS断连被工具标为APPID_ERROR，一次重试成功，未更换AppID或权限。
- `pnpm verify:isolated`：41任务、137测试、0失败、0缓存；`pnpm --filter @wb/miniapp typecheck`与`lint`退出0；`build:studio:weapp`退出0。普通发布入口未切换，真实生成和微信手机真机仍未完成。

## 后续：真实报价与微信模拟器

- 开发者工具2.02.2608070，内置skill0.3.9，已登录且授权Codex。导入`apps/miniapp/dist/studio`，独立联调包仅包含studio-preview路由；未上传或发布。
- `pnpm --filter @wb/miniapp build:studio:h5`退出0（2条资源体积警告）；`$env:TARO_APP_API_NEXT_BASE='http://127.0.0.1:3011'; pnpm --filter @wb/miniapp build:studio:weapp`退出0。后端：`node scripts/dev-api-next.mjs`；H5：`node scripts/preview-h5.mjs`。3011仅监听loopback，真机不能直接使用该地址。
- 微信模拟器实际读取营销页：720P=368，480P=77；编辑15字描述后计数15/3000；停止API后显示“报价暂不可用/重新获取报价”，恢复API并点击重试得到368；按钮disabled=true，不接受生成。
- `weapp-home.jpg`、`weapp-marketing.jpg`、`weapp-quote.jpg`来自微信模拟器，已读回查看。不是手机真机截图。
- 本轮H5通过4175代理实际POST获取77积分、available=false；浏览器自动化被URL安全策略拒绝，未做本轮H5截图复验。下方旧浏览器验收是此前预览版本，演示生成按钮已被本轮不可受理状态替代。
- console含2条routeDone/webviewId提示；未阻止页面交互，保留为观察项。真实模型、上传、微信登录和手机验收尚未完成。
- UI开发数据库为独立临时容器（wb.ui-run标签），不复用旧库。正常信号关闭会清理；Windows执行器强制终止测试时发生残留，已检查标签后清理，重新启动一个供当前联调使用。异常退出后按标签检查，不得删除其他容器。

日期：2026-10-06。页面由Taro/React组件组成，不是整张参考图。参考：docs/UI参考图/01-首页-营销创作-分镜工作台.png。

## 打开

```text
pnpm --filter @wb/miniapp build:studio:h5
node scripts/preview-h5.mjs
```

地址：http://127.0.0.1:4175/#/pages/studio-preview/index 。桌面宽度≥1100显示三列，手机通过上方切换。预览明确使用示例数据，不调用模型、不创建任务、不扣费。

## 实测

| 项 | 结果 |
| --- | --- |
| 1440宽 | 3屏同时显示，无横向溢出；desktop-1440.jpg |
| 375宽首页 | 品牌不换行、主操作和两类入口正常；home-375.jpg |
| 375宽营销 | 多行文字完整显示；真实textarea高度86px；marketing-375.jpg |
| 430宽分镜 | 卡片、角色和操作区正常，无横向溢出；storyboard-430.jpg |
| 320宽 | 品牌高度40.5px，页面宽305px（含浏览器滚动条差异），无横向溢出 |
| 表单 | 改480P显示77积分，720P显示368；移除选填素材仍可操作；编辑内容后字符计数更新 |
| 演示生成 | 显示“未创建任务，未扣除积分”反馈 |
| 分镜 | 候选勾选可切换，演示状态由1/3变3/3，并明确未调用模型 |
| 图片 | 浏览器确认4张独立素材加载成功 |

修复了真实浏览器发现的4类问题：缺省TARO_APP_API_BASE导致process未定义白屏；Taro按钮默认满宽挤压标题；disabled=false属性误被CSS当成禁用；隐藏初始化的Textarea只剩一行高度。最后一项通过小屏仅挂载可见页面解决，不修改组件库、不注入DOM补丁。

界面源码经Prettier整理后再次typecheck/lint，退出0；独立预览weapp构建退出0。普通weapp发布构建检查：预览路由不存在，4张大图均未进入发布输出。预览产物独立放在dist/studio，素材目前为高保真原图，不用于提交小程序发布包。

截图来自真实浏览器，位于本目录。未验证微信真机、生产素材压缩/CDN、真实登录/生成/计费接入；其余9屏尚未实现。本轮不以静态示例当成生产功能完成。
