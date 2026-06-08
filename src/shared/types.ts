// 支持的平台
export type Platform = "bilibili" | "youtube" | "twitter" | "facebook";

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

// 消息类型 (Background <-> Content Script <-> Sidebar)
export type MessageType =
  | "SEARCH_POSTS"
  | "POSTS_PARSED"
  | "INJECT_COMMENT"
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
