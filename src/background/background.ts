// Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Marketing Sidebar] Background worker successfully active.');
  
  // 配置点击插件工具栏图标时，直接拉起侧边栏面板 (Side Panel)
  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error('Failed to configure sidePanel behavior:', error));
  }
});

// 后台消息守护路由（为以后的后台静默任务、速率限流等功能预留）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true, status: 'alive' });
  }
  return true;
});
