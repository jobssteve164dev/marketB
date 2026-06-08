import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class FacebookAdapter extends BaseAdapter {
  platform: 'facebook' = 'facebook';

  extractPosts(): Post[] {
    const posts: Post[] = [];
    const cards = document.querySelectorAll('div[role="article"]');

    cards.forEach((card, index) => {
      try {
        // 1. 查找文本内容 (增加 Fallback 并适配普通图文帖子)
        const textSelectors = [
          '[data-ad-preview="message"]',
          '[data-ad-comet-preview="message"]',
          '[data-ad-rendering-role="story_message"]',
          'div[dir="auto"]'
        ];
        
        let content = '';
        for (const selector of textSelectors) {
          const elements = card.querySelectorAll(selector);
          for (const el of Array.from(elements)) {
            // 排除包含在链接、strong、标题中的作者或元数据信息
            if (el.closest('a') || el.closest('strong') || el.closest('h3') || el.closest('h2') || el.closest('[role="link"]')) {
              continue;
            }
            const txt = (el.textContent || '').trim();
            // 排除常见的操作按钮文本与单字元数据
            if (txt && txt.length > 2 && !/^(?:赞|回复|分享|评论|Like|Reply|Share|Comment)$/i.test(txt)) {
              content = txt;
              break;
            }
          }
          if (content) break;
        }
        
        if (!content) return; // 过滤无文本帖子

        // 2. 查找帖子详情链接和 ID
        let pageUrl = '';
        let id = '';
        
        const links = card.querySelectorAll('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/permalink/"], a[href*="/videos/"], a[href*="/photos/"]');
        for (const link of Array.from(links)) {
          const href = (link as HTMLAnchorElement).href;
          if (href && !href.includes('/reactions') && !href.includes('/comments')) {
            pageUrl = href;
            break;
          }
        }

        if (!pageUrl) {
          pageUrl = window.location.href;
          id = `fb-${index}-${Date.now()}`;
        } else {
          try {
            const parsedUrl = new URL(pageUrl);
            const fbid = parsedUrl.searchParams.get('story_fbid') || parsedUrl.searchParams.get('fbid');
            if (fbid) {
              id = fbid;
            } else {
              const matches = pageUrl.match(/\/posts\/(\d+)/) || pageUrl.match(/\/permalink\/(\d+)/) || pageUrl.match(/\/videos\/(\d+)/);
              id = matches ? matches[1] : `fb-${index}-${Date.now()}`;
            }
          } catch {
            id = `fb-${index}-${Date.now()}`;
          }
        }

        // 3. 查找作者信息
        const authorEl = card.querySelector('strong a, h3 a, [role="link"]') as HTMLElement | null;
        const author = authorEl ? (authorEl.textContent || '').trim() : 'Facebook User';

        // 4. 提取互动量
        let likes = 0;
        let comments = 0;
        let shares = 0;

        const allSpans = card.querySelectorAll('span');
        allSpans.forEach(span => {
          const text = (span.textContent || '').trim();
          const label = span.getAttribute('aria-label') || '';
          
          if (label.includes('Like') || label.includes('赞') || label.includes('Reaction') || label.includes('反应')) {
            const num = this.parseInteractionNumber(label || text);
            if (num > likes) likes = num;
          }
          
          if (text.includes('comments') || text.includes('评论') || text.includes('comment')) {
            const num = this.parseInteractionNumber(text);
            if (num > comments) comments = num;
          }
          
          if (text.includes('shares') || text.includes('分享') || text.includes('share')) {
            const num = this.parseInteractionNumber(text);
            if (num > shares) shares = num;
          }
        });

        // 计算热度分值
        const heatScore = Math.round(comments * 0.3 + likes * 0.2 + shares * 0.5);

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
        console.error('Error parsing Facebook article renderer:', err);
      }
    });

    // 对帖子进行去重
    const uniquePosts = this.filterUniquePosts(posts);

    return uniquePosts.sort((a, b) => b.heatScore - a.heatScore);
  }

  private parseInteractionNumber(text: string): number {
    const match = text.match(/(\d+(?:,\d+)?(?:\.\d+)?\s*(?:万|亿|k|m)?)/i);
    if (!match) return 0;
    const cleanNumStr = match[1].replace(/,/g, '');
    return this.parseNumber(cleanNumStr);
  }

  async injectComment(_postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean> {
    try {
      let inputArea: HTMLElement | null = null;

      for (let i = 0; i < 15; i++) {
        inputArea = document.querySelector(
          'div[role="textbox"][contenteditable="true"]'
        ) as HTMLElement | null;

        if (inputArea) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!inputArea) {
        console.warn('Facebook comment input editor not found.');
        return false;
      }

      inputArea.focus();
      document.execCommand('insertText', false, commentText);

      if (inputArea.innerText !== commentText) {
        inputArea.innerText = commentText;
        inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      }

      inputArea.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (autoSubmit) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        inputArea.dispatchEvent(enterEvent);

        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
        }, 2500);
      }

      return true;
    } catch (err) {
      console.error('Failed to inject comment into Facebook:', err);
      return false;
    }
  }
}
