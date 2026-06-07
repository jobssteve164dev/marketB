# 架构设计 - Chrome 侧边栏营销插件

## 1. 设计原则

### 1.1 用户-中心设计
- 侧边栏必须快速响应（<500ms），不能阻塞主窗口
- 关键词输入→搜索的链路尽可能简洁
- 回复与备忘录的交互直观，减少学习成本

### 1.2 隐私-优先
- 所有数据本地存储，无服务器中间件
- Content Script 不向任何服务上报用户内容
- 严格遵守 Chrome Extension 权限最小化原则

### 1.3 可维护性
- 平台适配器模式，新增平台无需修改核心逻辑
- TypeScript 全覆盖，类型安全降低 Bug 率
- 模块化架构，单元测试友好

---

## 2. 消息流与通信

```
┌─────────────────────┐
│  侧边栏 (React)      │
│  - 关键词输入        │
│  - 帖子列表展示      │
│  - 回复框           │
└──────────┬──────────┘
           │
           │ chrome.runtime.sendMessage()
           ▼
┌─────────────────────┐
│ Background Worker   │
│ (Service Worker)    │
│ - 消息路由          │
│ - 存储协调          │
│ - 权限检查          │
└──────────┬──────────┘
           │
           │ chrome.tabs.sendMessage()
           ▼
┌─────────────────────┐
│ Content Script      │
│ - DOM 解析          │
│ - 平台适配器        │
│ - 评论注入          │
└─────────────────────┘
```

**消息协议示例**:

```typescript
// 侧边栏 → Background: 获取搜索结果
{
  type: "SEARCH_POSTS",
  keyword: "AI",
  platform: "twitter"
}

// Content Script → Background: 上报 DOM 解析结果
{
  type: "POSTS_PARSED",
  posts: [...],
  count: 15
}

// 侧边栏 → Content Script: 填充评论
{
  type: "INJECT_COMMENT",
  postId: "123456",
  content: "Great insights!"
}
```

---

## 3. 状态管理架构

### 侧边栏状态 (Zustand)
```typescript
interface SidebarStore {
  // 搜索状态
  currentKeyword: string;
  currentPlatform: "twitter" | "xhs" | "douyin";
  isSearching: boolean;
  posts: Post[];
  
  // 回复状态
  selectedPostId: string | null;
  replyContent: string;
  
  // 备忘录状态
  memos: Memo[];
  selectedMemoId: string | null;
  
  // 动作
  setKeyword: (keyword: string) => void;
  search: () => Promise<void>;
  selectPost: (postId: string) => void;
  injectReply: () => Promise<void>;
  // ...
}
```

### 持久化存储
- **Chrome Storage Sync**: 用户的关键词列表、备忘录（跨设备同步）
- **IndexedDB**: 历史搜索结果、缓存（本地高性能）
- **SessionStorage**: 当前侧边栏会话数据（临时）

---

## 4. 平台适配器模式

```typescript
// 基类
abstract class BaseAdapter {
  abstract getPlatformName(): string;
  abstract parsePostsFromDOM(): Post[];
  abstract findCommentInputSelector(postId: string): string;
  abstract generateSearchUrl(keyword: string): string;
}

// Twitter 适配器
class TwitterAdapter extends BaseAdapter {
  getPlatformName() { return "twitter"; }
  
  parsePostsFromDOM(): Post[] {
    // 解析 <article> 元素
    // 提取作者、文本、metrics
  }
  
  findCommentInputSelector(tweetId: string): string {
    // 返回评论框的 CSS 选择器
    return `[data-tweet-id="${tweetId}"] [role="textbox"]`;
  }
}

// 工厂函数
function getAdapter(platform: string): BaseAdapter {
  const adapters = {
    twitter: new TwitterAdapter(),
    xhs: new XhsAdapter(),
    douyin: new DouYinAdapter(),
  };
  return adapters[platform];
}
```

---

## 5. Content Script 执行流

```
页面加载
    ↓
检测平台（URL 匹配规则）
    ↓
选择对应 Adapter
    ↓
监听 MutationObserver（新帖子加载）
    ↓
解析 DOM，提取 Posts
    ↓
计算热度分值
    ↓
发送给 Background（消息: POSTS_PARSED）
    ↓
Background 转发给侧边栏
    ↓
侧边栏刷新列表视图
```

**伪代码**:
```typescript
// content-scripts/content.ts
const adapter = getAdapter(detectPlatform());

const observer = new MutationObserver(debounce(() => {
  const posts = adapter.parsePostsFromDOM();
  const postsWithScore = posts.map(p => ({
    ...p,
    heatScore: calculateScore(p)
  }));
  
  chrome.runtime.sendMessage({
    type: 'POSTS_PARSED',
    posts: postsWithScore
  });
}, 500));

observer.observe(document.body, {
  subtree: true,
  childList: true,
  attributes: true
});
```

---

## 6. 评论注入机制

**关键问题**: 如何在不自动点击"发布"的前提下，填充评论框？

**方案**:
1. Content Script 找到目标帖子的评论框 (selector by postId)
2. 使用 `element.focus()` + `element.value = content` 填充
3. 触发 `input` 和 `change` 事件（模拟用户输入）
4. **不触发 submit**，由用户手动 Enter 或点击发布按钮

**代码示例**:
```typescript
function injectComment(postId: string, content: string) {
  const selector = adapter.findCommentInputSelector(postId);
  const input = document.querySelector(selector) as HTMLTextAreaElement;
  
  if (!input) {
    console.error(`Comment input not found for post ${postId}`);
    return false;
  }
  
  input.focus();
  input.value = content;
  
  // 模拟用户输入事件
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  
  return true;
}
```

---

## 7. 性能优化策略

| 优化点 | 技术 | 效果 |
|-------|------|------|
| DOM 解析 | 虚拟滚动（React Window） | 大列表不卡顿 |
| Content Script | Debounce MutationObserver | 减少冗余解析 |
| 侧边栏加载 | React 代码分割 | 首屏 <300ms |
| 搜索结果缓存 | IndexedDB + LRU | 避免重复爬取 |
| 图片加载 | 懒加载 + WebP | 降低内存占用 |

---

## 8. 安全性考虑

### 8.1 权限最小化
```json
{
  "permissions": [
    "storage",           // 本地存储
    "scripting",         // Content Script 注入
    "webRequest"         // 监听请求（可选，用于检测登录）
  ],
  "host_permissions": [
    "*://twitter.com/*",
    "*://x.com/*",
    "*://xiaohongshu.com/*",
    "*://douyin.com/*"
  ]
}
```

### 8.2 Sandbox 隔离
- 侧边栏 React 应用运行在 iframe 沙箱中
- Content Script 无法直接访问侧边栏 DOM
- 所有跨上下文通信通过 chrome.runtime.sendMessage()

### 8.3 CSP 策略
```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

---

## 9. 测试策略

### 单元测试
- Adapter 类的 DOM 解析逻辑（Mock DOM）
- 热度计算算法
- 消息路由逻辑

### 集成测试
- 侧边栏与 Background 通信
- Content Script 注入与 DOM 操作
- 存储的读写与同步

### E2E 测试
- 在真实 Twitter/XHS 页面上验证完整流程
- 跨浏览器验证（Chrome、Edge）

---

## 10. 错误处理与用户提示

### Content Script 错误
```typescript
try {
  const posts = adapter.parsePostsFromDOM();
} catch (e) {
  console.error('Failed to parse posts:', e);
  chrome.runtime.sendMessage({
    type: 'ERROR',
    message: '无法解析帖子，请刷新页面'
  });
}
```

### 侧边栏 UI 提示
- 搜索失败: "未找到相关讨论，请检查关键词"
- 登录检查: "请先在此平台登录"
- 评论注入失败: "评论框已关闭或页面已更新，请手动重试"

---

## 11. 后续架构演进

### 支持多账户
```typescript
interface Account {
  platform: string;
  username: string;
  authToken?: string; // 仅在必要时存储
}

// 用户可为不同平台配置账户
const accounts = {
  twitter: "my_marketing_account",
  xhs: "my_xiaohongshu_id"
};
```

### 后台任务队列
```typescript
// 延迟：定时发布回复（不立即发送）
// 示例：今晚 8 点批量发送 5 条预设回复
interface ScheduledReply {
  id: string;
  postId: string;
  content: string;
  scheduledAt: number; // Unix timestamp
  status: "pending" | "sent" | "failed";
}
```

### 数据分析与反馈
```typescript
// 追踪（本地）：这条评论最后获得了多少赞、多少回复
// 基于此，用户可评估哪类回复效果最好
interface ReplyMetrics {
  replyId: string;
  likes: number;
  replies: number;
  timestamp: number;
}
```

---

## 核心约束

🚫 **禁止**:
- 向后端上传任何用户内容或 Cookie
- 绕过平台登录或 2FA 机制
- 自动点击"发布"按钮（必须用户手动确认）
- 存储任何明文密码

✅ **必须**:
- 所有代码开源且可审计
- 定期更新平台适配器以应对 DOM 变化
- 为用户提供清晰的隐私政策与功能说明
