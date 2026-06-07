import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class YoutubeAdapter extends BaseAdapter {
  platform: 'youtube' = 'youtube';

  extractPosts(): Post[] {
    const posts: Post[] = [];
    // YouTube 搜索列表中的视频卡片选择器
    const cards = document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
    
    cards.forEach((card, index) => {
      try {
        // 提取标题和链接
        const titleLink = card.querySelector('a#video-title, a#video-title-link, #video-title') as HTMLAnchorElement | null;
        if (!titleLink) return;
        
        const pageUrl = titleLink.href;
        if (!pageUrl || !pageUrl.includes('/watch?v=')) return;
        
        // 提取视频 ID
        const videoIdMatch = pageUrl.match(/[?&]v=([^&#]+)/);
        const id = videoIdMatch ? videoIdMatch[1] : `yt-${index}-${Date.now()}`;
        
        // 提取标题内容
        const content = (titleLink.textContent || titleLink.title || '').trim();
        if (!content) return;
        
        // 提取频道（作者）
        const authorEl = card.querySelector('#channel-info #channel-name a, ytd-channel-name a, #byline a') as HTMLElement | null;
        const author = authorEl ? (authorEl.textContent || '').trim() : 'YouTube Channel';
        
        // 提取播放量元数据
        const metadataSpans = card.querySelectorAll('#metadata-line span, .metadata-line span');
        let viewsText = '0';
        metadataSpans.forEach(span => {
          const text = span.textContent || '';
          if (text.includes('views') || text.includes('观看') || text.includes('次播放')) {
            viewsText = text;
          }
        });
        
        const viewsCount = this.parseNumber(viewsText);
        
        // 映射 Likes 等于播放量，Comments 为 0（搜索页通常拿不到具体的评论数量，后续可在详情页补充）
        const likes = viewsCount;
        const comments = 0;
        const shares = 0;
        
        // 设定热度评分为播放量
        const heatScore = likes;
        
        posts.push({
          id,
          platform: this.platform,
          author,
          content,
          engagement: { likes, comments, shares },
          heatScore,
          pageUrl,
          extractedAt: Date.now()
        });
      } catch (err) {
        console.error('Error parsing YouTube video renderer:', err);
      }
    });
    
    // 按播放量热度降序排序
    return posts.sort((a, b) => b.heatScore - a.heatScore);
  }

  async injectComment(postId: string, commentText: string): Promise<boolean> {
    try {
      // YouTube 评论区是懒加载的，必须先轻微向下滚动页面才能触发渲染
      window.scrollBy(0, 350);
      
      // 等待 1.5 秒评论区渲染
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 查找占位输入区并点击，以此激活加载完整的富文本编辑器
      const placeholderArea = document.querySelector('#simplebox-placeholder') as HTMLElement | null;
      if (placeholderArea) {
        placeholderArea.click();
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // 寻找真正的输入编辑框（YouTube 使用 contenteditable 的 div）
      const inputArea = document.querySelector(
        '#contenteditable-root, div[contenteditable="true"]#contenteditable-root, ytd-commentbox-renderer #contenteditable-root'
      ) as HTMLElement | null;
      
      if (!inputArea) {
        console.warn('YouTube comment input editor not found.');
        return false;
      }
      
      inputArea.focus();
      inputArea.innerText = commentText;
      
      // 触发输入事件使 YouTube 框架内的保存按钮高亮可用
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // 滚动到该输入区域以便用户看到
      inputArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      return true;
    } catch (err) {
      console.error('Failed to inject comment into YouTube:', err);
      return false;
    }
  }
}
