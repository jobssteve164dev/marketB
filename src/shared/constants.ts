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
    title: '感谢反馈',
    content: '感谢您的反馈！已经记录下来，我们会认真考虑。',
    category: '感谢'
  },
  {
    id: 'template-2',
    title: '技术问题回答',
    content: '感谢提问！这个问题很好。我们的方案是 [答案]。更多详情可以查看我们的文档：[链接]',
    category: '技术'
  },
  {
    id: 'template-3',
    title: '邀请体验',
    content: '非常感谢关注！我们有个新功能正在内测，您有兴趣体验吗？可以发送私信进行申请。',
    category: '营销'
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
