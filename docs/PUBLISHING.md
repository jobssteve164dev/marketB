# Chrome 应用商店发布与隐私合规指南

本文件记录了本插件在正式上传至 **Chrome Web Store** 以及配置 GitHub Actions 自动发布时所需的步骤、环境密钥配置，以及官方审核时要求的 **隐私权规范 (Privacy Practices)** 申明中英文文案。

---

## 1. 首次手动发布与基础设置

在您能够使用自动工作流之前，**必须先进行首次手动上传**以开通账号并确立草稿项目。

### 1.1 开通开发者账号
1. 访问 [Chrome 开发者控制台](https://chrome.google.com/webstore/devconsole/)。
2. 支付 **5 美元** 的一次性注册费用（需使用支持外币的信用卡，如 Visa/MasterCard 等）。
3. 在左侧 **“设置 (Settings)”** 中填入您的 **“发布方联系邮箱 (Publisher email)”** 并发送验证邮件，登录您的邮箱点击验证。

### 1.2 首次手动上传
1. 使用项目根目录下的 `extension.zip` 文件作为首次上传包（该压缩包已排除了多余的外部文件夹，`manifest.json` 处于压缩包的最外层根目录）。
2. 点击控制台右上角的 **“添加新内容 (Add new item)”** 拖入该 zip 包。
3. 成功后，复制控制台生成的一串 **32 位小写字母 ID**（如：`abcdefghijklmnopabcdefghijklmnop`）。

---

## 2. 自动构建与发布密钥配置 (CI/CD)

一旦完成首次手动上传并拿到了 32 位 Extension ID，您就可以在 GitHub 仓库的 **Settings -> Secrets and variables -> Actions** 中配置以下 4 个加密密钥，以启用我们为您写好的自动构建发布流：

| 密钥变量名 | 作用说明 | 获取方式 |
| :--- | :--- | :--- |
| `CHROME_APP_ID` | 插件的唯一商品 ID | 首次手动上传后，Chrome 开发者控制台生成的 32 位字母 ID。 |
| `CHROME_CLIENT_ID` | Google API 客户端 ID | 在 [Google Cloud Console](https://console.cloud.google.com/) 的 API 凭证中创建（应用类型选择“桌面应用”）。 |
| `CHROME_CLIENT_SECRET` | Google API 客户端密钥 | 在 Google Cloud Console 的 API 凭证中与客户端 ID 配对生成。 |
| `CHROME_REFRESH_TOKEN` | 长期有效的授权刷新令牌 | 详见文档中的 Refresh Token 一次性获取指南，用于在后台换取临时 Access Token。 |

---

## 3. 商店宣传资产 (Store Listing Assets)

发布时需要提供屏幕截图及宣传海报。我们已根据 Google 的分辨率和 **24 位无 alpha 透明通道** 规范，为您生成了全套的精美图档。文件均存放在项目的 `store-assets/` 目录下：

*   **屏幕截图 (Screenshots)**:
    *   **路径**: `store-assets/screenshot.png`
    *   **像素规格**: **`1280x800`** (无透明通道 PNG)
    *   **展示概念**: B站 视频详情页配合右侧“营销自动化侧边栏”进行评论自动填充的实机界面模拟。
*   **小型宣传图块 (Small promo tile)**:
    *   **路径**: `store-assets/small_promo.png`
    *   **像素规格**: **`440x280`** (无透明通道 PNG)
    *   **展示概念**: 居中发光的 3D 字母 “M”、极简的营销折线图及社群气泡，适用于推荐展示。
*   **顶部/马赛克宣传图块 (Marquee promo tile)**:
    *   **路径**: `store-assets/marquee_promo.png`
    *   **像素规格**: **`1400x560`** (无透明通道 PNG)
    *   **展示概念**: 大幅面高规格推荐位横幅，深蓝与紫罗兰微光网络背景，搭配 3D 发光 Logo 与统计浮窗。

---

## 4. 隐私权规范中英文合规申明 (Privacy Practices)

审核人员会对扩展所申请的每一项权限以及数据流向进行人工安全审计。请直接复制以下英文文本填入控制台的 **“隐私权规范 (Privacy Practices)”** 对应输入框中：

### 4.1 单一用途说明 (Single Purpose)
> **英文文案 (Copied to Web Store)**：
> This extension is a specialized productivity sidebar designed for content marketers to search Bilibili and YouTube videos by keywords, rank them locally by engagement metrics, and automatically inject pre-saved marketing reply templates into the comment areas to improve workflow efficiency.
>
> **中文参考**：本扩展是一个专门为内容营销人员设计的提效侧边栏工具，用于根据关键词搜索B站和YouTube视频、在本地按互动指标进行排序，并自动将预存的营销回复模板填充到评论区中。

### 4.2 需使用远程代码的理由 (Remote Code)
*   **配置**：勾选 **“No (否，本插件不使用任何远程代码)”**。
*   **原因**：Manifest V3 规定所有可执行脚本必须包含在 ZIP 包内，本插件 100% 本地编译。

### 4.3 需使用主机权限的理由 (Host Permissions)
> **英文文案 (Copied to Web Store)**：
> Host permissions for Bilibili and YouTube are necessary to inject content scripts into the search result pages to analyze video statistics (views and danmakus) for local heat-score ranking, and to dynamically locate the comment inputs for text injection.
>
> **中文参考**：需要B站和YouTube的主机权限，是为了在搜索结果页注入脚本以解析视频数据并进行热度计算，以及在详情页动态定位评论框并进行文本填充。

### 4.4 需使用 `scripting` 权限的理由 (Scripting)
> **英文文案 (Copied to Web Store)**：
> The scripting permission is required to safely inject and execute page-interaction scripts in the active video tab's context, allowing the extension to programmatically focus and fill text into the comments edit area.
>
> **中文参考**：需要 scripting 权限是为了在活动视频标签页中安全地注入并执行页面交互脚本，从而将预设文本填充到评论编辑区中。

### 4.5 需使用 `sidePanel` 权限的理由 (SidePanel)
> **英文文案 (Copied to Web Store)**：
> The sidePanel permission is used to render a persistent React UI sidebar alongside the target platforms, permitting users to draft replies, copy templates, and view analyzed data lists seamlessly without switching screens.
>
> **中文参考**：使用 sidePanel 权限是为了在目标平台侧边展示一个持久的 React UI 面板，让用户无需切换屏幕即可完成文案起草、模板复制和数据列表查看。

### 4.6 需使用 `storage` 权限的理由 (Storage)
> **英文文案 (Copied to Web Store)**：
> The storage permission is required to persist the user's custom marketing reply templates and search keywords locally in the browser's storage space across browser sessions.
>
> **中文参考**：需要 storage 权限是为了将用户自定义的营销回复模板和检索词持久化地保存在浏览器本地，以便跨会话使用。

### 4.7 需使用 `tabs` 权限的理由 (Tabs)
> **英文文案 (Copied to Web Store)**：
> The tabs permission is utilized to detect Bilibili or YouTube URLs on the active tab and to programmatically open selected video URLs in background tabs to automate the batch comment injection.
>
> **中文参考**：tabs 权限用于检测当前标签页的链接，并在后台打开选中的视频页面以进行批量的自动填充评论操作。

### 4.8 数据收集与安全确认 (Data Collection)
1.  **数据安全选择**：勾选 **“不收集或传输任何敏感的用户个人数据”**。
2.  在控制台隐私标签页底部勾选承诺：数据使用情况完全符合 Google 开发者计划政策。
