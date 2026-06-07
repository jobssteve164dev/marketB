import { getAdapterForCurrentPage } from './adapters/factory.js';
import type { Message } from '../shared/types.js';

console.log('[Marketing Sidebar] Content script active on:', window.location.hostname);

// 监听来自插件后台(Background)或侧边栏(Sidebar)的指令消息
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  const adapter = getAdapterForCurrentPage();
  if (!adapter) {
    sendResponse({ success: false, error: 'No adapter matched for this website.' });
    return true;
  }

  if (message.type === 'SEARCH_POSTS') {
    try {
      // 提取本页面的视频并返回
      const posts = adapter.extractPosts();
      sendResponse({ success: true, posts });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message || 'Error occurred while extracting posts.' });
    }
  } else if (message.type === 'INJECT_COMMENT') {
    const { postId, commentText } = message;
    // 异步执行评论填充
    adapter.injectComment(postId, commentText)
      .then(success => {
        sendResponse({ success });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message || 'Error occurred while injecting comment.' });
      });
    return true; // 返回 true 以支持异步 sendResponse
  } else if (message.type === 'PING') {
    // 仅用于连通性探针
    sendResponse({ success: true, platform: adapter.platform });
  }
  
  return true;
});
