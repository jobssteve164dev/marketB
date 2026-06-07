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

  async injectComment(_postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean> {
    try {
      let placeholderArea: HTMLElement | null = null;
      let inputArea: HTMLElement | null = null;
      
      // 轮询滚动以加载评论区
      for (let i = 0; i < 10; i++) {
        // 先尝试查找占位符和输入区
        placeholderArea = document.querySelector('#simplebox-placeholder') as HTMLElement | null;
        inputArea = document.querySelector(
          '#contenteditable-root, div[contenteditable="true"]#contenteditable-root, ytd-commentbox-renderer #contenteditable-root'
        ) as HTMLElement | null;
        
        if (placeholderArea || inputArea) break;
        
        // 自动轻微滚动，触发 YouTube 评论区懒加载
        window.scrollBy(0, 350);
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      
      // 如果找到了占位符，模拟点击展开真实的输入框
      if (placeholderArea && !inputArea) {
        placeholderArea.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        inputArea = document.querySelector(
          '#contenteditable-root, div[contenteditable="true"]#contenteditable-root, ytd-commentbox-renderer #contenteditable-root'
        ) as HTMLElement | null;
      }
      
      if (!inputArea) {
        console.warn('YouTube comment input editor not found after scrolling retries.');
        return false;
      }
      
      inputArea.focus();
      inputArea.innerText = commentText;
      
      // 触发输入事件使 YouTube 框架内的“评论”按钮高亮可用
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      
      // 滚动到该输入区域以便用户看到
      inputArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // 自动提交评论模式
      if (autoSubmit) {
        // 延迟等待数据同步
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // 查找 YouTube 评论提交按钮
        const submitBtn = document.querySelector(
          'ytd-button-renderer#submit-button button, ytd-button-renderer#submit-button a, #submit-button paper-button, ytd-button-renderer#submit-button'
        ) as HTMLElement | null;
        
        if (submitBtn) {
          submitBtn.click();
          
          // 延迟 2.5 秒保证 YouTube 的评论提交接口返回，然后通知后台关闭当前页
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
          }, 2500);
        } else {
          console.warn('YouTube comment submit button not found.');
        }
      }
      
      return true;
    } catch (err) {
      console.error('Failed to inject comment into YouTube:', err);
      return false;
    }
  }
}
