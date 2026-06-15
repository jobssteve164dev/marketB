// Background Service Worker

interface CommentTask {
  id: string;
  pageUrl: string;
  commentText: string;
  autoSubmit?: boolean;
}

interface CommentTaskResult {
  id: string;
  success: boolean;
  error?: string;
  reusedTab?: boolean;
}

interface MarketScrapeRequest {
  url: string;
  kind: 'openvsx-search' | 'openvsx-detail' | 'chrome-search' | 'chrome-detail';
  targetId?: string;
  keyword?: string;
}

interface MarketScrapeItem {
  id: string;
  name: string;
  description?: string;
  downloads?: number;
  rating?: number;
  reviewCount?: number;
  icon?: string;
  url: string;
}

interface MarketScrapeResult {
  url: string;
  title: string;
  text: string;
  items: MarketScrapeItem[];
  detail?: MarketScrapeItem & {
    category?: string;
    version?: string;
  };
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Marketing Sidebar] Background worker successfully active.');
  
  // 配置点击插件工具栏图标时，直接拉起侧边栏面板 (Side Panel)
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error('Failed to configure sidePanel behavior:', error));
  }
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const autoCloseTabIds = new Set<number>();

const normalizeTargetUrl = (url?: string) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('bilibili.com')) {
      const bvid = parsed.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1];
      return bvid ? `bilibili:${bvid}` : `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    }
    if (parsed.hostname.includes('youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      return videoId ? `youtube:${videoId}` : `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    }
    if (parsed.hostname.includes('twitter.com') || parsed.hostname.includes('x.com')) {
      const statusId = parsed.pathname.match(/\/status\/(\d+)/)?.[1];
      return statusId ? `twitter:${statusId}` : `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    }
    if (parsed.hostname.includes('facebook.com')) {
      const fbid = parsed.searchParams.get('story_fbid') || parsed.pathname.match(/\/posts\/(\d+)/)?.[1] || parsed.pathname.match(/\/permalink\/(\d+)/)?.[1];
      return fbid ? `facebook:${fbid}` : `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url.split('#')[0].split('?')[0].replace(/\/$/, '');
  }
};

const findExistingTargetTab = async (pageUrl: string) => {
  const targetKey = normalizeTargetUrl(pageUrl);
  if (!targetKey) return null;

  const tabs = await chrome.tabs.query({});
  return tabs.find(tab => normalizeTargetUrl(tab.url) === targetKey) || null;
};

const waitForTabComplete = (tabId: number, timeoutMs = 20000) => {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('目标网页加载超时'));
    }, timeoutMs);

    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== tabId || changeInfo.status !== 'complete' || settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
};

const runCommentTask = async (task: CommentTask): Promise<CommentTaskResult> => {
  let tabId: number | undefined;
  let createdByTask = false;

  try {
    const existingTab = await findExistingTargetTab(task.pageUrl);
    const tab = existingTab || await chrome.tabs.create({ url: task.pageUrl, active: false });
    tabId = tab.id;
    createdByTask = !existingTab;
    if (!tabId) throw new Error(createdByTask ? '后台标签页创建失败' : '已打开标签页不可用');
    if (createdByTask) autoCloseTabIds.add(tabId);

    if (tab.status !== 'complete') {
      await waitForTabComplete(tabId).catch(async () => {
        const currentTab = await chrome.tabs.get(tabId!);
        if (currentTab.status !== 'complete') throw new Error('目标网页加载超时');
      });
    }

    await wait(1800);

    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'INJECT_COMMENT',
      postId: task.id,
      commentText: task.commentText,
      autoSubmit: task.autoSubmit
    });

    if (!response?.success) {
      throw new Error(response?.error || '评论填充或发送失败');
    }

    return { id: task.id, success: true, reusedTab: !createdByTask };
  } catch (err: any) {
    return { id: task.id, success: false, error: err?.message || '后台评论任务失败' };
  }
};

const runCommentTasks = async (tasks: CommentTask[], intervalMs = 2200) => {
  const results: CommentTaskResult[] = [];

  for (const task of tasks) {
    const result = await runCommentTask(task);
    results.push(result);
    await wait(intervalMs);
  }

  return results;
};

const runMarketScrape = async (request: MarketScrapeRequest): Promise<MarketScrapeResult> => {
  let tabId: number | undefined;

  try {
    const tab = await chrome.tabs.create({ url: request.url, active: false });
    tabId = tab.id;
    if (!tabId) throw new Error('市场页面打开失败');

    if (tab.status !== 'complete') {
      await waitForTabComplete(tabId, 30000).catch(async () => {
        const currentTab = await chrome.tabs.get(tabId!);
        if (currentTab.status !== 'complete') throw new Error('市场页面加载超时');
      });
    }

    await wait(2500);

    const [scrape] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [request.kind, request.targetId || '', request.keyword || ''],
      func: async (kind: MarketScrapeRequest['kind'], targetId: string, _keyword: string): Promise<MarketScrapeResult> => {
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        const normalizeText = (value?: string | null) => (value || '').replace(/\s+/g, ' ').trim();
        const parseMarketNumber = (value?: string | null) => {
          const raw = normalizeText(value);
          const match = raw.match(/([\d,.]+)\s*([kKmMbB万億亿])?/);
          if (!match) return 0;
          const base = Number(match[1].replace(/,/g, ''));
          if (!Number.isFinite(base)) return 0;
          const suffix = (match[2] || '').toLowerCase();
          if (suffix === 'k') return Math.round(base * 1000);
          if (suffix === 'm') return Math.round(base * 1000000);
          if (suffix === 'b') return Math.round(base * 1000000000);
          if (suffix === '万') return Math.round(base * 10000);
          if (suffix === '亿' || suffix === '億') return Math.round(base * 100000000);
          return Math.round(base);
        };
        const findContainer = (node: Element) => {
          let current: Element | null = node;
          let best: Element = node;
          for (let i = 0; i < 7 && current?.parentElement; i++) {
            const text = normalizeText(current.textContent);
            if (text.length > normalizeText(best.textContent).length && text.length < 1500) {
              best = current;
            }
            current = current.parentElement;
          }
          return best;
        };
        const getMeta = (selector: string) => document.querySelector<HTMLMetaElement>(selector)?.content || '';
        const readRating = (text: string) => {
          const match = text.match(/(?:rating|rated|评分|平均评分)[^\d]{0,20}([0-5](?:\.\d)?)/i) || text.match(/([0-5](?:\.\d)?)\s*(?:stars?|★|星)/i);
          return match ? Number(match[1]) || 0 : 0;
        };
        const readReviewCount = (text: string) => {
          const match = text.match(/([\d,.]+\s*[kKmMbB万億亿]?)\s*(?:ratings?|reviews?|评价|评分)/i);
          return parseMarketNumber(match?.[1]);
        };
        const readDownloads = (text: string) => {
          const match = text.match(/([\d,.]+\s*[kKmMbB万億亿]?)\+?\s*(?:downloads?|installs?|users?|下载|用户|位用户)/i);
          return parseMarketNumber(match?.[1]);
        };
        const readDescription = (container: Element, fallback = '') => {
          const candidates = Array.from(container.querySelectorAll<HTMLElement>('p, span, div'))
            .map(el => normalizeText(el.textContent))
            .filter(text => text.length >= 24 && text.length <= 320);
          return candidates.find(text => !/downloads?|installs?|users?|rating|reviews?|下载|用户|评分|评价/i.test(text)) || fallback;
        };
        const absoluteUrl = (href: string) => new URL(href, location.href).href;
        const readItems = () => {
          const itemMap = new Map<string, MarketScrapeItem>();
          const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));

          for (const anchor of anchors) {
            const href = absoluteUrl(anchor.getAttribute('href') || '');
            let id = '';
            if (kind.startsWith('openvsx')) {
              const match = href.match(/\/extension\/([^/?#]+)\/([^/?#]+)/i);
              if (match) id = `${decodeURIComponent(match[1])}.${decodeURIComponent(match[2])}`;
            } else if (kind.startsWith('chrome')) {
              const match = href.match(/\/detail\/(?:[^/?#]+\/)?([a-z]{32})(?:[/?#]|$)/i);
              if (match) id = match[1].toLowerCase();
            }
            if (!id || itemMap.has(id)) continue;

            const container = findContainer(anchor);
            const text = normalizeText(container.textContent);
            const img = container.querySelector<HTMLImageElement>('img');
            const name = normalizeText(anchor.textContent) ||
              normalizeText(container.querySelector('h1,h2,h3,[role="heading"]')?.textContent) ||
              id;

            itemMap.set(id, {
              id,
              name,
              description: readDescription(container),
              downloads: readDownloads(text),
              rating: readRating(text),
              reviewCount: readReviewCount(text),
              icon: img?.src || '',
              url: href
            });
          }

          return Array.from(itemMap.values()).slice(0, 100);
        };

        for (let attempt = 0; attempt < 16; attempt++) {
          const items = readItems();
          const hasTarget = targetId ? items.some(item => item.id.toLowerCase() === targetId.toLowerCase()) : items.length > 0;
          if (items.length >= 3 || hasTarget) break;
          window.scrollTo(0, Math.min(document.body.scrollHeight, 900 + attempt * 300));
          await sleep(750);
        }

        const title = normalizeText(document.title);
        const text = normalizeText(document.body?.innerText || '');
        const items = readItems();

        const detailText = text;
        const detailName = normalizeText(document.querySelector('h1,[role="heading"]')?.textContent) ||
          title.replace(/\s*-\s*(Open VSX Registry|Chrome Web Store|Chrome 应用商店).*$/i, '').trim();
        const detail: MarketScrapeResult['detail'] = {
          id: targetId || items[0]?.id || '',
          name: detailName || targetId || items[0]?.name || '',
          description: getMeta('meta[name="description"]') || getMeta('meta[property="og:description"]') || items[0]?.description || '',
          downloads: readDownloads(detailText) || items[0]?.downloads || 0,
          rating: readRating(detailText) || items[0]?.rating || 0,
          reviewCount: readReviewCount(detailText) || items[0]?.reviewCount || 0,
          icon: getMeta('meta[property="og:image"]') || items[0]?.icon || '',
          url: location.href,
          category: '',
          version: ''
        };

        const categoryMatch = detailText.match(/(?:Category|Categories|分类)\s+([A-Za-z][A-Za-z &-]{2,40})/i);
        if (categoryMatch) detail.category = normalizeText(categoryMatch[1]);
        const versionMatch = detailText.match(/(?:Version|版本)\s+([\w.-]+)/i);
        if (versionMatch) detail.version = versionMatch[1];

        return { url: location.href, title, text, items, detail };
      }
    });

    if (!scrape?.result) throw new Error('市场页面数据提取失败');
    return scrape.result;
  } finally {
    if (tabId) {
      await chrome.tabs.remove(tabId).catch(() => undefined);
    }
  }
};

// 后台消息守护路由
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true, status: 'alive' });
  } else if (message.type === 'CLOSE_TAB') {
    if (sender.tab && sender.tab.id) {
      const senderTabId = sender.tab.id;
      if (autoCloseTabIds.has(senderTabId)) {
        autoCloseTabIds.delete(senderTabId);
        chrome.tabs.remove(senderTabId);
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'No tab ID found in sender' });
    }
  } else if (message.type === 'RUN_COMMENT_TASKS') {
    const tasks = Array.isArray(message.tasks) ? message.tasks : [];
    if (tasks.length === 0) {
      sendResponse({ success: false, error: '没有可执行的任务目标' });
      return true;
    }

    runCommentTasks(tasks, message.intervalMs)
      .then(results => {
        const failed = results.filter(result => !result.success);
        sendResponse({
          success: failed.length === 0,
          results,
          error: failed.length > 0 ? `${failed.length} 个任务处理失败` : undefined
        });
      })
      .catch((err: any) => {
        sendResponse({ success: false, error: err?.message || '后台任务执行失败' });
      });
  } else if (message.type === 'SCRAPE_MARKET_PAGE') {
    runMarketScrape(message.request)
      .then(result => {
        sendResponse({ success: true, result });
      })
      .catch((err: any) => {
        sendResponse({ success: false, error: err?.message || '市场页面抓取失败' });
      });
  }
  return true;
});
