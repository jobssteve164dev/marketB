// 支持的平台
export type Platform = "bilibili" | "youtube" | "twitter" | "facebook";
export type PublishPlatform = Extract<Platform, "bilibili" | "youtube">;

// 帖子/视频数据模型
export interface Post {
  id: string;
  platform: Platform;
  author: string;
  authorUrl?: string;
  content: string;
  mediaUrls?: string[];
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  heatScore: number;
  pageUrl: string;
  extractedAt: number;
}

// 关键词模型
export interface Keyword {
  id: string;
  text: string;
  category?: string;
  createdAt: number;
  lastSearchedAt?: number;
}

// 备忘录模型
export interface Memo {
  id: string;
  title: string;
  content: string; // Markdown
  category: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  isPinned: boolean;
}

// 回复草稿模型
export interface ReplyDraft {
  id: string;
  targetPostId: string;
  content: string;
  status: "draft" | "pending" | "sent";
  createdAt: number;
  sentAt?: number;
}

export interface PublishContext {
  platform: PublishPlatform;
  pageUrl: string;
  isUploadPage: boolean;
  title: string;
  description: string;
  tags: string[];
  coverSupported: boolean;
  existingCoverUrl?: string | null;
  warnings: string[];
}

export interface PublishAssetsInput {
  title: string;
  description: string;
  tags: string[];
  coverUrl?: string;
}

export interface PublishAssetsApplyResult {
  success: boolean;
  error?: string;
  filledFields?: string[];
  warnings?: string[];
}

export interface GeneratedPublishAssets {
  titles: string[];
  description: string;
  tags: string[];
  coverUrl?: string;
  coverPrompt?: string;
  checklist: string[];
  warnings?: string[];
}

// 消息类型 (Background <-> Content Script <-> Sidebar)
export type MessageType =
  | "SEARCH_POSTS"
  | "EXTRACT_AND_SCROLL"
  | "POSTS_PARSED"
  | "INJECT_COMMENT"
  | "GET_PUBLISH_CONTEXT"
  | "FILL_PUBLISH_ASSETS"
  | "RUN_COMMENT_TASKS"
  | "INJECT_COMMENT_RESULT"
  | "GET_KEYWORDS"
  | "SAVE_KEYWORD"
  | "DELETE_KEYWORD"
  | "GET_MEMOS"
  | "SAVE_MEMO"
  | "DELETE_MEMO"
  | "ERROR"
  | "PING";

export interface Message {
  type: MessageType;
  [key: string]: any;
}

// Yinli 隐力集成接口模型
export interface YinliProduct {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

export interface YinliStrategy {
  id: number;
  signalId: number;
  type: string; // EMPATH, EXPERT, PLUG
  content: string;
  reasoning: string;
  createdAt: string;
  approvedForSniping?: boolean;
}

export interface YinliSignal {
  id: number;
  userId: string;
  productId: string | null;
  battlefieldId: string | null;
  source: string;
  url: string;
  title: string;
  textContent: string;
  author: string | null;
  publishedAt: string | null;
  scoutedAt: string;
  status: string; // NEW, IGNORED, APPROVED, POSTED
  qualityScore: number | null;
  strategies: YinliStrategy[];
  battlefield?: {
    id: string;
    name: string;
    url: string;
  };
}
