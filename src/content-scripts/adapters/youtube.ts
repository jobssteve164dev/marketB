import { BaseAdapter } from './base.js';
import type {
  Post,
  PublishAssetsApplyResult,
  PublishAssetsInput,
  PublishContext
} from '../../shared/types.js';

export class YoutubeAdapter extends BaseAdapter {
  platform: 'youtube' = 'youtube';

  extractPosts(): Post[] {
    const posts: Post[] = [];
    const cards = document.querySelectorAll('ytd-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');

    cards.forEach((card, index) => {
      try {
        const titleLink = card.querySelector('a#video-title, a#video-title-link, #video-title') as HTMLAnchorElement | null;
        if (!titleLink) return;

        const pageUrl = titleLink.href;
        if (!pageUrl || (!pageUrl.includes('/watch?v=') && !pageUrl.includes('/shorts/') && !pageUrl.includes('youtu.be/'))) return;

        let id = '';
        const videoIdMatch = pageUrl.match(/[?&]v=([^&#]+)/);
        if (videoIdMatch) {
          id = videoIdMatch[1];
        } else {
          const shortsMatch = pageUrl.match(/\/shorts\/([^&#/?]+)/);
          if (shortsMatch) {
            id = shortsMatch[1];
          } else {
            const youtuBeMatch = pageUrl.match(/youtu\.be\/([^&#/?]+)/);
            id = youtuBeMatch ? youtuBeMatch[1] : `yt-${index}-${Date.now()}`;
          }
        }

        const content = (titleLink.textContent || titleLink.title || '').trim();
        if (!content) return;

        const authorEl = card.querySelector('#channel-info #channel-name a, ytd-channel-name a, #byline a') as HTMLElement | null;
        const author = authorEl ? (authorEl.textContent || '').trim() : 'YouTube Channel';

        const metadataSpans = card.querySelectorAll('#metadata-line span, .metadata-line span');
        let viewsText = '0';
        metadataSpans.forEach(span => {
          const text = span.textContent || '';
          if (text.includes('views') || text.includes('观看') || text.includes('次播放')) {
            viewsText = text;
          }
        });

        const viewsCount = this.parseNumber(viewsText);
        const likes = viewsCount;
        const comments = 0;
        const shares = 0;
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

    const uniquePosts = this.filterUniquePosts(posts);
    return uniquePosts.sort((a, b) => b.heatScore - a.heatScore);
  }

  async injectComment(_postId: string, commentText: string, autoSubmit?: boolean): Promise<boolean> {
    try {
      let placeholderArea: HTMLElement | null = null;
      let inputArea: HTMLElement | null = null;

      for (let i = 0; i < 10; i++) {
        placeholderArea = document.querySelector('#simplebox-placeholder') as HTMLElement | null;
        inputArea = document.querySelector(
          '#contenteditable-root, div[contenteditable="true"]#contenteditable-root, ytd-commentbox-renderer #contenteditable-root'
        ) as HTMLElement | null;

        if (placeholderArea || inputArea) break;

        window.scrollBy(0, 350);
        await new Promise(resolve => setTimeout(resolve, 350));
      }

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
      inputArea.dispatchEvent(new Event('input', { bubbles: true }));
      inputArea.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (autoSubmit) {
        await new Promise(resolve => setTimeout(resolve, 800));

        const submitBtn = document.querySelector(
          'ytd-button-renderer#submit-button button, ytd-button-renderer#submit-button a, #submit-button paper-button, ytd-button-renderer#submit-button'
        ) as HTMLElement | null;

        if (submitBtn) {
          submitBtn.click();

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

  async getPublishContext(): Promise<PublishContext | null> {
    if (!this.isUploadPage()) return null;

    const titleInput = this.findTitleInput();
    const descriptionInput = this.findDescriptionInput();
    const tagsInput = this.findTagsInput(false);

    return {
      platform: 'youtube',
      pageUrl: window.location.href,
      isUploadPage: true,
      title: this.readTextFieldValue(titleInput),
      description: this.readTextFieldValue(descriptionInput),
      tags: tagsInput ? this.splitTags(this.readTextFieldValue(tagsInput)) : [],
      coverSupported: !!this.findCoverInput(),
      existingCoverUrl: this.findExistingCoverUrl(),
      warnings: tagsInput ? [] : ['当前 YouTube 上传页未展开标签输入区，回填时会尝试自动展开更多选项']
    };
  }

  async fillPublishAssets(assets: PublishAssetsInput): Promise<PublishAssetsApplyResult> {
    if (!this.isUploadPage()) {
      return { success: false, error: '请先打开 YouTube Studio 上传页' };
    }

    const warnings: string[] = [];
    const filledFields: string[] = [];

    const titleInput = this.findTitleInput();
    if (!titleInput) {
      return { success: false, error: '未找到 YouTube 标题输入框' };
    }
    this.writeTextFieldValue(titleInput, assets.title);
    filledFields.push('title');

    const descriptionInput = this.findDescriptionInput();
    if (descriptionInput && assets.description.trim()) {
      this.writeTextFieldValue(descriptionInput, assets.description);
      filledFields.push('description');
    } else if (assets.description.trim()) {
      warnings.push('未找到 YouTube 简介输入区域');
    }

    if (assets.tags.length > 0) {
      const tagsInput = this.findTagsInput(true);
      if (tagsInput) {
        this.writeTextFieldValue(tagsInput, assets.tags.join(', '));
        tagsInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true
        }));
        filledFields.push('tags');
      } else {
        warnings.push('未找到 YouTube 标签输入框');
      }
    }

    if (assets.coverUrl) {
      const coverInput = this.findCoverInput();
      if (coverInput) {
        await this.uploadRemoteFileToInput(coverInput, assets.coverUrl, 'youtube-cover');
        filledFields.push('cover');
      } else {
        warnings.push('未找到 YouTube 封面上传控件');
      }
    }

    return {
      success: true,
      filledFields,
      warnings
    };
  }

  private isUploadPage() {
    return window.location.hostname.includes('studio.youtube.com');
  }

  private queryFirst<T extends HTMLElement>(selectors: string[]): T | null {
    for (const selector of selectors) {
      const element = document.querySelector(selector) as T | null;
      if (element) return element;
    }
    return null;
  }

  private findTitleInput(): HTMLElement | null {
    return this.queryFirst<HTMLElement>([
      '#title-textarea #textbox',
      'ytcp-social-suggestions-textbox#title-textarea #textbox',
      '[aria-label="Add a title that describes your video"]',
      '[aria-label="添加能够说明视频内容的标题"]'
    ]);
  }

  private findDescriptionInput(): HTMLElement | null {
    return this.queryFirst<HTMLElement>([
      '#description-textarea #textbox',
      'ytcp-social-suggestions-textbox#description-textarea #textbox',
      '[aria-label="Tell viewers about your video"]',
      '[aria-label="向观众介绍你的视频"]'
    ]);
  }

  private findTagsInput(expandIfNeeded: boolean): HTMLElement | null {
    let input = this.queryFirst<HTMLElement>([
      'input[aria-label="Tags"]',
      'input[aria-label="标签"]',
      'ytcp-freezable-chip-bar input'
    ]);

    if (!input && expandIfNeeded) {
      this.expandMoreOptions();
      input = this.queryFirst<HTMLElement>([
        'input[aria-label="Tags"]',
        'input[aria-label="标签"]',
        'ytcp-freezable-chip-bar input'
      ]);
    }

    return input;
  }

  private findCoverInput(): HTMLInputElement | null {
    return this.queryFirst<HTMLInputElement>([
      'ytcp-thumbnails-compact-editor-uploader input[type="file"][accept*="image"]',
      'input[type="file"][accept*="image"]'
    ]);
  }

  private findExistingCoverUrl(): string | null {
    const img = this.queryFirst<HTMLImageElement>([
      'ytcp-thumbnail-with-uploaded-image img',
      'img[src*="ytimg"]'
    ]);
    return img?.src || null;
  }

  private expandMoreOptions() {
    const button = this.queryFirst<HTMLElement>([
      'button[aria-label="Show more"]',
      'button[aria-label="显示更多"]',
      '#toggle-button'
    ]);
    button?.click();
  }

  private readTextFieldValue(element: HTMLElement | null): string {
    if (!element) return '';
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value.trim();
    }
    return (element.textContent || '').trim();
  }

  private writeTextFieldValue(element: HTMLElement, value: string) {
    element.focus();

    if (element instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (element instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    element.textContent = '';
    document.execCommand('insertText', false, value);
    if ((element.textContent || '').trim() !== value.trim()) {
      element.textContent = value;
    }
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: value,
      inputType: 'insertText'
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private splitTags(text: string) {
    return text
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  private async uploadRemoteFileToInput(input: HTMLInputElement, fileUrl: string, filePrefix: string) {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`封面下载失败: ${response.status}`);
    }

    const blob = await response.blob();
    const extension = blob.type.includes('png') ? 'png' : 'jpg';
    const file = new File([blob], `${filePrefix}.${extension}`, { type: blob.type || 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
