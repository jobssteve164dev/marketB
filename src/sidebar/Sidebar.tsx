import React, { useState, useEffect } from 'react';
import type { Post, Keyword, Memo, Platform, YinliProduct, YinliSignal } from '../shared/types.js';
import { PLATFORM_CONFIG, DEFAULT_MEMO_TEMPLATES } from '../shared/constants.js';

const DEFAULT_YINLI_URL = (import.meta as any).env?.VITE_YINLI_API_URL || 
  ((import.meta as any).env?.DEV ? 'http://localhost:3000' : 'https://seevoid.com');

const getAuthHeaders = (token: string): Record<string, string> => {
  if (!token) return {};
  // 识别是否是 API Key (以 yl_api_ 开头，或者是不包含 JWT 特征 '.' 的 token)
  const isApiKey = token.startsWith('yl_api_') || !token.includes('.');
  if (isApiKey) {
    return { 'X-API-Key': token };
  }
  return { 'Authorization': `Bearer ${token}` };
};

type PostActivity = {
  viewedAt?: number;
  openedAt?: number;
  handledAt?: number;
};

type PostActivityMap = Record<string, PostActivity>;

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
  const [postActivity, setPostActivity] = useState<PostActivityMap>({});
  const [filterHandledPosts, setFilterHandledPosts] = useState(true); // 跨话题过滤已回复视频
  const [isAutoScrolling, setIsAutoScrolling] = useState(false); // 是否处于自动滚屏抓取中
  const autoScrollIntervalRef = React.useRef<any>(null);
  
  // 隐力 YL 协同模式状态
  const [activeMode, setActiveMode] = useState<'local' | 'yinli'>('local');
  const [yinliApiUrl, setYinliApiUrl] = useState(DEFAULT_YINLI_URL);
  const [yinliToken, setYinliToken] = useState('');
  const [yinliUser, setYinliUser] = useState<any>(null);
  const [yinliProducts, setYinliProducts] = useState<YinliProduct[]>([]);
  const [yinliActiveProductId, setYinliActiveProductId] = useState('');
  const [yinliSignals, setYinliSignals] = useState<YinliSignal[]>([]);
  const [selectedYinliSignal, setSelectedYinliSignal] = useState<YinliSignal | null>(null);
  
  // 登录表单
  const [yinliApiKey, setYinliApiKey] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);
  
  // 评论回复编辑
  const [replyText, setReplyText] = useState('');
  const [isInjecting, setIsInjecting] = useState(false);
  const [autoSubmit, setAutoSubmit] = useState(true); // 是否开启自动发布评论并自动关闭标签页

  
  // 当前浏览器活动 Tab 的环境状态
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentPlatform, setCurrentPlatform] = useState<Platform | null>(null);
  
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
      chrome.storage.local.get([
        'keywords', 
        'memos', 
        'postActivity', 
        'filterHandledPosts',
        'activeMode',
        'yinliApiUrl',
        'yinliToken',
        'yinliUser',
        'yinliActiveProductId'
      ], (result) => {
        if (result.postActivity) {
          setPostActivity(result.postActivity as PostActivityMap);
        }

        if (result.filterHandledPosts !== undefined) {
          setFilterHandledPosts(result.filterHandledPosts);
        }

        if (result.activeMode !== undefined) {
          setActiveMode(result.activeMode);
        }
        if (result.yinliApiUrl !== undefined) {
          setYinliApiUrl(result.yinliApiUrl);
        }
        if (result.yinliToken !== undefined) {
          setYinliToken(result.yinliToken);
        }
        if (result.yinliUser !== undefined) {
          setYinliUser(result.yinliUser);
        }
        if (result.yinliActiveProductId !== undefined) {
          setYinliActiveProductId(result.yinliActiveProductId);
        }

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
          const existingMemos = result.memos as Memo[];
          const missingDefaultMemos = DEFAULT_MEMO_TEMPLATES
            .filter((template) => !existingMemos.some((memo) => memo.id === template.id))
            .map((template) => ({
              id: template.id,
              title: template.title,
              content: template.content,
              category: template.category,
              tags: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              isPinned: false,
            }));
          const mergedMemos = [...existingMemos, ...missingDefaultMemos];
          setMemos(mergedMemos);
          if (missingDefaultMemos.length > 0) {
            chrome.storage.local.set({ memos: mergedMemos });
          }
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
        
        // 解析匹配的平台
        const urlStr = tab.url || '';
        if (urlStr.includes('bilibili.com')) {
          setCurrentPlatform('bilibili');
        } else if (urlStr.includes('youtube.com')) {
          setCurrentPlatform('youtube');
        } else if (urlStr.includes('twitter.com') || urlStr.includes('x.com')) {
          setCurrentPlatform('twitter');
        } else if (urlStr.includes('facebook.com')) {
          setCurrentPlatform('facebook');
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
      const handleUpdated = (_tabId: number, changeInfo: any) => {
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
      showToast('请在已适配平台的网页或详情页面进行抓取', 'error');
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
        setPosts(prevPosts => {
          const combined = [...prevPosts, ...response.posts];
          const seen = new Set<string>();
          return combined.filter(post => {
            if (!post.id || seen.has(post.id)) return false;
            seen.add(post.id);
            return true;
          }).sort((a, b) => b.heatScore - a.heatScore);
        });
        setSelectedPostIds([]); // 重置选中的复选框
        setSelectedPost(null);
        showToast(`成功提取到 ${response.posts.length} 个视频并合并至列表！`, 'success');
      } else {
        showToast(response?.error || '页面中未发现支持格式的视频卡片', 'error');
      }
    });
  };

  // 清空视频列表
  const handleClearPosts = () => {
    setPosts([]);
    setSelectedPostIds([]);
    setSelectedPost(null);
    showToast('已清空抓取列表', 'info');
  };

  // 自动滚屏抓取核心触发器
  const triggerExtractAndScroll = () => {
    if (!currentTabId) return;
    chrome.tabs.sendMessage(currentTabId, { type: 'EXTRACT_AND_SCROLL' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      if (response && response.success && response.posts) {
        setPosts(prevPosts => {
          const combined = [...prevPosts, ...response.posts];
          const seen = new Set<string>();
          return combined.filter(post => {
            if (!post.id || seen.has(post.id)) return false;
            seen.add(post.id);
            return true;
          }).sort((a, b) => b.heatScore - a.heatScore);
        });
      }
    });
  };

  // 开关自动滚动抓取
  const handleToggleAutoScroll = () => {
    if (isAutoScrolling) {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      setIsAutoScrolling(false);
      showToast('已停止自动滚动抓取', 'info');
    } else {
      if (!currentTabId || !currentPlatform) {
        showToast('请在已适配平台的网页进行抓取', 'error');
        return;
      }
      setIsAutoScrolling(true);
      showToast('开启自动滚动抓取，页面正在自动翻页...', 'success');
      
      // 立即抓取一次
      triggerExtractAndScroll();
      
      autoScrollIntervalRef.current = setInterval(() => {
        triggerExtractAndScroll();
      }, 2000);
    }
  };

  // 组件卸载时确保清除定时器
  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, []);

  // ==================== 隐力 YL 协同模块接口逻辑 ====================

  // 1. 隐力 API Key 绑定
  const handleYinliLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yinliApiKey.trim()) {
      showToast('请输入隐力 API Key', 'error');
      return;
    }

    setIsLoggingIn(true);
    const targetKey = yinliApiKey.trim();
    try {
      // 通过 /api/auth/me 进行 API Key 的有效性验证
      const res = await fetch(`${yinliApiUrl}/api/auth/me`, {
        method: 'GET',
        headers: { 
          ...getAuthHeaders(targetKey),
          'Accept': 'application/json'
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '验证失败，请检查 API Key 或服务端连接');
      }

      // 验证成功后，优先使用服务端返回的 JWT Token，如果没有则回退使用输入的 API Key 本身
      const actualToken = data.token || targetKey;
      setYinliToken(actualToken);
      setYinliUser(data.user);
      
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          yinliToken: actualToken,
          yinliUser: data.user,
          yinliApiUrl: yinliApiUrl, // 同时保存 API 服务端地址，以防重新启动后被重置为默认值导致验证失败
        });
      }

      showToast('隐力 API Key 绑定成功！', 'success');
      setYinliApiKey('');
      
      // 绑定成功后拉取产品列表
      fetchYinliProducts(actualToken);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || '连接异常，请确保 YL 协同服务运行中', 'error');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // 2. 退出登录
  const handleYinliLogout = () => {
    setYinliToken('');
    setYinliUser(null);
    setYinliProducts([]);
    setYinliActiveProductId('');
    setYinliSignals([]);
    setSelectedYinliSignal(null);

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove([
        'yinliToken',
        'yinliUser',
        'yinliActiveProductId'
      ]);
    }
    showToast('已安全退出隐力协同系统', 'info');
  };

  // 3. 拉取产品列表
  const fetchYinliProducts = async (tokenOverride?: string) => {
    const token = tokenOverride || yinliToken;
    if (!token) return;

    try {
      const res = await fetch(`${yinliApiUrl}/api/product`, {
        headers: { 
          ...getAuthHeaders(token)
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取产品失败');

      setYinliProducts(data.products || []);
      
      if (data.products && data.products.length > 0) {
        // 如果没有当前选中的产品，或者历史选中的产品已不在列表中，默认选中第一个
        const exists = data.products.some((p: any) => p.id === yinliActiveProductId);
        if (!yinliActiveProductId || !exists) {
          const firstProductId = data.products[0].id;
          setYinliActiveProductId(firstProductId);
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ yinliActiveProductId: firstProductId });
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || '获取产品列表失败', 'error');
    }
  };

  // 4. 拉取待办信号和锦囊列表
  const fetchYinliSignals = async (productId: string) => {
    if (!yinliToken || !productId) return;

    setIsLoadingSignals(true);
    try {
      // 仅拉取 NEW、STRATEGIZED、APPROVED 状态的信号，排除已发布的信号
      const res = await fetch(`${yinliApiUrl}/api/product/${productId}/strategies?status=NEW,STRATEGIZED,APPROVED`, {
        headers: { 
          ...getAuthHeaders(yinliToken)
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '获取信号失败');

      setYinliSignals(data.signals || []);
      
      if (!data.signals || data.signals.length === 0) {
        showToast('该产品下暂无待回复的隐力信号', 'info');
      }
    } catch (err: any) {
      console.error(err);
      showToast(err.message || '获取信号数据失败', 'error');
    } finally {
      setIsLoadingSignals(false);
    }
  };

  // 5. 更新信号状态 (如标记为已操作)
  const updateYinliSignalStatus = async (signalId: number, status: 'POSTED' | 'IGNORED') => {
    if (!yinliToken) return;

    try {
      const res = await fetch(`${yinliApiUrl}/api/signal/${signalId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(yinliToken),
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新信号状态失败');

      // 成功后，从当前的本地信号列表里移除
      setYinliSignals(prev => prev.filter(s => s.id !== signalId));
      if (selectedYinliSignal?.id === signalId) {
        setSelectedYinliSignal(null);
      }
      return true;
    } catch (err: any) {
      console.error(err);
      showToast(err.message || '更新信号状态失败', 'error');
      return false;
    }
  };

  // 6. 点击信号进行跳转与模板载入
  const handleSelectYinliSignal = (signal: YinliSignal) => {
    setSelectedYinliSignal(signal);
    
    // 打开信号链接，若是活动页，在 activeTab 授权下运行
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: signal.url });
    } else {
      window.open(signal.url, '_blank');
    }
    
    // 如果该信号具有生成好的锦囊回复策略，默认将第一个锦囊填充到草稿回复中，并切到 reply tab
    if (signal.strategies && signal.strategies.length > 0) {
      setReplyText(signal.strategies[0].content);
      setActiveTab('reply');
      showToast('已为您自动切换到目标页面，并把 AI 锦囊回复载入编辑框！', 'success');
    } else {
      setActiveTab('reply');
      showToast('已跳转到目标页面，此信号暂无 AI 锦囊，可手动回复。', 'info');
    }
  };

  // 7. 定时/切换自动加载逻辑
  useEffect(() => {
    if (activeMode === 'yinli' && yinliToken) {
      if (yinliActiveProductId) {
        fetchYinliSignals(yinliActiveProductId);
      } else {
        fetchYinliProducts();
      }
    }
  }, [activeMode, yinliToken, yinliActiveProductId]);

  const runBackgroundCommentTasks = (targetPosts: Post[]) => {
    if (targetPosts.length === 0) {
      showToast('请先勾选需要回复的视频', 'error');
      return;
    }
    if (!replyText.trim()) {
      showToast('请编写回复评论的内容', 'error');
      return;
    }

    // 跨话题防止重复评论机制：根据 postActivity 的 handledAt 自动过滤已操作过的视频
    const unhandledPosts = targetPosts.filter(post => {
      const key = getPostActivityKey(post);
      return !postActivity[key]?.handledAt;
    });

    if (unhandledPosts.length === 0) {
      showToast('所选视频已在此前话题的评论操作中回复过，已自动拦截重复评论', 'info');
      return;
    }

    const skippedCount = targetPosts.length - unhandledPosts.length;
    if (skippedCount > 0) {
      showToast(`已自动跳过 ${skippedCount} 个已回复视频，仅对剩下的 ${unhandledPosts.length} 个进行评论`, 'info');
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      showToast('当前环境不支持后台自动任务', 'error');
      return;
    }

    setIsInjecting(true);
    unhandledPosts.forEach(post => markPostActivity(post, 'openedAt'));
    showToast(`后台正在处理 ${unhandledPosts.length} 个视频...`, 'info');

    chrome.runtime.sendMessage({
      type: 'RUN_COMMENT_TASKS',
      tasks: unhandledPosts.map(post => ({
        id: post.id,
        pageUrl: post.pageUrl,
        commentText: replyText,
        autoSubmit
      }))
    }, (response) => {
      setIsInjecting(false);
      if (chrome.runtime.lastError) {
        showToast('后台任务启动失败，请刷新插件后重试', 'error');
        return;
      }

      if (response?.success) {
        unhandledPosts.forEach(post => markPostActivity(post, 'handledAt'));
        showToast(
          autoSubmit 
            ? `已完成 ${unhandledPosts.length} 个视频的后台填充和发送。` 
            : `已完成 ${unhandledPosts.length} 个视频的后台填充，请在打开的页面确认发送。`, 
          'success'
        );
        if (activeMode === 'yinli' && selectedYinliSignal) {
          updateYinliSignalStatus(selectedYinliSignal.id, 'POSTED');
        }
      } else {
        const results = response?.results || [];
        const completedIds = new Set(
          results
            .filter((result: { id: string; success: boolean }) => result.success)
            .map((result: { id: string }) => result.id)
        );
        unhandledPosts
          .filter(post => completedIds.has(post.id))
          .forEach(post => markPostActivity(post, 'handledAt'));
        const failedCount = results.filter((result: { success: boolean }) => !result.success).length || unhandledPosts.length;
        const firstError = results.find((result: { success: boolean; error?: string }) => !result.success)?.error;
        showToast(firstError || `${failedCount} 个视频未完成，评论区或发送按钮不可用`, 'error');

        if (activeMode === 'yinli' && selectedYinliSignal) {
          const isSignalCompleted = results.length === 0 || results.some((r: any) => r.id === selectedYinliSignal.id.toString() && r.success);
          if (isSignalCompleted) {
            updateYinliSignalStatus(selectedYinliSignal.id, 'POSTED');
          }
        }
      }
    });
  };

  // 5. 自动填充评论到页面 (单视频/信号后台任务)
  const handleInjectComment = () => {
    if (activeMode === 'yinli') {
      if (!selectedYinliSignal) {
        showToast('请先在“隐力信号”列表中选中目标信号', 'error');
        return;
      }
      const source = selectedYinliSignal.source.toLowerCase();
      let platform: Platform = 'twitter';
      if (source.includes('youtube')) platform = 'youtube';
      else if (source.includes('bilibili')) platform = 'bilibili';
      else if (source.includes('facebook')) platform = 'facebook';
      
      const mockPost: Post = {
        id: selectedYinliSignal.id.toString(),
        platform,
        author: selectedYinliSignal.author || 'Yinli User',
        content: selectedYinliSignal.textContent,
        engagement: { likes: 0, comments: 0, shares: 0 },
        heatScore: 0,
        pageUrl: selectedYinliSignal.url,
        extractedAt: Date.now()
      };
      runBackgroundCommentTasks([mockPost]);
      return;
    }

    const targetPost = selectedPost || posts.find(p => selectedPostIds.includes(p.id));
    if (!targetPost) {
      showToast('请先在“视频发现”列表中选中目标视频', 'error');
      return;
    }

    runBackgroundCommentTasks([targetPost]);
  };

  // 6. 批量在后台新标签页打开视频并填充评论
  const handleBatchInjectComments = () => {
    if (selectedPostIds.length === 0) {
      showToast('请先勾选需要填充的视频', 'error');
      return;
    }
    const selectedPostsData = posts.filter(p => selectedPostIds.includes(p.id));
    runBackgroundCommentTasks(selectedPostsData);
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
  const getUrlActivityKey = (platform: Platform, pageUrl?: string, fallbackId = '') => {
    try {
      const parsed = new URL(pageUrl || '');
      const hostname = parsed.hostname;
      const pathname = parsed.pathname;

      if (hostname.includes('bilibili.com')) {
        const bvid = pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1];
        return bvid ? `bilibili:${bvid}` : `bilibili:${fallbackId || pathname}`;
      }
      
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        let videoId = parsed.searchParams.get('v');
        if (!videoId) {
          const shortsMatch = pathname.match(/\/shorts\/([^&#/?]+)/);
          if (shortsMatch) {
            videoId = shortsMatch[1];
          } else if (hostname.includes('youtu.be')) {
            const pathMatch = pathname.match(/^\/([^&#/?]+)/);
            if (pathMatch) videoId = pathMatch[1];
          }
        }
        return videoId ? `youtube:${videoId}` : `youtube:${fallbackId || pathname}`;
      }
      
      if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
        const statusId = pathname.match(/\/status\/(\d+)/)?.[1];
        return statusId ? `twitter:${statusId}` : `twitter:${fallbackId || pathname}`;
      }
      
      if (hostname.includes('facebook.com')) {
        const fbid = parsed.searchParams.get('story_fbid') || parsed.searchParams.get('fbid') || pathname.match(/\/posts\/(\d+)/)?.[1] || pathname.match(/\/permalink\/(\d+)/)?.[1] || pathname.match(/\/videos\/(\d+)/)?.[1];
        return fbid ? `facebook:${fbid}` : `facebook:${fallbackId || pathname}`;
      }
    } catch {
      // 退回到视频 id，避免无效 URL 导致状态丢失。
    }
    return `${platform}:${fallbackId || pageUrl || ''}`;
  };

  const getPostActivityKey = (post: Post) => {
    return getUrlActivityKey(post.platform, post.pageUrl, post.id);
  };

  const markPostActivity = (post: Post, field: keyof PostActivity) => {
    const key = getPostActivityKey(post);
    setPostActivity((current) => {
      const nextActivity = {
        ...current,
        [key]: {
          ...current[key],
          [field]: Date.now(),
        },
      };
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ postActivity: nextActivity });
      }
      return nextActivity;
    });
  };

  const getPostActivityLabel = (post: Post) => {
    const activity = postActivity[getPostActivityKey(post)];
    if (activity?.handledAt) return '已操作';
    if (activity?.openedAt) return '已打开';
    if (activity?.viewedAt) return '已点过';
    return '';
  };

  const openPostPage = (post: Post) => {
    markPostActivity(post, 'openedAt');

    if (typeof chrome !== 'undefined' && chrome.tabs) {
      const targetKey = getPostActivityKey(post);
      chrome.tabs.query({}, (tabs) => {
        const existingTab = tabs.find((tab) => getUrlActivityKey(post.platform, tab.url || '') === targetKey);
        if (existingTab?.id) {
          chrome.tabs.update(existingTab.id, { active: true });
          if (existingTab.windowId) {
            chrome.windows?.update(existingTab.windowId, { focused: true });
          }
        } else {
          chrome.tabs.create({ url: post.pageUrl });
        }
      });
    } else {
      window.open(post.pageUrl, '_blank');
    }
  };

  const formatCompactNum = (num: number) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    }
    return num.toString();
  };

  // 过滤视频列表
  const filteredPosts = posts.filter(p => {
    if (filterHandledPosts) {
      const activity = postActivity[getPostActivityKey(p)];
      if (activity?.handledAt) {
        return false;
      }
    }
    return (
      p.content.toLowerCase().includes(searchFilter.toLowerCase()) ||
      p.author.toLowerCase().includes(searchFilter.toLowerCase())
    );
  });

  // 单选/多选卡片交互
  const handleSelectCard = (post: Post) => {
    setSelectedPost(post);
    markPostActivity(post, 'viewedAt');
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
                : currentPlatform === 'youtube'
                ? 'bg-red-500/10 text-red-400 border-red-400/20'
                : currentPlatform === 'twitter'
                ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                : 'bg-indigo-500/10 text-indigo-400 border-indigo-400/20'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
              {PLATFORM_CONFIG[currentPlatform]?.name || currentPlatform}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700/50">
              未匹配页面
            </span>
          )}
        </div>
      </header>

      {/* 模式拨码开关 */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-900 flex items-center justify-between shrink-0">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">运行模式</span>
        <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={() => {
              setActiveMode('local');
              if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ activeMode: 'local' });
              }
              showToast('已切换至本地抓取模式', 'info');
            }}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all duration-150 ${
              activeMode === 'local'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🔍 本地抓取
          </button>
          <button
            onClick={() => {
              setActiveMode('yinli');
              if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                chrome.storage.local.set({ activeMode: 'yinli' });
              }
              showToast('已切换至隐力智能协同', 'info');
            }}
            className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-all duration-150 ${
              activeMode === 'yinli'
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ 隐力情报
          </button>
        </div>
      </div>

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
          🔍 内容发现
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
        
        {/* VIEW 1: 视频与信号发现 */}
        {activeTab === 'search' && (
          activeMode === 'yinli' ? (
            // ================= 隐力模式分流 =================
            !yinliToken ? (
              // 1. 未登录绑定面板
              <form onSubmit={handleYinliLogin} className="flex flex-col space-y-4 justify-center py-6">
                <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 shrink-0 shadow-lg backdrop-blur-md">
                  <div className="text-center pb-2">
                    <h2 className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-300">绑定隐力 (YL) 协同系统</h2>
                    <p className="text-[10px] text-slate-500 mt-1">同步云端 AI 挖掘的商机与营销策略，一键半自动填充</p>
                  </div>
                  <div className="space-y-2.5">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">YL 服务端地址 (API URL)</label>
                      <input
                        type="text"
                        placeholder={`默认: ${DEFAULT_YINLI_URL}`}
                        value={yinliApiUrl}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setYinliApiUrl(val);
                          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                            chrome.storage.local.set({ yinliApiUrl: val });
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">隐力 API Key (X-API-Key)</label>
                      <input
                        type="password"
                        required
                        placeholder="yl_api_..."
                        value={yinliApiKey}
                        onChange={(e) => setYinliApiKey(e.target.value.trim())}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLoggingIn}
                      className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-lg text-xs transition-all duration-200 active:scale-98 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isLoggingIn ? '正在验证 API Key...' : '🔗 绑定开发者密钥'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              // 2. 已登录，显示信号队列
              <div className="flex flex-col h-full space-y-4 min-h-0">
                {/* 顶部产品过滤器与控制 */}
                <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 shrink-0 shadow-sm">
                  <div className="flex-1 min-w-0">
                    <label className="text-[9px] text-slate-500 block mb-0.5 uppercase tracking-wide">隐力监控产品</label>
                    {yinliProducts.length > 0 ? (
                      <select
                        value={yinliActiveProductId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setYinliActiveProductId(val);
                          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                            chrome.storage.local.set({ yinliActiveProductId: val });
                          }
                          setSelectedYinliSignal(null);
                        }}
                        className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                      >
                        {yinliProducts.map(prod => (
                          <option key={prod.id} value={prod.id}>{prod.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-slate-500 block">暂无产品，请前往网页端添加</span>
                    )}
                  </div>
                  <button
                    onClick={() => yinliActiveProductId && fetchYinliSignals(yinliActiveProductId)}
                    disabled={isLoadingSignals || !yinliActiveProductId}
                    className="p-2 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition-colors active:scale-95 border border-slate-700/50 shrink-0"
                    title="刷新信号列表"
                  >
                    {isLoadingSignals ? '⏳' : '🔄'}
                  </button>
                </div>

                {/* 信号列表 */}
                <div className="flex-1 min-h-0 flex flex-col space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-400 shrink-0 flex items-center justify-between">
                    <span>待回复信号 ({yinliSignals.length})</span>
                    {selectedYinliSignal && (
                      <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded font-semibold border border-indigo-500/10">
                        已选中 1 个信号
                      </span>
                    )}
                  </h3>
                  
                  {isLoadingSignals ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
                      <svg className="animate-spin h-5 w-5 text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      正在同步云端商机雷达...
                    </div>
                  ) : yinliSignals.length > 0 ? (
                    <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 min-h-0">
                      {yinliSignals.map((signal) => (
                        <div
                          key={signal.id}
                          onClick={() => setSelectedYinliSignal(signal)}
                          className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col gap-1.5 ${
                            selectedYinliSignal?.id === signal.id
                              ? 'bg-violet-950/20 border-violet-500/50 shadow-md shadow-violet-500/5'
                              : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700/60 hover:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-violet-500/20 text-violet-300">
                                {signal.source.toUpperCase()}
                              </span>
                              {signal.battlefield?.name && (
                                <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                                  🎯 {signal.battlefield.name}
                                </span>
                              )}
                            </div>
                            {signal.qualityScore !== null && (
                              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/15">
                                Relevance: {Math.round(signal.qualityScore * 100)}%
                              </span>
                            )}
                          </div>
                          
                          <p className="text-xs font-semibold text-slate-200 line-clamp-1">
                            {signal.title}
                          </p>
                          <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                            {signal.textContent}
                          </p>

                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[9px] text-slate-500">
                              🕒 捕获于: {new Date(signal.scoutedAt).toLocaleDateString()}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateYinliSignalStatus(signal.id, 'IGNORED');
                                }}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 text-[10px] transition-colors border border-slate-700/30 hover:border-rose-500/15"
                              >
                                忽略
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectYinliSignal(signal);
                                }}
                                className="px-2.5 py-1 rounded bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white text-[10px] font-semibold transition-all active:scale-95 shadow-sm"
                              >
                                🔗 去回复
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center border-t border-slate-800/60 text-slate-500 text-xs text-center p-6 space-y-2">
                      <span>📭 暂无待处理情报信号</span>
                      <p className="text-[10px] text-slate-600">请确保 YL 系统的 Battlefield (战场) 开启了 Scout 斥候定时扫描</p>
                    </div>
                  )}
                </div>
              </div>
            )
          ) : (
            // ================= 本地模式 (原先的代码) =================
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
                <div className="flex gap-2">
                  <button
                    onClick={handleExtractPosts}
                    disabled={isLoadingPosts || isAutoScrolling}
                    className="flex-1 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 text-xs"
                    title="单次提取当前可见页面中的视频帖子数据"
                  >
                    {isLoadingPosts ? '正在抓取...' : '⚡ 单次抓取'}
                  </button>
                  
                  <button
                    onClick={handleToggleAutoScroll}
                    disabled={isLoadingPosts}
                    className={`flex-1 py-2 rounded-xl font-semibold transition-all duration-200 shadow-md hover:scale-[1.01] active:scale-95 text-xs flex items-center justify-center gap-1.5 ${
                      isAutoScrolling 
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/10 animate-pulse' 
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 shadow-slate-800/10'
                    }`}
                    title="开启后插件将自动滚屏，定时向下翻页并持续抓取帖子，解决滚动导致的元素回收和漏抓问题"
                  >
                    {isAutoScrolling ? '🛑 停止自动抓取' : '🔄 自动滚动抓取'}
                  </button>
                </div>
                
                {posts.length > 0 && (
                  <button
                    onClick={handleClearPosts}
                    disabled={isAutoScrolling}
                    className="w-full py-1.5 rounded-lg border border-slate-800 bg-slate-950/40 hover:bg-slate-900/60 hover:border-slate-700/60 text-slate-400 hover:text-slate-200 transition-all text-[11px] flex items-center justify-center gap-1 active:scale-98 disabled:opacity-40"
                  >
                    🧹 清空列表已抓取的视频 ({posts.length} 个)
                  </button>
                )}

                {!currentPlatform && (
                  <p className="text-[10px] text-slate-500 text-center">
                    *提示：请先在浏览器当前标签页打开已适配平台的网页再进行抓取。
                  </p>
                )}
              </div>

              {/* 抓取结果展示 - 实现 Flex 填充与独立滚动以去除留白 */}
              {posts.length > 0 ? (
                <div className="flex-1 min-h-0 flex flex-col space-y-3 pt-3 border-t border-slate-800/60">
                  <div className="flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-slate-400">提取内容 ({filteredPosts.length})</h3>
                        {selectedPostIds.length > 0 && (
                          <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/10">
                            已选 {selectedPostIds.length} 个
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        placeholder="过滤内容/作者..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs w-32 focus:outline-none focus:border-indigo-500/60 transition-colors"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={filterHandledPosts}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setFilterHandledPosts(val);
                            if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                              chrome.storage.local.set({ filterHandledPosts: val });
                            }
                          }}
                          className="w-3 h-3 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500/40 focus:ring-offset-0 transition-colors cursor-pointer"
                        />
                        <span>跨话题过滤已回复 (排除已评论视频)</span>
                      </label>
                    </div>
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
                            : getPostActivityLabel(post)
                            ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-400/50 hover:bg-amber-950/30'
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
                              post.platform === 'bilibili' 
                                ? 'bg-sky-500/20 text-sky-400' 
                                : post.platform === 'youtube'
                                ? 'bg-red-500/20 text-red-400'
                                : post.platform === 'twitter'
                                ? 'bg-blue-400/20 text-blue-400'
                                : 'bg-indigo-500/20 text-indigo-400'
                            }`}>
                              {post.platform === 'bilibili' ? 'B站' : post.platform === 'youtube' ? 'YT' : post.platform === 'twitter' ? 'X' : 'FB'}
                            </span>
                            {getPostActivityLabel(post) && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-amber-500/15 text-amber-300 border border-amber-400/20">
                                {getPostActivityLabel(post)}
                              </span>
                            )}
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
                            {post.platform === 'bilibili' ? (
                              <>
                                <span>播放 {formatCompactNum(post.engagement.likes)}</span>
                                <span>弹幕 {formatCompactNum(post.engagement.comments)}</span>
                              </>
                            ) : post.platform === 'youtube' ? (
                              <>
                                <span>播放 {formatCompactNum(post.engagement.likes)}</span>
                              </>
                            ) : (
                              <>
                                <span>👍 {formatCompactNum(post.engagement.likes)}</span>
                                <span>💬 {formatCompactNum(post.engagement.comments)}</span>
                                <span>🔗 {formatCompactNum(post.engagement.shares)}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-indigo-400 font-semibold">🔥 {formatCompactNum(post.heatScore)}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPostPage(post);
                              }}
                              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                              title="在新窗口中打开此内容"
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
                  暂无抓取数据，请先抓取页面内容
                </div>
              )}
            </div>
          )
        )}

        {/* VIEW 2: 快捷回复编辑与填充 */}
        {activeTab === 'reply' && (
          <div className="flex flex-col h-full space-y-4 min-h-0">
            {/* 选中目标提示 */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 shrink-0">
              {activeMode === 'yinli' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 block">当前选中的隐力情报目标：</span>
                    {selectedYinliSignal && (
                      <button
                        onClick={() => setSelectedYinliSignal(null)}
                        className="text-slate-500 hover:text-rose-400 text-[10px] transition-colors"
                        title="取消选择"
                      >
                        ✕ 清除选择
                      </button>
                    )}
                  </div>
                  {selectedYinliSignal ? (
                    <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-850 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                            selectedYinliSignal.source.toLowerCase().includes('bilibili') 
                              ? 'bg-sky-500/20 text-sky-400' 
                              : selectedYinliSignal.source.toLowerCase().includes('youtube')
                              ? 'bg-red-500/20 text-red-400'
                              : selectedYinliSignal.source.toLowerCase().includes('twitter') || selectedYinliSignal.source.toLowerCase().includes('x')
                              ? 'bg-blue-400/20 text-blue-400'
                              : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {selectedYinliSignal.source.toUpperCase()}
                          </span>
                          {selectedYinliSignal.battlefield?.name && (
                            <span className="text-[9px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                              🎯 {selectedYinliSignal.battlefield.name}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {selectedYinliSignal.qualityScore !== null && (
                            <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/15">
                              匹配度: {Math.round(selectedYinliSignal.qualityScore * 100)}%
                            </span>
                          )}
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                            selectedYinliSignal.status === 'POSTED'
                              ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/15'
                              : 'bg-amber-500/10 text-amber-450 border border-amber-500/15'
                          }`}>
                            {selectedYinliSignal.status === 'POSTED' ? '已回复' : '待处理'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-200 font-semibold line-clamp-1">
                        {selectedYinliSignal.title}
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/40 p-1.5 rounded border border-slate-900/60">
                        {selectedYinliSignal.textContent}
                      </div>
                      <div className="flex items-center justify-between text-[9px] text-slate-500 pt-0.5">
                        <span>👤 {selectedYinliSignal.author || '未知用户'}</span>
                        <a 
                          href={selectedYinliSignal.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors"
                        >
                          打开原贴 ↗
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 py-1">
                      ⚠️ 您还没有在“内容发现”中选中任何隐力情报。请先在“内容发现”中选中一个目标情报以开启快捷回复。
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block mb-1.5">当前勾选的发送目标 ({selectedPostIds.length}个)：</span>
                  {selectedPostIds.length > 0 ? (
                    <div className="space-y-1.5 max-h-[110px] overflow-y-auto pr-1">
                      {posts.filter(p => selectedPostIds.includes(p.id)).map((post) => (
                        <div key={post.id} className="flex items-center justify-between text-xs text-slate-300 bg-slate-950/40 p-1.5 rounded border border-slate-900/80">
                          <div className="flex items-center gap-1.5 truncate flex-1 mr-2">
                            <span className={`text-[9px] px-1 py-0.2 rounded font-semibold ${
                              post.platform === 'bilibili' 
                                ? 'bg-sky-500/20 text-sky-400' 
                                : post.platform === 'youtube'
                                ? 'bg-red-500/20 text-red-400'
                                : post.platform === 'twitter'
                                ? 'bg-blue-400/20 text-blue-400'
                                : 'bg-indigo-500/20 text-indigo-400'
                            }`}>
                              {post.platform === 'bilibili' ? 'B站' : post.platform === 'youtube' ? 'YT' : post.platform === 'twitter' ? 'X' : 'FB'}
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
                      ⚠️ 您还没有在“内容发现”中勾选任何内容。请先勾选目标以开启一键批量填充。
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 回复输入框 */}
            <div className="flex-1 min-h-0 flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400 shrink-0">回复评论内容</label>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={activeMode === 'yinli' ? "在此编写或载入 AI 回复策略、推广评论话术..." : "在此编写您的推广回复、评论话术或营销内容..."}
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

            {/* 填充执行 */}
            {activeMode === 'yinli' ? (
              <button
                onClick={handleInjectComment}
                disabled={isInjecting || !selectedYinliSignal || !replyText.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold transition-all duration-200 shadow-md shadow-violet-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shrink-0 text-xs"
              >
                {isInjecting ? '后台正在自动处理...' : '一键后台填充并发送'}
              </button>
            ) : selectedPostIds.length > 1 ? (
              <button
                onClick={handleBatchInjectComments}
                disabled={isInjecting || !replyText.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shrink-0 text-xs"
              >
                {isInjecting ? '后台正在自动处理...' : `一键后台填充并发送 (${selectedPostIds.length}个视频)`}
              </button>
            ) : (
              <button
                onClick={handleInjectComment}
                disabled={isInjecting || !selectedPost || !replyText.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white font-semibold transition-all duration-200 shadow-md shadow-indigo-500/10 hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 shrink-0 text-xs"
              >
                {isInjecting ? '后台正在自动处理...' : '一键后台填充并发送'}
              </button>
            )}
          </div>
        )}

        {/* VIEW 3: 话术模板管理 */}
        {activeTab === 'memos' && (
          activeMode === 'yinli' ? (
            // ================= 隐力AI狙击策略分流 =================
            <div className="flex flex-col h-full space-y-4 min-h-0">
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 shrink-0">
                <h3 className="text-xs font-semibold text-slate-300">当前关联的情报信号</h3>
                {selectedYinliSignal ? (
                  <div className="mt-2 text-xs text-slate-400 truncate bg-slate-950/40 p-2 rounded border border-slate-900">
                    <span className="text-slate-200 font-medium">🎯 {selectedYinliSignal.title}</span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">⚠️ 未选中任何情报信号。请先在“内容发现”中选中一个信号。</p>
                )}
              </div>

              <div className="flex-1 min-h-0 flex flex-col space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 shrink-0">AI 狙击回复策略</h3>
                
                {!selectedYinliSignal ? (
                  <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs text-center p-6 space-y-2">
                    <span className="text-lg">💡</span>
                    <span className="font-semibold text-slate-400">专属 AI 回复策略</span>
                    <p className="text-[10px] text-slate-600 max-w-[200px] leading-relaxed">请在“内容发现”中选择一个隐力情报信号，此处将自动加载针对该贴的专属 AI 回复策略（共情表达、专家科普、引流等）。</p>
                  </div>
                ) : !selectedYinliSignal.strategies || selectedYinliSignal.strategies.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs text-center p-6">
                    <span className="text-lg">📭</span>
                    <span className="font-semibold text-slate-400 mt-1">暂无 AI 回复策略</span>
                    <p className="text-[10px] text-slate-600 mt-1">此信号暂未生成 AI 策略，您可在“快捷回复”中手动编写内容进行发送。</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
                    {selectedYinliSignal.strategies.map((strat) => {
                      // 映射策略类型
                      let typeLabel = 'AI 策略';
                      let typeColor = 'bg-slate-500/10 text-slate-400 border-slate-500/15';
                      if (strat.type === 'EMPATH') {
                        typeLabel = '❤️ 共情表达型 (EMPATH)';
                        typeColor = 'bg-rose-500/10 text-rose-450 text-rose-400 border-rose-500/15';
                      } else if (strat.type === 'EXPERT') {
                        typeLabel = '🎓 专业科普型 (EXPERT)';
                        typeColor = 'bg-amber-500/10 text-amber-455 text-amber-400 border-amber-500/15';
                      } else if (strat.type === 'PLUG') {
                        typeLabel = '🔌 产品引流型 (PLUG)';
                        typeColor = 'bg-violet-500/10 text-violet-455 text-violet-400 border-violet-500/15';
                      }
                      
                      return (
                        <div key={strat.id} className="p-3 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col gap-2 hover:border-slate-700/60 transition-colors">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${typeColor}`}>
                              {typeLabel}
                            </span>
                          </div>
                          
                          <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 font-medium">
                            {strat.content}
                          </p>

                          {strat.reasoning && (
                            <div className="text-[10px] text-slate-500 bg-slate-900/30 p-2 rounded border border-slate-850/40">
                              <span className="font-semibold block text-slate-400 mb-0.5">🧠 AI 推荐逻辑:</span>
                              <span className="leading-relaxed">{strat.reasoning}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(strat.content);
                                showToast('复制成功', 'success');
                              }}
                              className="px-2.5 py-1 rounded-md bg-slate-850 hover:bg-slate-800 text-slate-300 text-[10px] transition-colors border border-slate-800"
                            >
                              📋 仅复制
                            </button>
                            <button
                              onClick={() => {
                                setReplyText(strat.content);
                                setActiveTab('reply');
                                showToast('策略已载入快捷回复！', 'success');
                              }}
                              className="px-3 py-1 rounded-md bg-indigo-650/20 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 text-[10px] font-semibold border border-indigo-500/20 transition-colors"
                            >
                              ✍️ 载入回复并编辑
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // ================= 本地模式 (原先的代码) =================
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
          )
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
            
            {/* 快捷访问已适配平台 */}
            <div className="space-y-2 shrink-0">
              <h3 className="text-xs font-semibold text-slate-400">快捷访问已适配平台</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (typeof chrome !== 'undefined' && chrome.tabs) {
                        chrome.tabs.create({ url: config.baseUrl });
                      } else {
                        window.open(config.baseUrl, '_blank');
                      }
                    }}
                    className="flex items-center gap-2.5 p-2.5 bg-slate-900/60 hover:bg-indigo-950/20 border border-slate-800/80 hover:border-indigo-500/40 rounded-xl text-left transition-all duration-200 hover:scale-[1.02] active:scale-95 group"
                  >
                    <span className="text-lg group-hover:scale-110 transition-transform duration-200">{config.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-200 group-hover:text-indigo-400 transition-colors truncate">{config.name}</p>
                      <p className="text-[9px] text-slate-500 truncate">{config.baseUrl.replace('https://', '')}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 隐力 YL 协同系统设置 */}
            <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800/80 space-y-3 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-300">隐力 (YL) 协同服务配置</h3>
                {yinliToken ? (
                  <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 font-semibold">
                    已连接
                  </span>
                ) : (
                  <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.2 rounded font-semibold">
                    未绑定
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">YL API Endpoint (服务端地址)</label>
                  <input
                    type="text"
                    placeholder={`默认: ${DEFAULT_YINLI_URL}`}
                    value={yinliApiUrl}
                    onChange={(e) => {
                      const val = e.target.value.trim();
                      setYinliApiUrl(val);
                      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        chrome.storage.local.set({ yinliApiUrl: val });
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {yinliToken && (
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-400 truncate max-w-[150px]">
                      👤 账号: {yinliUser?.email || '已绑定用户'}
                    </span>
                    <button
                      onClick={handleYinliLogout}
                      className="px-2 py-0.8 bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/20 text-rose-400 rounded-md text-[10px] transition-colors"
                    >
                      解除绑定
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 项目申明 */}
            <div className="p-3 bg-indigo-950/10 border border-indigo-500/10 rounded-xl text-[10px] text-slate-500 leading-relaxed shrink-0">
              <p className="font-semibold text-slate-400 mb-1">🔒 安全性与合规声明：</p>
              <p>本插件所有数据（包括检索词、回复文本及分析缓存）均安全保存在您的本地浏览器中，绝不上报或泄露。勾选自动发布后，插件会在后台打开目标网页、填充回复并发送；关闭自动发布时，只填充内容并等待您手动确认。</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
