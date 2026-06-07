# Chrome 侧边栏营销自动化插件 - 功能规划与技术路线

**最后更新**: 2026-06-07  
**项目类型**: Chrome 浏览器插件 / 营销工具  
**核心价值**: 帮助营销人员快速跨平台搜索相关讨论、批量回复评论，提高内容营销效率

---

## 1. 核心功能模块

### 1.1 关键词管理 & 侧边栏搜索
**用户动作**: 输入关键词 → 跨平台搜索相关讨论  

- 关键词编辑面板（本地持久化）
- 支持单个关键词快速搜索
- 支持预设关键词列表（"我的热话题"）
- 一键搜索跳转到当前平台相关讨论

**技术实现**:
- 侧边栏 React 组件 + Chrome Storage API 本地存储
- 对接各平台的搜索 URL Scheme（Twitter、小红书、抖音等）
- 浏览器原生 `chrome.tabs.query()` 检测当前平台

---

### 1.2 跨平台讨论聚合 & 热度排序
**用户动作**: 搜索关键词 → 看排序后的热门讨论/视频列表  

- 检测当前打开的平台（Twitter、小红书、YouTube、TikTok 等）
- 从平台页面 DOM 爬取帖子/视频：发布者、文本、评论数/转赞数
- 按热度指标排序（组合：评论数、转赞、分享数）
- 列表展示（仅 UI 展示，不做跨域数据中转）

**技术实现**:
- Content Script 注入，解析目标平台 DOM 结构
- 各平台适配器模式（Twitter adapter、小红书 adapter 等）
- 本地计算热度分值：`score = comments * 0.3 + likes * 0.2 + shares * 0.5`
- 侧边栏 React 表格/卡片展示

**关键约束**:
- 不向后端上传任何用户内容，所有数据在本地处理
- 支持的平台初版：Twitter、小红书、抖音（可逐步扩展）

---

### 1.3 快速回复输入与身份利用
**用户动作**: 在侧边栏草拟回复 → 自动填充到目标帖子评论区，利用浏览器已登录身份  

- 侧边栏回复文本框（支持多行、字数统计）
- "发布到评论区"按钮 → 自动填充评论输入框
- 支持提前选择目标帖子
- 模拟 Chrome 用户与已登录 Cookie 自动结合

**技术实现**:
- 从选中帖子元素提取评论区输入框选择器
- Content Script 查找并 focus 目标评论区，填充文本
- 通过 `chrome.cookies.get()` 验证当前平台已登录
- 支持"一键发布"（可选择逐个发或批量）

**安全与限制**:
- 严格遵守各平台反爬虫政策，不绕过登录或 2FA
- 默认后台填充并自动发布；关闭自动发布时，只填充评论并等待用户手动确认
- 限制批量操作速率，避免账号风控

---

### 1.4 本地备忘录与一键复制
**用户动作**: 记录需要回复的内容 → 分类管理 → 快速复制到侧边栏  

- 备忘录编辑面板（支持 Markdown 格式）
- 分类标签（如"产品、运营、技巧"等）
- 快速模板库（常用的"感谢评论"、"问题反馈"等）
- 一键复制内容到侧边栏回复框

**技术实现**:
- Chrome Storage API (`chrome.storage.sync`) 跨设备同步备忘录
- 本地 IndexedDB 作备份（结构：id, title, content, category, created_at, tags）
- 侧边栏右侧栏展示模板库，drag-to-copy 或点击复制

---

## 2. 技术栈与架构

### 2.1 技术选型

| 层级 | 技术 | 原因 |
|------|------|------|
| **插件框架** | Chrome Extensions Manifest V3 | 最新标准，支持 Service Worker 后台脚本 |
| **侧边栏** | React 18 + TypeScript | 组件化快速迭代，类型安全 |
| **样式** | Tailwind CSS | 快速原型，响应式设计 |
| **状态管理** | Zustand | 轻量级，开发体验好 |
| **数据持久化** | Chrome Storage API + IndexedDB | 原生支持，无需后端 |
| **Content Script** | Vanilla JS + MutationObserver | 最小依赖，低性能开销 |
| **构建工具** | Vite + TypeScript | 快速开发、编译、打包 |
| **平台适配** | 工厂模式 Adapters | 新增平台无需修改核心逻辑 |

---

### 2.2 目录结构

```
chrome-marketing-sidebar/
├── manifest.json              # V3 manifest
├── src/
│   ├── sidebar/              # 侧边栏 React 应用
│   │   ├── Sidebar.tsx        # 入口组件
│   │   ├── pages/
│   │   │   ├── SearchPage.tsx
│   │   │   ├── MemosPage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   ├── components/
│   │   │   ├── KeywordInput.tsx
│   │   │   ├── PostList.tsx
│   │   │   ├── ReplyBox.tsx
│   │   │   ├── MemoEditor.tsx
│   │   └── styles/
│   ├── content-scripts/       # 页面脚本
│   │   ├── content.ts         # 主入口
│   │   ├── adapters/          # 平台适配器
│   │   │   ├── TwitterAdapter.ts
│   │   │   ├── XhsAdapter.ts   (小红书)
│   │   │   ├── DouYinAdapter.ts (抖音)
│   │   │   └── BaseAdapter.ts   (基类)
│   │   ├── dom-parser.ts       # DOM 元素解析
│   │   └── comment-injector.ts # 评论填充逻辑
│   ├── background/            # Service Worker
│   │   ├── background.ts       # 消息路由、权限检查
│   │   └── storage-sync.ts     # 数据持久化
│   ├── shared/
│   │   ├── types.ts            # 共享 TypeScript 接口
│   │   ├── constants.ts        # 平台配置、URL Scheme
│   │   └── utils.ts            # 工具函数
│   └── index.tsx               # 侧边栏渲染入口
├── public/
│   ├── sidebar.html            # 侧边栏页面
│   ├── icons/                  # 插件图标 (16x16, 32x32, 48x48, 128x128)
│   └── favicon.png
├── dist/                       # 构建产物
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

### 2.3 核心数据模型

```typescript
// 关键词
interface Keyword {
  id: string;
  text: string;
  category?: string;      // 分组
  createdAt: number;
  lastSearchedAt?: number;
}

// 帖子/视频
interface Post {
  id: string;
  platform: "twitter" | "xhs" | "douyin" | "youtube"; // 小红书简写 xhs
  author: string;
  content: string;
  mediaUrls?: string[];
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  heatScore: number;      // 计算得出
  pageUrl: string;        // 原始页面链接
  extractedAt: number;
}

// 备忘录
interface Memo {
  id: string;
  title: string;
  content: string;        // Markdown
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

// 回复草稿
interface ReplyDraft {
  id: string;
  targetPostId: string;
  content: string;
  status: "draft" | "pending" | "sent";
  createdAt: number;
}
```

---

## 3. 开发路线与验证策略

### Phase 1: 基础侧边栏 & 单平台验证（2-3 天）
**目标**: 选定 Twitter 作为首个平台，验证基本流程可行

- [ ] 搭建 Chrome Extension Manifest V3 项目
- [ ] 创建侧边栏 React 应用（空白页面可正常打开）
- [ ] 实现关键词输入与本地存储
- [ ] Twitter adapter：识别搜索框，生成搜索 URL
- [ ] 手动验证：输入关键词 → 跳转到 Twitter 搜索结果页

**最窄验证**: 
```
1. 安装插件到 Chrome
2. 打开 Twitter.com
3. 点击侧边栏图标，输入关键词 "AI"
4. 点击"搜索"，观察是否跳转到搜索结果页
```

---

### Phase 2: DOM 解析与热度排序（3-4 天）
**目标**: 从搜索结果页自动解析帖子、计算热度、在侧边栏展示

- [ ] Content Script 注入，监听页面加载
- [ ] Twitter adapter：解析推文 DOM（作者、文本、点赞数、转赞数）
- [ ] 热度计算算法 + 本地排序
- [ ] 侧边栏表格展示搜索结果
- [ ] 性能测试：大量帖子下的 DOM 解析耗时

**最窄验证**:
```
1. 在 Twitter 搜索结果页输入关键词
2. 侧边栏自动显示排序后的帖子列表
3. 验证前 5 个帖子的热度分值正确计算
```

---

### Phase 3: 快速回复与评论填充（3-4 天）
**目标**: 从侧边栏回复框自动填充评论区，利用浏览器登录身份

- [ ] 选择帖子并关联到侧边栏回复框
- [ ] 找到评论输入框选择器（Platform adapter）
- [ ] 自动 focus + 填充回复文本
- [ ] 风险控制：速率限制、登录检查
- [ ] 安全验证：确认不绕过 2FA，自动发布只在用户开启开关后执行

**最窄验证**:
```
1. 登录 Twitter 帐号
2. 打开一条推文
3. 在侧边栏选择该推文、输入回复文本
4. 点击"一键后台填充并发送"，观察插件在后台打开目标页并完成评论
5. 关闭自动发布后再次执行，确认页面只填充内容并等待手动发布
```

---

### Phase 4: 备忘录 & 一键复制（2-3 天）
**目标**: 建立备忘录库，快速复制模板到回复框

- [ ] Memo 编辑面板（创建、编辑、分类）
- [ ] Chrome Storage Sync 同步备忘录（跨设备）
- [ ] IndexedDB 本地备份
- [ ] 一键复制到侧边栏回复框
- [ ] 快速模板库（可预设常用模板）

**最窄验证**:
```
1. 在备忘录页创建模板："感谢反馈，已记录！"
2. 打开 Twitter，选择一条推文
3. 点击模板中的"一键复制"
4. 验证侧边栏回复框已填充该内容
```

---

### Phase 5: 多平台扩展（3-5 天）
**目标**: 支持小红书、抖音、YouTube

- [ ] 小红书 adapter：DOM 解析、搜索 URL、评论框选择器
- [ ] 抖音 adapter：类似实现
- [ ] 各平台兼容性测试
- [ ] 平台切换时的界面适配

---

### Phase 6: 性能与安全加固（2-3 天）
**目标**: 优化 DOM 解析效率、防止账户风险、反反爬虫

- [ ] Content Script 性能分析（大页面下的内存占用）
- [ ] 限流算法：防止批量回复被风控
- [ ] 登录状态检查 + 提示
- [ ] 错误处理与用户提示
- [ ] 隐私政策：不上报任何用户数据

---

## 4. 风险与约束

### 4.1 技术风险
| 风险 | 缓解策略 |
|------|--------|
| 各平台 DOM 结构变化 | 定期更新 adapter，用类选择器而非硬编码索引 |
| Content Script 被拦截 | 确保 manifest.json 权限合理，遵守平台 ToS |
| 大页面性能问题 | MutationObserver 限流、虚拟滚动展示列表 |
| 账户风控与限流 | 内置速率限制（2 秒/条），检查登录状态 |

### 4.2 政策与安全
- **平台 ToS 合规**: 不爬虫、不绕过身份验证，仅利用浏览器已登录会话
- **隐私**: 所有数据本地存储，无后端服务，无网络外泄
- **功能边界**: 默认支持后台自动填充并发送；用户关闭自动发布后，最终发布动作由用户确认
- **账户安全**: 不存储密码，不修改登录信息，仅利用浏览器 Cookie

---

## 5. 第一版成功标准

✅ 完成条件（缺一不可）:

1. **基础流程**: 侧边栏能正常打开，关键词输入与本地保存正常
2. **单平台验证**: 选定一个平台（建议 Twitter），完整验证搜索→热度排序→填充评论的闭环
3. **可复现**: 在干净的 Chrome 环境安装插件，按照 README 步骤能重复验证
4. **无网络外泄**: 本地运行时无异常网络请求（检查 DevTools Network 标签）
5. **安全确认**: 不存储密码、不绕过登录或 2FA，自动发布只使用浏览器已登录会话
6. **文档完整**: README 包含安装、基本使用、支持平台、已知限制

---

## 6. 后续迭代方向

- 🔄 支持更多平台（Telegram、Discord、Mastodon）
- 🤖 AI 智能回复建议（基于上下文）
- 📊 回复效果统计（点赞、回复数追踪）
- 🔐 多账户管理（为不同平台配置不同账户）
- 📱 移动端浏览器支持（Firefox、Edge）
- 🌍 多语言支持

---

## 7. 实施建议

**立即开始**:
1. 初始化项目结构（Vite + React + TypeScript）
2. 完成 Phase 1（基础侧边栏 + Twitter 导航）
3. 在 Twitter.com 上真实验证可行性

**协作交接**:
- 若卡在某个平台适配，可先用其他平台继续，后续补充
- 每个 Phase 完成后测试，不等全部完成再验证
- 备忘录功能可在 Phase 3 后并行开发
