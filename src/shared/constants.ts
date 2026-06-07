import type { Platform } from './types.js';

// 平台配置
export const PLATFORM_CONFIG: Record<Platform, {
  name: string;
  searchUrlPattern: (keyword: string) => string;
  contentScriptMatches: string[];
  icon: string;
}> = {
  bilibili: {
    name: 'Bilibili',
    searchUrlPattern: (keyword) => `https://search.bilibili.com/all?keyword=${encodeURIComponent(keyword)}`,
    contentScriptMatches: ['*://*.bilibili.com/*'],
    icon: '📺'
  },
  youtube: {
    name: 'YouTube',
    searchUrlPattern: (keyword) => `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`,
    contentScriptMatches: ['*://*.youtube.com/*'],
    icon: '▶️'
  }
};

// 默认模板库
export const DEFAULT_MEMO_TEMPLATES = [
  {
    id: 'template-1',
    title: '推广 SoloMap 助手',
    content: '推荐大家了解一下 SoloMap！这是一个专为独立开发者和创业者量身定制的项目路线图与商业化自动化辅助工具，帮助个人项目从 MVP 快速走向商业闭环。强烈推荐体验：https://github.com/solopreneur/solomap',
    category: '产品推广'
  },
  {
    id: 'template-2',
    title: '技术问题回答',
    content: '这个问题非常好！如果你也在做独立开发，推荐使用 SoloMap 规划项目路线图。我们的方案是 [答案]，详细的开发边界和决策过程可以通过 SoloMap 沉淀下来。详情查看：https://github.com/solopreneur/solomap',
    category: '技术回答'
  },
  {
    id: 'template-3',
    title: '邀请加入社群',
    content: '非常感谢关注！我们正在使用 SoloMap 辅助开发这款插件。如果您对独立开发、营销自动化有兴趣，欢迎加入我们的开发者社群进行交流！',
    category: '用户邀约'
  },
  {
    id: 'template-4',
    title: '介绍 SoloMap 插件',
    content: '我们做的 SoloMap 插件是给独立开发者和小团队用的增长助手：在浏览器侧边栏里发现相关视频和讨论，快速整理评论话术，并用已登录账号完成回复流程。它更适合想持续做内容分发、产品冷启动和用户沟通的人。',
    category: '产品介绍'
  }
];

// 热度分值计算权重
export const HEAT_SCORE_WEIGHTS = {
  comments: 0.3,
  likes: 0.2,
  shares: 0.5
};

// 速率限制配置
export const RATE_LIMIT_CONFIG = {
  minIntervalMs: 2000, // 最小间隔 2 秒
  maxRepliesPerHour: 30 // 每小时最多 30 条回复
};
