import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class BilibiliAdapter extends BaseAdapter {
  platform: 'bilibili' = 'bilibili';

  private pickStatText(card: Element, kind: 'play' | 'danmaku', fallbackIndex: number): string {
    const directSelectors = kind === 'play'
      ? [
          '.bili-video-card__stats--play',
          '.bili-video-card__stats--item[title*="播放"]',
          '.bili-video-card__stats--item[aria-label*="播放"]',
          '[class*="play"]',
          '.watch-num',
          '.play-text'
        ]
      : [
          '.bili-video-card__stats--danmaku',
          '.bili-video-card__stats--item[title*="弹幕"]',
          '.bili-video-card__stats--item[aria-label*="弹幕"]',
          '[class*="danmaku"]',
          '.hide-danmaku',
          '.danmaku-text'
        ];

    for (const selector of directSelectors) {
      const element = card.querySelector(selector) as HTMLElement | null;
      const text = this.readStatElementText(element);
      if (text) return text;
    }

    const statItems = Array.from(card.querySelectorAll(
      '.bili-video-card__stats--item, .bili-video-card__stats--text, [class*="stats"] span'
    )) as HTMLElement[];
    const usefulTexts = statItems
      .map(element => this.readStatElementText(element))
      .filter(Boolean);

    return usefulTexts[fallbackIndex] || '0';
  }

  private readStatElementText(element: HTMLElement | null): string {
    if (!element) return '';
    const title = element.getAttribute('title') || element.getAttribute('aria-label') || '';
    const text = `${title} ${element.textContent || ''}`.replace(/\s+/g, ' ').trim();
    const match = text.match(/(\d+(?:\.\d+)?\s*(?:万|亿|k|m)?)/i);
    return match ? match[1] : '';
  }

  extractPosts(): Post[] {
    const posts: Post[] = [];
    // Bilibili 搜索列表页的视频卡片选择器
    const cards = document.querySelectorAll('.bili-video-card, .video-list-item, .video-item');
    
    cards.forEach((card, index) => {
      try {
        // 过滤非视频卡片：如UP主用户卡片、直播卡片等，防止干扰热门视频判断
        if (
          card.classList.contains('user-item') || 
          card.querySelector('.up-face') || 
          card.querySelector('.bili-user-card') ||
          card.querySelector('.bili-liver-card')
        ) {
          return;
        }

        // 查找视频链接
        const linkEl = card.querySelector('a[href*="/video/"]') as HTMLAnchorElement | null;
        if (!linkEl) return;
        
        let pageUrl = linkEl.href;
        if (pageUrl.startsWith('//')) {
          pageUrl = 'https:' + pageUrl;
        } else if (pageUrl.startsWith('/')) {
          pageUrl = 'https://www.bilibili.com' + pageUrl;
        }
        
        // 提取 BVID
        const bvidMatch = pageUrl.match(/video\/(BV[a-zA-Z0-9]+)/);
        const id = bvidMatch ? bvidMatch[1] : `bili-${index}-${Date.now()}`;
        
        // 提取视频标题
        const titleEl = card.querySelector('.bili-video-card__info--tit, .title, .video-title') as HTMLElement | null;
        const content = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';
        if (!content) return;
        
        // 提取 UP 主姓名
        const authorEl = card.querySelector('.bili-video-card__info--author, .up-name, .up-info') as HTMLElement | null;
        const author = authorEl ? (authorEl.textContent || '').trim() : 'Bilibili UP主';
        
        const playText = this.pickStatText(card, 'play', 0);
        const danmakuText = this.pickStatText(card, 'danmaku', 1);
        
        const playCount = this.parseNumber(playText);
        const danmakuCount = this.parseNumber(danmakuText);
        
        // Bilibili 搜索页拿不到具体点赞数和评论数，我们用播放量代指 Likes，弹幕数代指 Comments
        const likes = playCount;
        const comments = danmakuCount;
        const shares = 0;
        
        // 计算热度分值（播放量权重 0.2，弹幕数权重 0.8，弹幕互动性更强）
        const heatScore = Math.round(likes * 0.2 + comments * 0.8);
        
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
        console.error('Error parsing Bilibili video card:', err);
      }
    });
    
    // 按热度得分从高到低排序
    return posts.sort((a, b) => b.heatScore - a.heatScore);
  }

  async injectComment(_postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean> {
    let textarea: HTMLTextAreaElement | null = null;
    
    // 轮询最多 10 次检测，若未渲染则每次滚动并等待 300ms 触发懒加载
    for (let i = 0; i < 10; i++) {
      textarea = document.querySelector(
        'textarea.reply-box-textarea, .reply-textarea, .reply-box-textarea, textarea[placeholder*="发一条"], textarea[placeholder*="评论"], textarea.ipt-txt'
      ) as HTMLTextAreaElement | null;
      
      if (textarea) break;
      
      // 未发现输入框时，自动轻微向下滚动页面以触发评论区懒加载
      window.scrollBy(0, 350);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (!textarea) {
      console.warn('Bilibili comment input textarea not found after retries.');
      return false;
    }
    
    textarea.focus();
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, commentText);
    if (textarea.value !== commentText) {
      textarea.value = commentText;
    }
    
    // 触发输入事件，使网页框架能够监听到输入框的变动
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 平滑滚动至评论输入框
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // 自动发布并关闭页面模式
    if (autoSubmit) {
      // 延迟 800ms 等待 React 组件将输入内容绑定到组件状态
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 定位发送按钮
      const sendButton = document.querySelector(
        '.reply-box-send, button.reply-box-send, .send-btn, .reply-btn, button[class*="send"]'
      ) as HTMLElement | null;
      
      if (sendButton) {
        sendButton.click();
        
        // 延迟 2 秒保证接口发送请求发出，然后通知后台关闭此页
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
        }, 2000);
      } else {
        console.warn('Bilibili send/submit button not found.');
        return false;
      }
    }
    
    return true;
  }
}
