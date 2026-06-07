import React, { useState, useEffect } from 'react';
import type { Post, Keyword, Memo, Platform } from '../shared/types.js';
import { PLATFORM_CONFIG, DEFAULT_MEMO_TEMPLATES } from '../shared/constants.js';

export default function Sidebar() {
  // 视图 Tab 切换
  const [activeTab, setActiveTab] = useState<'search' | 'reply' | 'memos' | 'settings'>('search');
  
  // 核心状态数据
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeywordText, setNewKeywordText] = useState('');
  const [memos, setMemos] = useState<Memo[]>([]);
  const [newMemoTitle, setNewMemoTitle] = useState('');
  const [newMemoContent, setNewMemoContent] = useState('');
  const [newMemoCategory, setNewMemoCategory] = useState('通用');
  
  // 爬取到的视频帖子数据
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]); // 多选视频的 ID 列表
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  
  // 评论回复编辑
  const [replyText, setReplyText] = useState('');
  const [isInjecting, setIsInjecting] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true); // 是否开启自动发布评论并自动关闭标签页

  
  // 当前浏览器活动 Tab 的环境状态
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<Platform | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');
  
  // 简易通知 Toast 状态
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 1. 初始化时读取本地存储
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // 获取已存的关键词和备忘录模板
      chrome.storage.local.get(['keywords', 'memos'], (result) => {
        if (result.keywords) {
          setKeywords(result.keywords);
        } else {
          // 初始化默认关键词
          const defaultKeywords: Keyword[] = [
            { id: '1', text: 'AI效率工具', createdAt: Date.now() },
            { id: '2', text: '自媒体运营技巧', createdAt: Date.now() },
            { id: '3', text: '独立开发者副业', createdAt: Date.now() },
          ];
          setKeywords(defaultKeywords);
          chrome.storage.local.set({ keywords: defaultKeywords });
        }

        if (result.memos) {
          setMemos(result.memos);
        } else {
          // 初始化默认模板
          const defaultMemos: Memo[] = DEFAULT_MEMO_TEMPLATES.map((t) => ({
            id: t.id,
            title: t.title,
            content: t.content,
            category: t.category,
            tags: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            isPinned: false,
          }));
          setMemos(defaultMemos);
          chrome.storage.local.set({ memos: defaultMemos });
        }
      });
    } else {
      // 浏览器非插件环境 Mock 预览数据
      setKeywords([
        { id: '1', text: 'Mock-AI工具', createdAt: Date.now() },
        { id: '2', text: 'Mock-B站运营', createdAt: Date.now() }
      ]);
      setMemos(DEFAULT_MEMO_TEMPLATES.map(t => ({
        ...t, tags: [], createdAt: Date.now(), updatedAt: Date.now(), isPinned: false
      })));
      setPosts([
        {
          id: 'BV1xx411c7M',
          platform: 'bilibili',
          author: '技术UP主小张',
          content: '如何用 10 天快速落地一个全栈独立站产品？我的实战心得分享！',
          engagement: { likes: 45000, comments: 1200, shares: 0 },
          heatScore: 104500,
          pageUrl: 'https://www.bilibili.com/video/BV1xx411c7M',
          extractedAt: Date.now()
        },
        {
          id: 'yt-12345',
          platform: 'youtube',
          author: 'Tech Guru John',
          content: 'Building a Chrome Extension in 2026: The Ultimate Guide for Beginners',
          engagement: { likes: 125000, comments: 0, shares: 0 },
          heatScore: 125000,
          pageUrl: 'https://www.youtube.com/watch?v=mock',
          extractedAt: Date.now()
        }
      ]);
    }
  }, []);

  // 2. 检测并监听当前活动页面的变化
  const detectActiveTab = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        const tab = tabs[0];
        setCurrentTabId(tab.id || null);
        setCurrentUrl(tab.url || '');
        
        // 解析匹配的平台
        const urlStr = tab.url || '';
        if (urlStr.includes('bilibili.com')) {
          setCurrentPlatform('bilibili');
        } else if (urlStr.includes('youtube.com')) {
          setCurrentPlatform('youtube');
        } else {
          setCurrentPlatform(null);
        }
      }
    });
  };

  useEffect(() => {
    detectActiveTab();

    // 监听 Tab 切换和更新事件
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const handleActivated = () => detectActiveTab();
      const handleUpdated = (tabId: number, changeInfo: any) => {
        if (changeInfo.status === 'complete') {
          detectActiveTab();
        }
      };

      chrome.tabs.onActivated.addListener(handleActivated);
      chrome.tabs.onUpdated.addListener(handleUpdated);

      return () => {
        chrome.tabs.onActivated.removeListener(handleActivated);
        chrome.tabs.onUpdated.removeListener(handleUpdated);
      };
    }
  }, []);

  // 3. 执行关键词搜索跳转
  const handleSearchKeyword = (keywordText: string) => {
    if (!keywordText.trim()) return;

    // 更新最后搜索时间
    const updatedKeywords = keywords.map(kw => {
      if (kw.text.trim() === keywordText.trim()) {
        return { ...kw, lastSearchedAt: Date.now() };
      }
      return kw;
    });
    setKeywords(updatedKeywords);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ keywords: updatedKeywords });
    }

    // 获取搜索目标链接
    const targetPlatform = currentPlatform || 'bilibili';
    const searchUrl = PLATFORM_CONFIG[targetPlatform].searchUrlPattern(keywordText);

    if (typeof chrome !== 'undefined' && chrome.tabs && currentTabId) {
      chrome.tabs.update(currentTabId, { url: searchUrl }, () => {
        showToast(`正在当前页面搜索: "${keywordText}"`, 'info');
      });
    } else {
      window.open(searchUrl, '_blank');
    }
  };

  // 添加新关键词
  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordText.trim()) return;
    if (keywords.some(k => k.text.toLowerCase() === newKeywordText.trim().toLowerCase())) {
      showToast('关键词已存在', 'info');
      return;
    }

    const newKeyword: Keyword = {
      id: Date.now().toString(),
      text: newKeywordText.trim(),
      createdAt: Date.now()
    };
    const updated = [newKeyword, ...keywords];
    setKeywords(updated);
    setNewKeywordText('');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ keywords: updated });
    }
    showToast('关键词添加成功', 'success');
  };

  // 删除关键词
  const handleDeleteKeyword = (id: string) => {
    const updated = keywords.filter(k => k.id !== id);
    setKeywords(updated);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ keywords: updated });
    }
    showToast('关键词已删除', 'info');
  };

  // 4. 从当前页面抓取视频列表
  const handleExtractPosts = () => {
    if (!currentTabId || !currentPlatform) {
      showToast('请在 Bilibili 或 YouTube 的搜索页面进行抓取', 'error');
      return;
    }

    setIsLoadingPosts(true);
    showToast('正在提取页面视频数据...', 'info');

    chrome.tabs.sendMessage(currentTabId, { type: 'SEARCH_POSTS' }, (response) => {
      setIsLoadingPosts(false);
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        showToast('提取失败，请刷新目标页面并重试（确认插件已注入）', 'error');
        return;
      }

      if (response && response.success && response.posts) {
        setPosts(response.posts);
        setSelectedPostIds([]); // 重置选中的复选框
        setSelectedPost(null);
        showToast(`成功提取到 ${response.posts.length} 个视频！`, 'success');
      } else {
        showToast(response?.error || '页面中未发现支持格式的视频卡片', 'error');
      }
    });
  };

  // 5. 自动填充评论到页面 (单视频填充)
  const handleInjectComment = () => {
    if (!selectedPost) {
      showToast('请先在“视频发现”列表中选中目标视频', 'error');
      return;
    }
    if (!replyText.trim()) {
      showToast('请编写回复评论的内容', 'error');
      return;
    }
    if (!currentTabId) {
      showToast('当前无可用活动标签页', 'error');
      return;
    }

    setIsInjecting(true);
    showToast('正在填充评论区，请稍候...', 'info');

    chrome.tabs.sendMessage(currentTabId, { 
      type: 'INJECT_COMMENT',
      postId: selectedPost.id,
      commentText: replyText,
      autoSubmit: autoSubmit
    }, (response) => {
      setIsInjecting(false);
      if (chrome.runtime.lastError) {
        showToast('填充失败。请确保您当前处于该视频播放页，并且网页评论区已加载。', 'error');
        return;
      }

      if (response && response.success) {
        showToast(
          autoSubmit 
            ? '评论已自动填充并提交发布！页面稍后将自动关闭。' 
            : '评论填充成功！请在目标页面手动点击发布。', 
          'success'
        );
      } else {
        showToast('评论框定位失败！请确保评论区已加载（可尝试手动滑动滚动条）。', 'error');
      }
    });
  };

  // 6. 批量在后台新标签页打开视频并填充评论
  const handleBatchInjectComments = () => {
    if (selectedPostIds.length === 0) {
      showToast('请先勾选需要填充的视频', 'error');
      return;
    }
    if (!replyText.trim()) {
      showToast('请编写回复评论的内容', 'error');
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      showToast('当前环境不支持批量操作', 'error');
      return;
    }

    setIsInjecting(true);
    showToast(`正在启动批量任务，将处理 ${selectedPostIds.length} 个视频...`, 'info');

    const selectedPostsData = posts.filter(p => selectedPostIds.includes(p.id));

    selectedPostsData.forEach((post, index) => {
      // 间隔 2 秒依次在后台打开，防浏览器卡顿与过度操作
      setTimeout(() => {
        chrome.tabs.create({ url: post.pageUrl, active: false }, (tab) => {
          if (!tab || !tab.id) return;
          const tabId = tab.id;

          // 注册加载监听器，页面 Load 完毕后填充
          const loadListener = (updatedTabId: number, changeInfo: any) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              // 延迟 1.5 秒确保 Content Script 初始化和组件渲染
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, {
                  type: 'INJECT_COMMENT',
                  postId: post.id,
                  commentText: replyText,
                  autoSubmit: autoSubmit
                }, (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn(`Tab ${tabId} inject error:`, chrome.runtime.lastError);
                  }
                  // 移除本 tab 的监听器
                  chrome.tabs.onUpdated.removeListener(loadListener);
                });
              }, 1500);
            }
          };

          chrome.tabs.onUpdated.addListener(loadListener);
        });

        // 最后一个任务分发完毕后复位 loading
        if (index === selectedPostsData.length - 1) {
          setIsInjecting(false);
          showToast(
            autoSubmit 
              ? `已成功在后台打开 ${selectedPostsData.length} 个视频并完成自动发布！` 
              : `已成功在后台打开 ${selectedPostsData.length} 个视频并自动填充回复！请切换过去手动发送即可。`, 
            'success'
          );
        }
      }, index * 2000);
    });
  };

  // 7. 备忘录模板管理
  const handleAddMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoTitle.trim() || !newMemoContent.trim()) {
      showToast('标题和内容均不能为空', 'error');
      return;
    }

    const newMemo: Memo = {
      id: Date.now().toString(),
      title: newMemoTitle.trim(),
      content: newMemoContent.trim(),
      category: newMemoCategory,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false
    };

    const updated = [newMemo, ...memos];
    setMemos(updated);
    setNewMemoTitle('');
    setNewMemoContent('');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ memos: updated });
    }
    showToast('快捷模板保存成功', 'success');
  };

  const handleDeleteMemo = (id: string) => {
    const updated = memos.filter(m => m.id !== id);
    setMemos(updated);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ memos: updated });
    }
    showToast('模板已删除', 'info');
  };

  const handleApplyMemo = (content: string) => {
    setReplyText(content);
    setActiveTab('reply');
    showToast('模板内容已成功载入回复框', 'success');
  };

  // 辅助转换大数值
  const formatCompactNum = (num: number) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  };

  // 过滤视频列表
  const filteredPosts = posts.filter(p => 
    p.content.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.author.toLowerCase().includes(searchFilter.toLowerCase())
  );

  // 单选/多选卡片交互
  const handleSelectCard = (post: Post) => {
    setSelectedPost(post);
    // 单击卡片时，也自动将该视频设为多选里的唯一选中（或添加）
    if (!selectedPostIds.includes(post.id)) {
      setSelectedPostIds([post.id]);
    }
  };

  const handleToggleCheckbox = (postId: string, checked: boolean) => {
    if (checked) {
      setSelectedPostIds(prev => [...prev, postId]);
      // 自动把第一个勾选的设为当前单选目标
      if (!selectedPost) {
        const p = posts.find(item => item.id === postId);
        if (p) setSelectedPost(p);
      }
    } else {
      setSelectedPostIds(prev => prev.filter(id => id !== postId));
      if (selectedPost?.id === postId) {
        setSelectedPost(null);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden text-sm">
      {/* Toast 提示通知 */}
      {toast && (
        <div className={`fixed top-4 left-4 right-4 z-50 p-3 rounded-lg shadow-xl text-xs backdrop-blur-md transition-all duration-300 transform scale-100 ${
          toast.type === 'success' ? 'bg-emerald-950/90 border border-emerald-500/40 text-emerald-300' :
          toast.type === 'error' ? 'bg-rose-950/90 border border-rose-500/40 text-rose-300' :
          'bg-slate-900/95 border border-indigo-500/40 text-indigo-200'
        }`}>
          <div className="font-semibold mb-0.5">{toast.type === 'success' ? '✓ 成功' : toast.type === 'error' ? '✗ 警告' : 'ℹ 提示'}</div>
          <div>{toast.message}</div>
        </div>
      )}

      {/* Header 头部区 */}
      <header className="px-4 py-3 bg-slate-900/80 border-b border-slate-800/80 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center font-bold text-white text-xs tracking-wider shadow-md">
            M
          </div>
          <h1 className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-indigo-100 to-white">
            营销自动化助手
          </h1>
        </div>
        <div>
          {currentPlatform ? (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1.5 ${
              currentPlatform === 'bilibili' 
                ? 'bg-sky-500/10 text-sky-400 border-sky-400/20' 
                : 'bg-red-500/10 text-red-400 border-red-400/20'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
              {currentPlatform === 'bilibili' ? 'Bilibili' : 'YouTube'}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
              未匹配页面
            </span>
          )}
        </div>
      </header>

      {/* Tab 导航 */}
      <nav className="flex bg-slate-900 border-b border-slate-800/60 shrink-0 text-xs font-medium">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-all duration-200 ${
            activeTab === 'search' 
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🔍 视频发现
        </button>
        <button
          onClick={() => setActiveTab('reply')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-all duration-200 relative ${
            activeTab === 'reply' 
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📝 快捷回复
          {selectedPostIds.length > 0 && (
            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.1 bg-indigo-500 text-white rounded-full text-[8px] font-bold scale-90">
              {selectedPostIds.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('memos')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-all duration-200 ${
            activeTab === 'memos' 
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📚 话术模板
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-all duration-200 ${
            activeTab === 'settings' 
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚙️ 设置
        </button>
      </nav>

      {/* Main 主界面视图 - 改造为自适应弹性盒子 */}
      <main className="flex-1 flex flex-col min-h-0 bg-slate-950 p-4 overflow-hidden">
        
        {/* VIEW 1: 视频发现与抓取 */}
        {activeTab === 'search' && (
          <div className="flex flex-col h-full space-y-4 min-h-0">
            {/* 快捷搜 */}
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 shrink-0">
              <h2 className="text-xs font-semibold text-slate-400 mb-2 tracking-wide uppercase">快捷词库检索</h2>
              <div className="flex flex-wrap gap-1.5">
                {keywords.length > 0 ? (
                  keywords.map((kw) => (
                    <button
                      key={kw.id}
                      onClick={() => handleSearchKeyword(kw.text)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-indigo-400 border border-slate-700/50 hover:border-indigo-500/30 transition-all duration-150 active:scale-95"
                    >
                      {kw.text}
                    </button>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">暂无快捷词，可前往“设置”添加</span>
                )}
              </div>
            </div>

            {/* 抓取操作 */}
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={handleExtractPosts}
                disabled={isLoadingPosts}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {isLoadingPosts ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    正在识别网页结构...
                  </>
                ) : (
                  <>⚡ 抓取当前页面视频</>
                )}
              </button>
              {!currentPlatform && (
                <p className="text-[10px] text-slate-500 text-center">
                  *提示：请先在浏览器当前标签页打开 Bilibili 或 YouTube 搜索结果列表再进行抓取。
                </p>
              )}
            </div>

            {/* 抓取结果展示 - 实现 Flex 填充与独立滚动以去除留白 */}
            {posts.length > 0 ? (
              <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-3 border-t border-slate-800/60">
                <div className="flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-400">提取视频 ({filteredPosts.length})</h3>
                    {selectedPostIds.length > 0 && (
                      <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/10">
                        已选 {selectedPostIds.length} 个
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="过滤视频/UP主..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs w-32 focus:outline-none focus:border-indigo-500/60 transition-colors"
                  />
                </div>

                {/* 滚动卡片列表，无高度限制，完美自适应 */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-0">
                  {filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      onClick={() => handleSelectCard(post)}
                      className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 ${
                        selectedPost?.id === post.id || selectedPostIds.includes(post.id)
                          ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-500/5'
                          : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* 增加复选框用于多选发送 */}
                          <input
                            type="checkbox"
                            checked={selectedPostIds.includes(post.id)}
                            onClick={(e) => e.stopPropagation()} // 阻止触发卡片的选中逻辑
                            onChange={(e) => handleToggleCheckbox(post.id, e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500/40 focus:ring-offset-0 transition-colors cursor-pointer"
                          />
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            post.platform === 'bilibili' ? 'bg-sky-500/20 text-sky-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {post.platform === 'bilibili' ? 'B站' : 'YT'}
                          </span>
                        </div>
                        <span className="text-slate-400 text-xs font-medium truncate max-w-[140px]">
                          👤 {post.author}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed">
                        {post.content}
                      </p>
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                        <div className="flex items-center gap-3">
                          <span>👁️ {formatCompactNum(post.engagement.likes)}</span>
                          {post.platform === 'bilibili' && (
                            <span>💬 {formatCompactNum(post.engagement.comments)} (弹幕)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-indigo-400 font-semibold">🔥 {formatCompactNum(post.heatScore)}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (typeof chrome !== 'undefined' && chrome.tabs) {
                                chrome.tabs.create({ url: post.pageUrl });
                              } else {
                                window.open(post.pageUrl, '_blank');
                              }
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            title="在新窗口中打开此视频"
                          >
                            🔗
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center border-t border-slate-800/60 text-slate-500 text-xs">
                暂无抓取数据，请先抓取视频
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: 快捷回复编辑与填充 */}
        {activeTab === 'reply' && (
          <div className="flex flex-col h-full space-y-4 min-h-0">
            {/* 选中视频提示 - 改造成支持多选展示 */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 shrink-0">
              <span className="text-[10px] font-semibold text-slate-400 block mb-1.5">当前勾选的发送目标 ({selectedPostIds.length}个)：</span>
              {selectedPostIds.length > 0 ? (
                <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                  {posts.filter(p => selectedPostIds.includes(p.id)).map((post) => (
                    <div key={post.id} className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/40 p-1.5 rounded border border-slate-900/80">
                      <div className="flex items-center gap-1.5 truncate flex-1 mr-2">
                        <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                          post.platform === 'bilibili' ? 'bg-sky-500/20 text-sky-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {post.platform === 'bilibili' ? 'B站' : 'YT'}
                        </span>
                        <span className="truncate italic">"{post.content}"</span>
                      </div>
                      <button
                        onClick={() => handleToggleCheckbox(post.id, false)}
                        className="text-slate-500 hover:text-rose-400 text-[10px] font-semibold"
                        title="移出发送列表"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  ⚠️ 您还没有在“视频发现”中勾选任何视频。请先勾选视频以开启一键批量填充。
                </p>
              )}
            </div>

            {/* 回复输入框 */}
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 shrink-0">回复评论内容</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="在此编写您的推广回复、评论话术或营销内容..."
                className="flex-1 p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 resize-none leading-relaxed"
              />
              <div className="flex justify-between items-center text-[10px] text-slate-500 shrink-0">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-300 transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={autoSubmit}
                    onChange={(e) => setAutoSubmit(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500/40 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>🤖 自动发布并关闭标签页 (完全自动化)</span>
                </label>
                <span>{replyText.length} 字</span>
              </div>
            </div>

            {/* 填充执行 - 根据选中项智能选择单发/群发 */}
            {selectedPostIds.length > 1 ? (
              <button
                onClick={handleBatchInjectComments}
                disabled={isInjecting || !replyText.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shrink-0"
              >
                {isInjecting ? (
                  <>正在逐个执行后台填充...</>
                ) : (
                  <>⚡ 一键批量在后台打开并填充评论 ({selectedPostIds.length}个视频)</>
                )}
              </button>
            ) : (
              <button
                onClick={handleInjectComment}
                disabled={isInjecting || !selectedPost || !replyText.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shrink-0"
              >
                {isInjecting ? '正在填充...' : '⚡ 一键填充到当前视频页面'}
              </button>
            )}
          </div>
        )}

        {/* VIEW 3: 话术模板管理 */}
        {activeTab === 'memos' && (
          <div className="flex flex-col h-full space-y-4 min-h-0">
            {/* 新增模板表单 */}
            <form onSubmit={handleAddMemo} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/80 space-y-2.5 shrink-0">
              <h3 className="text-xs font-semibold text-slate-300">添加快捷回复模板</h3>
              <input
                type="text"
                placeholder="模板标题（如：产品反馈）"
                value={newMemoTitle}
                onChange={(e) => setNewMemoTitle(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
              />
              <textarea
                placeholder="模板内容，可用 [链接] 或 [名字] 代替动态内容"
                value={newMemoContent}
                onChange={(e) => setNewMemoContent(e.target.value)}
                rows={3}
                className="w-full p-2.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 resize-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="类别（默认：通用）"
                  value={newMemoCategory}
                  onChange={(e) => setNewMemoCategory(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors active:scale-95"
                >
                  保存
                </button>
              </div>
            </form>

            {/* 模板列表 - 高度自适应 */}
            <div className="flex-1 min-h-0 flex flex-col space-y-2">
              <h3 className="text-xs font-semibold text-slate-400 shrink-0">已存模板 ({memos.length})</h3>
              <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-0">
                {memos.map((memo) => (
                  <div key={memo.id} className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col gap-1.5 hover:border-slate-700/60">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-xs">{memo.title}</span>
                        <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/10 text-[9px]">
                          {memo.category}
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteMemo(memo.id)}
                        className="text-slate-500 hover:text-rose-400 text-xs transition-colors"
                        title="删除该模板"
                      >
                        🗑️
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2 rounded-lg border border-slate-900">
                      {memo.content}
                    </p>
                    <div className="flex items-center justify-end gap-2 mt-0.5">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(memo.content);
                          showToast('复制成功', 'success');
                        }}
                        className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors"
                      >
                        📋 仅复制
                      </button>
                      <button
                        onClick={() => handleApplyMemo(memo.content)}
                        className="px-2.5 py-1 rounded-md bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-[10px] font-semibold border border-indigo-500/20 transition-colors"
                      >
                        ✍️ 载入回复
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: 设置中心 */}
        {activeTab === 'settings' && (
          <div className="flex flex-col h-full space-y-4 min-h-0 overflow-y-auto">
            {/* 添加快捷词 */}
            <form onSubmit={handleAddKeyword} className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 space-y-2 shrink-0">
              <h3 className="text-xs font-semibold text-slate-300">添加快捷检索关键词</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="如：Vite构建, Chrome插件开发"
                  value={newKeywordText}
                  onChange={(e) => setNewKeywordText(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors active:scale-95"
                >
                  添加
                </button>
              </div>
            </form>

            {/* 关键词管理列表 */}
            <div className="space-y-2 shrink-0">
              <h3 className="text-xs font-semibold text-slate-400">词库管理</h3>
              <div className="max-h-[180px] overflow-y-auto pr-1 border border-slate-900 rounded-xl">
                {keywords.map(kw => (
                  <div key={kw.id} className="flex items-center justify-between px-3 py-2 border-b border-slate-900 last:border-0 bg-slate-900/20">
                    <span className="text-slate-300 text-xs">{kw.text}</span>
                    <button
                      onClick={() => handleDeleteKeyword(kw.id)}
                      className="text-slate-500 hover:text-rose-400 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* 项目申明 */}
            <div className="p-3 bg-indigo-950/10 border border-indigo-500/10 rounded-xl text-[10px] text-slate-500 leading-relaxed shrink-0">
              <p className="font-semibold text-slate-400 mb-1">🔒 安全性与合规声明：</p>
              <p>本插件所有数据（包括检索词、回复文本及分析缓存）均安全保存在您的本地浏览器中，绝不上报或泄露。本插件不代理任何自动评论发布，所有填充后提交动作完全由用户手动触发，遵守相关网站之 ToS。</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
