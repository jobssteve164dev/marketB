import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class BilibiliAdapter extends BaseAdapter {
  platform: 'bilibili' = 'bilibili';

  private getStatsFromCard(card: Element): { play: string; danmaku: string } {
    let play = '';
    let danmaku = '';

    // 1. 现代 B 站卡片布局中的 stats-item (.bili-video-card__stats--item)
    // 它是包裹 svg 和 text 的容器，我们直接取其 textContent 即可
    const statsItems = Array.from(card.querySelectorAll('.bili-video-card__stats--item'));
    if (statsItems.length >= 2) {
      play = statsItems[0].textContent || '';
      danmaku = statsItems[1].textContent || '';
    }

    // 2. 如果上面没拿到，尝试用特定 class 直接定位
    if (!play || !danmaku) {
      // 播放数常见 class
      const playEl = card.querySelector('.play, .watch-num, .click, .play-info, .video-play, [class*="play-count"], [class*="watch-count"]');
      // 弹幕数常见 class
      const danmuEl = card.querySelector('.danmu, .dm-num, .dm, .danmu-info, .video-danmu, [class*="danmu-count"], [class*="dm-count"]');
      
      if (playEl && !play) play = playEl.textContent || '';
      if (danmuEl && !danmaku) danmaku = danmuEl.textContent || '';
    }

    // 3. 如果还是没有，尝试从 bili-video-card__stats 容器文本中正则提取两个数字
    if (!play || !danmaku) {
      const container = card.querySelector('.bili-video-card__stats, [class*="stats-container"], .stats') as HTMLElement | null;
      if (container) {
        // 排除 duration 带来的干扰（通常 duration 在 bili-video-card__stats__duration）
        // 我们可以克隆一份，移除 duration，防止其数字干扰
        const clone = container.cloneNode(true) as HTMLElement;
        const durationEl = clone.querySelector('[class*="duration"], [class*="time"]');
        if (durationEl) {
          durationEl.remove();
        }
        const text = clone.textContent || '';
        const matches = text.replace(/\s+/g, ' ').trim().match(/(\d+(?:\.\d+)?\s*(?:万|亿|k|m)?)/g);
        if (matches) {
          if (matches.length >= 2) {
            if (!play) play = matches[0];
            if (!danmaku) danmaku = matches[1];
          } else if (matches.length === 1) {
            if (!play) play = matches[0];
            if (!danmaku) danmaku = '0';
          }
        }
      }
    }

    // 4. 清理并归一化
    const cleanNum = (str: string) => {
      return str.replace(/\s+/g, '').trim() || '0';
    };

    return {
      play: cleanNum(play),
      danmaku: cleanNum(danmaku)
    };
  }

  private isVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  }

  private queryAllDeep(selectors: string): HTMLElement[] {
    const results: HTMLElement[] = [];
    const visited = new Set<Document | ShadowRoot>();

    const collect = (root: Document | ShadowRoot) => {
      if (visited.has(root)) return;
      visited.add(root);

      results.push(...Array.from(root.querySelectorAll(selectors)) as HTMLElement[]);
      Array.from(root.querySelectorAll('*')).forEach((element) => {
        const shadowRoot = (element as HTMLElement).shadowRoot;
        if (shadowRoot) collect(shadowRoot);
      });
    };

    collect(document);
    return results.filter((element, index, arr) => arr.indexOf(element) === index);
  }

  private queryDeepWithin(rootElement: HTMLElement, selectors: string): HTMLElement | null {
    if (rootElement.matches(selectors)) return rootElement;

    const lightDomMatch = rootElement.querySelector(selectors) as HTMLElement | null;
    if (lightDomMatch) return lightDomMatch;

    const shadowRoot = rootElement.shadowRoot;
    if (!shadowRoot) return null;

    const shadowMatch = shadowRoot.querySelector(selectors) as HTMLElement | null;
    if (shadowMatch) return shadowMatch;

    for (const child of Array.from(shadowRoot.querySelectorAll('*')) as HTMLElement[]) {
      const nestedMatch = this.queryDeepWithin(child, selectors);
      if (nestedMatch) return nestedMatch;
    }

    return null;
  }

  private resolveCommentEditor(element: HTMLElement): HTMLElement | null {
    const editorSelectors = [
      'textarea',
      'input[type="text"]',
      '[contenteditable]',
      '#editor.active',
      '#editor'
    ].join(', ');

    const editor = this.queryDeepWithin(element, editorSelectors);
    return editor && this.isVisible(editor) ? editor : null;
  }

  private findCommentInput(): HTMLTextAreaElement | HTMLInputElement | HTMLElement | null {
    const selectors = [
      'bili-comments-header-renderer #editor.active',
      'bili-comments-header-renderer #editor',
      'bili-comments-comment-box #editor.active',
      'bili-comments-comment-box #editor',
      'bili-comments-rich-textarea #editor.active',
      'bili-comments-rich-textarea #editor',
      'bili-comments-rich-textarea',
      '#editor.active',
      'textarea.reply-box-textarea',
      '.reply-box-textarea',
      '.reply-textarea',
      '#reply-commentbox [contenteditable]',
      'bili-rich-textarea',
      'bili-rich-textarea [contenteditable]',
      '.bili-rich-textarea__inner',
      '.bili-rich-textarea__inner[contenteditable]',
      'textarea[placeholder*="发一条"]',
      'textarea[placeholder*="评论"]',
      'textarea.ipt-txt',
      '.reply-box [contenteditable]',
      '.reply-box-warp [contenteditable]',
      '.bili-comment-container [contenteditable]',
      '[contenteditable][data-placeholder*="评论"]',
      '[contenteditable][placeholder*="评论"]',
      '[contenteditable][aria-label*="评论"]'
    ];

    for (const selector of selectors) {
      const element = this.queryAllDeep(selector).find(candidate => this.isVisible(candidate));
      if (!element) continue;

      const innerEditable = this.resolveCommentEditor(element);
      if (innerEditable) return innerEditable;

      if (element.matches('#editor.active, #editor, .reply-box-textarea, .reply-textarea, .bili-rich-textarea__inner, bili-rich-textarea, bili-comments-rich-textarea')) {
        return element;
      }
    }

    return this.queryAllDeep('textarea, input[type="text"], [contenteditable]')
      .find((element) => {
        const target = element as HTMLElement;
        const text = [
          target.getAttribute('placeholder'),
          target.getAttribute('data-placeholder'),
          target.getAttribute('aria-label'),
          target.textContent
        ].filter(Boolean).join(' ');
        return this.isVisible(target) && /评论|回复|发一条|友善/i.test(text);
      }) as HTMLElement | null;
  }

  private setCommentInputValue(input: HTMLTextAreaElement | HTMLInputElement | HTMLElement, commentText: string): boolean {
    input.click();
    input.focus();
    const activeElement = document.activeElement as HTMLElement | null;
    const target = activeElement && this.isVisible(activeElement) && (
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLInputElement ||
      activeElement.hasAttribute('contenteditable') ||
      activeElement.matches('#editor.active, #editor, .reply-box-textarea, .reply-textarea, .bili-rich-textarea__inner')
    )
      ? activeElement
      : input;

    if (target instanceof HTMLTextAreaElement) {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      valueSetter?.call(target, commentText);
      if (target.value !== commentText) target.value = commentText;
    } else if (target instanceof HTMLInputElement) {
      const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      valueSetter?.call(target, commentText);
      if (target.value !== commentText) target.value = commentText;
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);

      const inserted = document.execCommand?.('insertText', false, commentText);
      if (!inserted || (target.textContent || '').trim() !== commentText.trim()) {
        target.innerText = commentText;
      }
    }

    target.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: commentText
    }));
    target.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: commentText
    }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

    const currentValue = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
      ? target.value
      : target.textContent || '';
    return currentValue.trim() === commentText.trim();
  }

  private findSendButton(): HTMLElement | null {
    const selectors = [
      '.reply-box-send',
      'button.reply-box-send',
      '.send-text',
      'button.send-text',
      '.send-btn',
      '.reply-btn',
      '.reply-box .send-text',
      '.bili-comment-container .reply-box-send',
      '.reply-box .reply-box-send',
      '.bili-comment-container button',
      '.reply-box button',
      'bili-comments-header-renderer button',
      'bili-comments-comment-box button',
      'bili-comments-rich-textarea button',
      'button[class*="send"]',
      'button[class*="pub"]',
      '[id*="pub"]',
      '[class*="send"]'
    ];

    const candidates = selectors
      .flatMap(selector => this.queryAllDeep(selector))
      .filter((element, index, arr) => arr.indexOf(element) === index)
      .filter((element) => {
        const text = `${element.textContent || ''} ${element.getAttribute('aria-label') || ''} ${element.className || ''}`;
        const classText = typeof element.className === 'string' ? element.className : '';
        const disabled = element.getAttribute('disabled') !== null ||
          element.getAttribute('aria-disabled') === 'true' ||
          /disabled|disable/i.test(classText);
        return this.isVisible(element) && !disabled && /发布|发送|评论|回复|send|reply/i.test(text);
      });

    return candidates[0] || null;
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
        
        const stats = this.getStatsFromCard(card);
        const playText = stats.play;
        const danmakuText = stats.danmaku;
        
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
    
    // 对帖子进行去重
    const uniquePosts = this.filterUniquePosts(posts);

    // 按热度得分从高到低排序
    return uniquePosts.sort((a, b) => b.heatScore - a.heatScore);
  }

  async injectComment(_postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean> {
    let input: HTMLTextAreaElement | HTMLInputElement | HTMLElement | null = null;
    
    for (let i = 0; i < 30; i++) {
      input = this.findCommentInput();
      
      if (input) break;
      
      const commentAnchor = this.queryAllDeep('#comment, .comment, .bili-comment-container, .reply-container, #reply-commentbox, bili-comments-header-renderer, bili-comments-comment-box, bili-comments-rich-textarea')
        .find(element => this.isVisible(element));
      if (commentAnchor) {
        commentAnchor.scrollIntoView({ behavior: 'auto', block: 'center' });
      } else {
        window.scrollBy(0, 520);
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (!input) {
      throw new Error('没有找到 B 站评论输入框，可能是评论区未加载、视频关闭评论或页面结构已变化');
    }
    
    if (!this.setCommentInputValue(input, commentText)) {
      throw new Error('评论框已定位，但页面没有接受输入内容');
    }
    
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    if (autoSubmit) {
      let sendButton: HTMLElement | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        sendButton = this.findSendButton();
        if (sendButton) break;
      }
      
      if (sendButton) {
        sendButton.click();
        
        // 延迟 2 秒保证接口发送请求发出，然后通知后台关闭此页
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
        }, 2000);
      } else {
        throw new Error('评论已填入，但没有找到可点击的发布按钮');
      }
    }
    
    return true;
  }
}
