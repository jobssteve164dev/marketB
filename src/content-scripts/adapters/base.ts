import type {
  Post,
  Platform,
  PublishAssetsApplyResult,
  PublishAssetsInput,
  PublishContext
} from '../../shared/types.js';

export abstract class BaseAdapter {
  abstract platform: Platform;
  
  // 提取页面中的帖子/视频列表
  abstract extractPosts(): Post[];
  
  // 自动将评论填充到对应视频的评论输入框中，支持可选的自动发送提交
  abstract injectComment(postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean>;

  // 上传页上下文采集
  async getPublishContext(): Promise<PublishContext | null> {
    return null;
  }

  // 上传页资产回填
  async fillPublishAssets(_assets: PublishAssetsInput): Promise<PublishAssetsApplyResult> {
    return {
      success: false,
      error: '当前页面暂不支持资产回填'
    };
  }
  
  // 将文本（如 "1.2万", "4.5K", "100"）解析为数字
  protected parseNumber(str: string | null | undefined): number {
    if (!str) return 0;
    const s = str.trim().toLowerCase();
    
    // 中文处理
    if (s.includes('万')) {
      const val = parseFloat(s.replace('万', ''));
      return isNaN(val) ? 0 : Math.round(val * 10000);
    }
    if (s.includes('亿')) {
      const val = parseFloat(s.replace('亿', ''));
      return isNaN(val) ? 0 : Math.round(val * 100000000);
    }
    
    // 英文处理
    if (s.includes('k')) {
      const val = parseFloat(s.replace('k', ''));
      return isNaN(val) ? 0 : Math.round(val * 1000);
    }
    if (s.includes('m')) {
      const val = parseFloat(s.replace('m', ''));
      return isNaN(val) ? 0 : Math.round(val * 1000000);
    }
    
    // 纯数字提取
    const clean = s.replace(/[^\d.]/g, '');
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  }

  // 根据帖子 ID 过滤去重
  protected filterUniquePosts(posts: Post[]): Post[] {
    const seen = new Set<string>();
    return posts.filter(post => {
      if (!post.id || seen.has(post.id)) {
        return false;
      }
      seen.add(post.id);
      return true;
    });
  }
}
