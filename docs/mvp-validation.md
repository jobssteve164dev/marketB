# MVP Validation

## 本轮交付目标

验证并打包现有 Chrome 插件，覆盖 Twitter/X、YouTube、Bilibili、Facebook 适配器；同时固定隐力信号刷新、回复锦囊同步、博思万象连接验证、Reddit 原帖跳转三条用户可感知链路。

## 已运行验证

- `npm run type-check`
- `node scripts/verify-yinli-aif-logic.mjs`
- `npm run build`
- `cat docs/mvp-validation.md`

## Chrome 手动加载步骤

1. 在项目目录运行 `npm run build`，确认 `dist/` 生成 `manifest.json`、`sidebar.html`、`background.js`、`content.js` 和静态资源。
2. 打开 Chrome，进入 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择 `/home/ubuntu/project/marketB/dist/`。
6. 点击浏览器工具栏里的 Marketing Sidebar 图标，打开侧边栏。
7. 分别进入 Bilibili、YouTube、X/Twitter、Facebook 的搜索或内容页面，使用侧边栏抓取内容，确认列表按热度降序展示。
8. 选中一条内容，输入回复，关闭自动发布时确认只填充评论框；开启自动发布时确认后台标签页完成填充并尝试发送。

## 平台适配器审计

- Bilibili：`src/content-scripts/adapters/bilibili.ts` 覆盖 `.bili-video-card`、`.video-list-item`、`.video-item`；播放与弹幕从现代 stats item、旧 class、stats 容器多级兜底读取。评论填充支持 `textarea`、`contenteditable`、`bili-rich-textarea`、`bili-comments-*` 和 Shadow DOM 深度查询。
- YouTube：`src/content-scripts/adapters/youtube.ts` 覆盖 `ytd-video-renderer`、`ytd-grid-video-renderer`、`ytd-rich-item-renderer`；视频 URL 支持 watch、shorts、youtu.be。评论填充会滚动查找 `#simplebox-placeholder` 与 `#contenteditable-root`。
- X/Twitter：`src/content-scripts/adapters/twitter.ts` 基于 `article[data-testid="tweet"]`、`[data-testid="tweetText"]`、`[data-testid="User-Name"]`、`/status/` 链接抽取；回复框使用 `tweetTextarea_0` 与 `contenteditable` 兜底。
- Facebook：`src/content-scripts/adapters/facebook.ts` 基于 `div[role="article"]` 抽取，正文覆盖 `data-ad-preview`、`data-ad-comet-preview`、`data-ad-rendering-role` 与 `div[dir="auto"]`；帖子链接覆盖 posts、permalink、videos、photos，评论填充使用 `div[role="textbox"][contenteditable="true"]`。

结论：当前选择器已覆盖四个平台的主流新版 DOM 与旧版兜底。仍需手动实机复核 Facebook 与 X/Twitter，因为这两个站点对账号、地区、A/B 实验和登录状态高度敏感。

## 外部网络请求审计

- 内容抓取与评论填充适配器不主动向第三方服务上报内容，只在当前网页 DOM 内读取、排序、填充。
- 后台评论任务只打开用户选中的目标页面，并向内容脚本发送本地消息。
- 允许的外部请求只发生在用户显式触发的功能中：隐力协同 API、博思万象资产生成/验证、产品市场分析、翻译、远程封面下载。
- 本轮没有新增后台静默上报；新增的隐力 `/api/strategy/batch` 只在用户点击刷新隐力信号后调用，用来补齐缺失的回复锦囊。

## 本轮回归点

- 隐力刷新：刷新按钮现在先触发战场 scout，再拉取信号，识别没有回复锦囊的信号，调用隐力 `/api/strategy/batch` 补生成，最后再次拉取并同步当前选中信号与回复输入框。
- 博思万象连接验证：设置页只使用 `/api/marketing/publish-assets/verify` 做身份验证，不再把普通 health 接口当成账户连接成功；成功后展示连接账号或唯一身份代码尾号及额度信息。
- Reddit 原帖跳转：隐力 Reddit 信号打开前会校验 URL 必须是 Reddit 帖子链接；支持从 redirect 参数中解出真实 Reddit URL，但会阻止 `possibility.work` 等服务站点 URL 被当作 Reddit 原帖打开。

## YL 源码审计结论

YL 的 `POST /api/battlefield/[id]/scout` 只有在战场 `autoStrategy` 开启时才自动生成策略；marketB 原刷新按钮只触发 scout 和重新拉取 `/strategies`，不会主动为缺失锦囊的信号补生成，这是“信号刷新了但回复锦囊未刷新”的根因。

YL 的 Reddit scout 走 community provider 时会把上游返回的 `post.url` 原样写入 `signal.url`；源码没有强制校验该 URL 必须是 reddit.com 帖子链接。marketB 侧已加最后一道打开前校验，避免错误服务站点继续进入回复链路。
