import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class TwitterAdapter extends BaseAdapter {
  platform: 'twitter' = 'twitter';

  extractPosts(): Post[] {
    const posts: Post[] = [];
    const cards = document.querySelectorAll('article[data-testid="tweet"]');

    cards.forEach((card, index) => {
      try {
        // 1. 查找推文详情链接和 ID
        const linkEl = card.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        if (!linkEl) return;
        const pageUrl = linkEl.href;
        const statusMatch = pageUrl.match(/\/status\/(\d+)/);
        const id = statusMatch ? statusMatch[1] : `tw-${index}-${Date.now()}`;

        // 2. 查找文本内容
        const textEl = card.querySelector('[data-testid="tweetText"]') as HTMLElement | null;
        const content = textEl ? (textEl.textContent || '').trim() : '';
        if (!content) return; // 过滤无文本推文

        // 3. 查找作者信息
        const authorEl = card.querySelector('[data-testid="User-Name"]') as HTMLElement | null;
        let author = 'X User';
        if (authorEl) {
          author = (authorEl.textContent || '').trim();
        }

        // 4. 提取互动量 (likes, comments, shares)
        const likeEl = card.querySelector('[data-testid="like"], [data-testid="unlike"]') as HTMLElement | null;
        const likesText = likeEl ? (likeEl.textContent || likeEl.getAttribute('aria-label') || '0') : '0';
        const likes = this.parseInteractionNumber(likesText);

        const replyEl = card.querySelector('[data-testid="reply"]') as HTMLElement | null;
        const commentsText = replyEl ? (replyEl.textContent || replyEl.getAttribute('aria-label') || '0') : '0';
        const comments = this.parseInteractionNumber(commentsText);

        const retweetEl = card.querySelector('[data-testid="retweet"], [data-testid="repost"]') as HTMLElement | null;
        const sharesText = retweetEl ? (retweetEl.textContent || retweetEl.getAttribute('aria-label') || '0') : '0';
        const shares = this.parseInteractionNumber(sharesText);

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
        console.error('Error parsing Twitter tweet renderer:', err);
      }
    });

    // 对帖子进行去重
    const uniquePosts = this.filterUniquePosts(posts);

    // 按热度降序排序
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

      // 轮询查找输入框
      for (let i = 0; i < 15; i++) {
        inputArea = document.querySelector(
          '[data-testid="tweetTextarea_0"], div[contenteditable="true"][role="textbox"], [data-testid="tweetTextarea_0"] div[contenteditable="true"]'
        ) as HTMLElement | null;

        if (inputArea) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!inputArea) {
        console.warn('X reply input editor not found.');
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
        await new Promise(resolve => setTimeout(resolve, 800));

        const submitBtn = document.querySelector(
          'button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
        ) as HTMLElement | null;

        if (submitBtn) {
          submitBtn.click();
          
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
          }, 2500);
        } else {
          console.warn('X reply submit button not found.');
        }
      }

      return true;
    } catch (err) {
      console.error('Failed to inject comment into X (Twitter):', err);
      return false;
    }
  }
}
