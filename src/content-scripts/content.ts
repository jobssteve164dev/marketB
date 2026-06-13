import { getAdapterForCurrentPage } from './adapters/factory.js';
import type { Message } from '../shared/types.js';

console.log('[Marketing Sidebar] Content script active on:', window.location.hostname);

// 监听来自插件后台(Background)或侧边栏(Sidebar)的指令消息
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
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
  } else if (message.type === 'EXTRACT_AND_SCROLL') {
    try {
      const posts = adapter.extractPosts();
      // 触发滚动，以便下一次提取能够获得新视频
      window.scrollBy({
        top: window.innerHeight * 1.5,
        behavior: 'smooth'
      });
      sendResponse({ success: true, posts });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message || 'Error occurred while extracting posts.' });
    }
  } else if (message.type === 'INJECT_COMMENT') {
    const { postId, commentText, autoSubmit } = message;
    // 异步执行评论填充
    adapter.injectComment(postId, commentText, autoSubmit)
      .then(success => {
        sendResponse({
          success,
          error: success ? undefined : '评论填充失败，未返回具体原因'
        });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message || 'Error occurred while injecting comment.' });
      });
    return true; // 返回 true 以支持异步 sendResponse
  } else if (message.type === 'GET_PUBLISH_CONTEXT') {
    adapter.getPublishContext()
      .then((context) => {
        if (!context) {
          sendResponse({ success: false, error: '当前页面不是受支持的上传页' });
          return;
        }
        sendResponse({ success: true, context });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message || '读取发布上下文失败' });
      });
    return true;
  } else if (message.type === 'FILL_PUBLISH_ASSETS') {
    adapter.fillPublishAssets(message.assets)
      .then((result) => sendResponse(result))
      .catch((err) => {
        sendResponse({ success: false, error: err.message || '发布资产回填失败' });
      });
    return true;
  } else if (message.type === 'PING') {
    // 仅用于连通性探针
    sendResponse({ success: true, platform: adapter.platform });
  }
  
  return true;
});
