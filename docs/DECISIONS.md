## 关键技术决策

### 1. Manifest V3（而非 V2）
**决策**: 使用 Chrome Extension Manifest V3  
**原因**:
- Chrome 已完全弃用 V2，新插件必须用 V3
- Service Worker 替代 background page，更节能
- 更严格的 CSP，提高安全性

---

### 2. 本地存储（而非云同步）
**决策**: 默认所有数据本地存储（Chrome Storage 或 IndexedDB）  
**原因**:
- 隐私优先：用户数据不离开浏览器
- 无服务器依赖，降低维护成本
- Chrome Storage API 支持跨设备 Sync（可选）

---

### 3. React + TypeScript（而非 Vue 或 Vanilla JS）
**决策**: 使用 React 18 + TypeScript 开发侧边栏  
**原因**:
- 组件化开发，代码可维护性高
- TypeScript 类型安全，减少 Bug
- 生态成熟，开发工具丰富

---

### 4. 平台适配器模式（而非硬编码）
**决策**: 为每个平台实现独立 Adapter 类  
**原因**:
- 新增平台无需修改核心逻辑
- 易于测试（单个 adapter 独立单测）
- 团队协作时，不同人可并行开发 adapter

---

### 5. Content Script 解析（而非后端爬虫）
**决策**: 直接在浏览器 Content Script 中解析 DOM  
**原因**:
- 无需后端服务（隐私优先）
- 实时性好：用户打开页面即可看结果
- 避免触发反爬虫机制（用浏览器已登录身份）

---

### 6. 不自动点击发布（用户手动确认）
**决策**: 填充评论框但不自动点击发布按钮  
**原因**:
- 法律与安全：避免自动化操作被平台封禁
- 用户体验：保留最终确认权，防止误发
- 合规性：符合各平台 ToS

---

### 7. Debounce + MutationObserver（页面监听）
**决策**: 使用 MutationObserver 监听 DOM 变化（新帖子加载）  
**原因**:
- 支持无限滚动平台（Twitter、抖音等）
- 比定时轮询性能更好
- Debounce 避免频繁解析

---

## 已弃选方案

### ❌ 后端服务 + API
理由: 增加隐私风险、维护成本、网络延迟

### ❌ Selenium 或 Puppeteer
理由: 笨重、无法在浏览器内运行、需要额外进程

### ❌ 自动提交表单
理由: 被平台风控、违反 ToS、用户体验差

### ❌ Redux（状态管理）
理由: 引入复杂性，对插件开发过度设计；Zustand 已足够

---

## 安全边界

✅ **绝对不做**:
- 存储明文密码
- 上报用户评论内容到外部服务
- 绕过 2FA 或登录验证
- 自动点击"发布"（直接提交表单）
- 修改已发布的评论/帖子

✅ **必须坚守**:
- 所有代码本地运行且开源可审计
- 清晰的隐私政策（在 README 或 PRIVACY.md）
- 定期更新 adapter，应对平台 DOM 变化

---

## 验证清单（Phase 1 完成标准）

- [ ] 项目结构已搭建，能正常 `npm install && npm run build`
- [ ] 侧边栏 HTML/CSS 框架完成，能打开侧边栏
- [ ] 关键词输入框与本地存储 ✓（Chrome Storage API）
- [ ] 检测到 Twitter.com 打开，正确展示平台识别
- [ ] 一条搜索链接能正确生成（Twitter 搜索 URL）
- [ ] 在真实 Twitter.com 上点击"搜索"，能跳转到搜索结果页

---

## 下一步（不在 Phase 1 做）

- Phase 2: DOM 解析、热度排序、列表展示
- Phase 3: 评论框填充、身份利用
- Phase 4: 备忘录功能
- Phase 5+: 多平台扩展、性能优化
