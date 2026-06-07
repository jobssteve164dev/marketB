import { BaseAdapter } from './base.js';
import type { Post } from '../../shared/types.js';

export class BilibiliAdapter extends BaseAdapter {
  platform: 'bilibili' = 'bilibili';

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
        
        // 提取播放量和弹幕数 (解决都是 0 的问题)
        let playText = '';
        let danmakuText = '';
        
        // B站新版页面结构将数字均放入 .bili-video-card__stats--text，第1个为播放量，第2个为弹幕数
        const statsTextEls = card.querySelectorAll('.bili-video-card__stats--text');
        if (statsTextEls.length >= 2) {
          playText = statsTextEls[0].textContent || '0';
          danmakuText = statsTextEls[1].textContent || '0';
        } else {
          // 兼容旧版选择器
          const playEl = card.querySelector('.bili-video-card__stats--play, .watch-num, .play-text') as HTMLElement | null;
          const danmakuEl = card.querySelector('.bili-video-card__stats--danmaku, .hide-danmaku, .danmaku-text') as HTMLElement | null;
          playText = playEl ? playEl.textContent || '0' : '0';
          danmakuText = danmakuEl ? danmakuEl.textContent || '0' : '0';
        }
        
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

  async injectComment(postId: string, commentText: string): Promise<boolean> {
    // 尝试寻找 Bilibili 播放页的评论框
    const textarea = document.querySelector(
      'textarea.reply-box-textarea, .reply-textarea, .reply-box-textarea, textarea[placeholder*="发一条"], textarea[placeholder*="评论"], textarea.ipt-txt'
    ) as HTMLTextAreaElement | null;
    
    if (!textarea) {
      console.warn('Bilibili comment input textarea not found.');
      return false;
    }
    
    textarea.focus();
    textarea.value = commentText;
    
    // 触发输入事件，使网页框架能够监听到输入框的变动
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    
    // 平滑滚动至评论输入框
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    return true;
  }
}
