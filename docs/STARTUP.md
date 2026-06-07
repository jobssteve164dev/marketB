# 项目启动指南

## 环境要求

- Node.js 18+ 
- npm 9+
- Chrome 浏览器（120+）或 Chromium 系列
- 代码编辑器（VS Code 推荐）

---

## 快速启动

### 1. 本地开发

```bash
# 克隆或初始化项目
cd /path/to/chrome-marketing-sidebar

# 安装依赖
npm install

# 启动开发服务器（Vite）
npm run dev
```

开发模式下，Vite 会自动监听文件变化并热重载。

### 2. 构建生产版本

```bash
npm run build
```

产物在 `dist/` 目录，可直接加载到 Chrome。

### 3. 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 启用右上角"开发者模式"
3. 点击"加载已解压的扩展"
4. 选择 `dist/` 目录（不是 `src/`）

完成后，Chrome 工具栏会出现插件图标。

---

## 项目目录速览

```
src/
├── sidebar/           # 侧边栏 React 应用
│   ├── Sidebar.tsx     # 主组件
│   ├── pages/          # 页面组件（搜索、备忘录等）
│   └── components/     # 可复用 UI 组件
├── content-scripts/   # 页面脚本（DOM 解析）
│   ├── content.ts      # 入口
│   └── adapters/       # 平台适配器
├── background/        # Service Worker
├── shared/            # 共享类型、常量
└── index.tsx          # 侧边栏渲染入口

public/
├── manifest.json       # 插件配置
├── sidebar.html        # 侧边栏 HTML
└── icons/              # 插件图标

docs/
├── PLANNING.md         # 功能规划与路线
├── ARCHITECTURE.md     # 架构与设计
├── DECISIONS.md        # 技术决策
└── STARTUP.md          # 本文件
```

---

## 关键文件说明

### manifest.json
- 定义插件名称、版本、权限、脚本入口
- 修改时需要重新加载插件

### sidebar.html
- 侧边栏的 HTML 容器
- 内容由 React 动态渲染

### src/shared/types.ts
- 全局 TypeScript 接口定义
- 所有模块共用

### src/shared/constants.ts
- 平台配置、默认模板、权重常数
- 新增平台时在此处修改

---

## 开发工作流

### 修改侧边栏 UI（sidebar/ 目录）

1. 编辑 `src/sidebar/Sidebar.tsx` 或子组件
2. Vite 自动编译
3. 刷新浏览器中的插件（快捷键：Ctrl+Shift+R）
4. 侧边栏会更新

### 修改 Content Script（content-scripts/ 目录）

1. 编辑 `src/content-scripts/content.ts` 或 adapter
2. Vite 自动编译
3. **需要重新加载插件**（在 chrome://extensions 中点击刷新）
4. 刷新目标页面（Twitter 等）才能加载新 script

### 修改 Service Worker（background/ 目录）

1. 编辑 `src/background/background.ts`
2. Vite 自动编译
3. **需要重新加载插件**
4. 重新刷新侧边栏即可生效

### 修改 manifest.json

1. **不需要修改**：只改 scripts 或功能权限
2. **需要重新加载**：若修改 manifest 结构本身（推荐方式：编辑源文件后 npm run build）

---

## 调试技巧

### 1. 侧边栏调试

1. 右键点击侧边栏 → 检查
2. 打开 DevTools 的 Console 标签
3. React 组件树可在 Console 中用 React DevTools 扩展查看

### 2. Content Script 调试

1. 打开目标页面（如 Twitter.com）
2. 打开页面 DevTools（F12）
3. 在 Console 中查看 Content Script 的日志
4. 查看 Network 标签观察消息传递

### 3. Service Worker 调试

1. 在 `chrome://extensions/` 中找到插件
2. 点击"Service Worker" 下方的"检查"链接
3. 打开的 DevTools 可查看 Background 脚本日志

### 4. 消息传递调试

在 Service Worker 的 chrome.runtime.onMessage 处理中打印：

```typescript
console.log('[Background] Received message:', message);
```

---

## 常见问题

### Q: 插件加载后侧边栏不出现？
A: 
- 检查是否在支持的平台上（Twitter、小红书、抖音）
- 查看 manifest.json 的 side_panel 配置
- 查看 DevTools 是否有错误

### Q: 修改代码后没有生效？
A:
- 侧边栏 UI：刷新浏览器即可
- Content Script：重新加载插件 + 刷新目标页面
- Service Worker：重新加载插件即可

### Q: 如何快速重新加载插件？
A:
在 chrome://extensions/ 中，找到插件卡片，点击右下角的刷新图标。

### Q: 如何清空存储（开发调试）？
A:
在侧边栏 DevTools 的 Console 中执行：

```javascript
chrome.storage.local.clear(() => console.log('Cleared local storage'));
chrome.storage.sync.clear(() => console.log('Cleared sync storage'));
```

---

## 提交规范

每个 commit 前，确保：

1. 代码通过 TypeScript 类型检查：`npm run type-check`
2. 功能已在实际浏览器上验证
3. 无新增 console.error（调试日志用 console.log）
4. Commit message 清晰，格式：

```
feat: 添加备忘录功能
fix: 修复 Twitter 适配器 DOM 解析错误
chore: 更新依赖版本
docs: 补充架构设计文档
```

---

## 测试指南（Phase 1 后期开始）

### 单元测试
```bash
# 创建 src/__tests__/ 目录
# 编写 *.test.ts 文件
npm run test
```

### E2E 测试
```bash
# 在真实 Twitter.com 上手动验证
# 文档：docs/E2E_TESTING.md（后续创建）
```

---

## 持续集成（可选）

建议配置 GitHub Actions 或 GitLab CI 来：
- 自动类型检查
- 自动构建验证
- 自动上传测试报告

---

## 获取帮助

遇到问题时按优先级查找：

1. 查阅本启动指南
2. 检查 docs/ 中的相关文档（PLANNING.md、ARCHITECTURE.md）
3. 查看代码注释和 TypeScript 类型提示
4. Chrome Extension 官方文档：https://developer.chrome.com/docs/extensions/

---

## 下一步

- 完成 Phase 1：搭建项目、验证基础流程
- 见 PLANNING.md 中的"开发路线"部分
