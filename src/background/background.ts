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
  }
  return true;
});
