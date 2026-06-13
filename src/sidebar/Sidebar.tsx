import React, { useState, useEffect } from 'react';
import type { Post, Keyword, Memo, Platform, YinliProduct, YinliSignal } from '../shared/types.js';
import { PLATFORM_CONFIG, DEFAULT_MEMO_TEMPLATES } from '../shared/constants.js';

const DEFAULT_YINLI_URL = (import.meta as any).env?.VITE_YINLI_API_URL || 
  ((import.meta as any).env?.DEV ? 'http://localhost:3000' : 'https://seevoid.com');

const getAuthHeaders = (token: string): Record<string, string> => {
  if (!token) return {};
  return { 'X-API-Key': token };
};

type PostActivity = {
  viewedAt?: number;
  openedAt?: number;
  handledAt?: number;
};

type PostActivityMap = Record<string, PostActivity>;

const getMarketLink = (id: string, mode: 'openvsx' | 'chrome') => {
  if (!id) return '';
  if (mode === 'openvsx') {
    const parts = id.split('.');
    const ns = parts[0];
    const name = parts.slice(1).join('.');
    return `https://open-vsx.org/extension/${ns}/${name}`;
  } else {
    return `https://chromewebstore.google.com/detail/placeholder/${id}`;
  }
};

export default function Sidebar() {
  // 视图 Tab 切换
  const [activeTab, setActiveTab] = useState<'search' | 'reply' | 'memos' | 'settings' | 'analysis'>('search');
  
  // AppStore / 插件分析 Tab 的专属状态
  const [analysisMode, setAnalysisMode] = useState<'appstore' | 'openvsx' | 'chrome'>('appstore');
  const [analysisQuery, setAnalysisQuery] = useState('');
  const [analysisKeywords, setAnalysisKeywords] = useState('');
  const [analysisCategory, setAnalysisCategory] = useState('');
  const [analysisCountry, setAnalysisCountry] = useState('us');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisTotal, setAnalysisTotal] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 存储的自定义插件列表
  const [savedOpenVSXPlugins, setSavedOpenVSXPlugins] = useState<{ id: string; name: string }[]>([]);
  const [savedChromePlugins, setSavedChromePlugins] = useState<{ id: string; name: string }[]>([]);

  // SEO 词频与 N-Gram 提取算法
  const extractSEOKeywordsFromTexts = (texts: string[], isChinese: boolean) => {
    const phraseCounts: Record<string, number> = {};
    const enStopwords = [
      'the', 'and', 'to', 'a', 'of', 'in', 'is', 'it', 'for', 'this', 'that', 'with', 
      'but', 'i', 'you', 'app', 'my', 'on', 'have', 'are', 'was', 'so', 'just', 'be', 
      'or', 'not', 'at', 'an', 'as', 'if', 'me', 'my', 'can', 'with', 'about', 'would',
      'there', 'their', 'they', 'we', 'our', 'will', 'this', 'get', 'like', 'good', 
      'great', 'love', 'use', 'really', 'very', 'more', 'when', 'some', 'out', 'all',
      'one', 'only', 'than', 'into', 'even', 'make', 'also', 'after', 'been', 'which',
      'extension', 'chrome', 'plugin', 'software', 'tool', 'helper', 'vscode', 'editor'
    ];
    
    const zhStopwords = [
      '的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '和', '有', '无', 
      '也', '就', '都', '而', '及', '与', '被', '让', '使', '等', '及', '关于', '对于', 
      '一个', '这个', '那个', '软件', '应用', '使用', '感觉', '觉得', '希望', '如果',
      '不能', '无法', '支持', '更新', '下载', '打开', '闪退', '因为', '所以', '但是',
      '插件', '扩展', '助手', '工具', '编辑器'
    ];

    texts.forEach(text => {
      if (!text) return;
      if (isChinese) {
        const cleanText = text.replace(/[^一-龥]/g, ' ');
        const segments = cleanText.split(/\s+/).filter(s => s.length >= 2);
        segments.forEach(seg => {
          for (let len of [2, 3, 4]) {
            for (let i = 0; i <= seg.length - len; i++) {
              const phrase = seg.slice(i, i + len);
              if (!zhStopwords.some(sw => phrase.includes(sw) && phrase.length <= sw.length + 1)) {
                phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
              }
            }
          }
        });
      } else {
        const cleanText = text.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
        const words = cleanText.split(/\s+/).filter(w => w.length > 2);
        
        // 1-gram
        words.forEach(w => {
          if (!enStopwords.includes(w)) {
            phraseCounts[w] = (phraseCounts[w] || 0) + 1.2;
          }
        });
        // 2-gram
        for (let i = 0; i < words.length - 1; i++) {
          const w1 = words[i];
          const w2 = words[i+1];
          if (!enStopwords.includes(w1) && !enStopwords.includes(w2)) {
            const phrase = `${w1} ${w2}`;
            phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1.0;
          }
        }
      }
    });

    return Object.entries(phraseCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(e => ({ word: e[0], count: Math.round(e[1]) }));
  };

  // 运行 Open VSX 插件市场分析与 ASO 排名评估
  const handleOpenVSXAnalysis = async () => {
    const query = analysisQuery.trim();
    if (!query) {
      setAnalysisError('请输入插件名称/ID（例如: meta.pyrefly）');
      return;
    }
    
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResults(null);
    setAnalysisProgress(0);
    setAnalysisTotal(1);

    try {
      // 1. 解析 namespace 和 name
      let namespace = '';
      let name = '';
      if (query.includes('.') || query.includes('/')) {
        const parts = query.split(/[\.\/]/);
        namespace = parts[0].trim();
        name = parts[1].trim();
      } else {
        const searchUrl = `https://open-vsx.org/api/-/search?q=${encodeURIComponent(query)}&size=1`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        if (data.extensions && data.extensions.length > 0) {
          namespace = data.extensions[0].namespace;
          name = data.extensions[0].name;
        } else {
          throw new Error('未在 Open VSX 市场中找到匹配的插件，请提供精确的 namespace.name');
        }
      }

      // 2. 获取插件详情
      const detailUrl = `https://open-vsx.org/api/${namespace}/${name}`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) {
        throw new Error(`无法获取插件详情: ${namespace}.${name}`);
      }
      const extDetail = await detailRes.json();
      
      const kws = analysisKeywords
        .split(/[,，]/)
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const totalSteps = 1 + kws.length + 1;
      setAnalysisTotal(totalSteps);
      setAnalysisProgress(1);

      // 3. 关键词排名分析
      const kwResults = [];
      for (const kw of kws) {
        try {
          const kwSearchUrl = `https://open-vsx.org/api/-/search?q=${encodeURIComponent(kw)}&size=100`;
          const kwRes = await fetch(kwSearchUrl);
          const kwData = await kwRes.json();
          const list = kwData.extensions || [];
          
          let rank = -1;
          for (let i = 0; i < list.length; i++) {
            if (list[i].namespace.toLowerCase() === namespace.toLowerCase() && list[i].name.toLowerCase() === name.toLowerCase()) {
              rank = i + 1;
              break;
            }
          }

          const top3Competitors = list.slice(0, 3).map((comp: any) => ({
            name: comp.displayName || comp.name,
            id: `${comp.namespace}.${comp.name}`,
            downloads: comp.downloadCount || 0,
            rating: comp.averageRating || 0,
            icon: comp.files?.icon || ''
          }));

          // 口碑标杆评选 (借鉴目标)：排除自己，按 口碑分(平均评分 * (评价数 + 0.1)) 排序
          const ownId = `${namespace}.${name}`.toLowerCase();
          const listForBenchmark = list.filter((comp: any) => `${comp.namespace}.${comp.name}`.toLowerCase() !== ownId);
          const benchmarkApps = listForBenchmark
            .map((comp: any) => ({
              name: comp.displayName || comp.name,
              id: `${comp.namespace}.${comp.name}`,
              downloads: comp.downloadCount || 0,
              rating: comp.averageRating || 0,
              reviewCount: comp.reviewCount || 0,
              kpiScore: (comp.averageRating || 0) * ((comp.reviewCount || 0) + 0.1)
            }))
            .sort((a, b) => b.kpiScore - a.kpiScore)
            .slice(0, 3);

          // 关键词共性 ASO 挖掘：提取前 10 个排名最前插件的文案
          const top10Texts: string[] = [];
          list.slice(0, 10).forEach((comp: any) => {
            if (comp.displayName) top10Texts.push(comp.displayName);
            if (comp.description) top10Texts.push(comp.description);
          });
          const isChinese = ['cn', 'tw', 'hk'].includes(analysisCountry) || /[\u4e00-\u9fff]/.test(kw);
          const seoKeywords = extractSEOKeywordsFromTexts(top10Texts, isChinese);

          kwResults.push({
            keyword: kw,
            rank: rank,
            top3: top3Competitors,
            benchmarks: benchmarkApps,
            seoKeywords: seoKeywords
          });
        } catch (err) {
          console.error(`Error querying keyword ${kw}:`, err);
          kwResults.push({ keyword: kw, rank: -1, top3: [], benchmarks: [], seoKeywords: [] });
        } finally {
          setAnalysisProgress(prev => prev + 1);
        }
      }

      // 4. 获取分类下载排名与热门插件
      let categoryRank = -1;
      let categoryTotal = 0;
      let categoryTop5: any[] = [];
      const primaryCategory = (extDetail.categories && extDetail.categories.length > 0) 
        ? extDetail.categories[0] 
        : (analysisCategory.trim() || 'Other');

      try {
        const catUrl = `https://open-vsx.org/api/-/search?category=${encodeURIComponent(primaryCategory)}&sortBy=downloadCount&size=100`;
        const catRes = await fetch(catUrl);
        const catData = await catRes.json();
        const catList = catData.extensions || [];
        categoryTotal = catData.totalSize || catList.length;

        for (let i = 0; i < catList.length; i++) {
          if (catList[i].namespace.toLowerCase() === namespace.toLowerCase() && catList[i].name.toLowerCase() === name.toLowerCase()) {
            categoryRank = i + 1;
            break;
          }
        }

        categoryTop5 = catList.slice(0, 5).map((comp: any) => ({
          name: comp.displayName || comp.name,
          id: `${comp.namespace}.${comp.name}`,
          downloads: comp.downloadCount || 0,
          rating: comp.averageRating || 0,
          icon: comp.files?.icon || ''
        }));
      } catch (err) {
        console.error('Category analysis failed:', err);
      } finally {
        setAnalysisProgress(prev => prev + 1);
      }

      // 5. 科学算法指标计算
      let sumVisibility = 0;
      kwResults.forEach(item => {
        const r = item.rank;
        let v = 0;
        if (r === 1) v = 100;
        else if (r >= 2 && r <= 3) v = 95;
        else if (r >= 4 && r <= 10) v = 90 - 5 * (r - 4);
        else if (r >= 11 && r <= 30) v = 48 - 1.5 * (r - 11);
        else if (r >= 31 && r <= 100) v = 19 - 0.2 * (r - 31);
        else v = 0;
        sumVisibility += v;
      });
      const aspi = kwResults.length > 0 ? Math.round(sumVisibility / kwResults.length) : 0;

      let downloadPercentile = 50;
      const targetDownloads = extDetail.downloadCount || 0;
      if (categoryRank > 0) {
        downloadPercentile = Math.round(((categoryTotal - categoryRank) / categoryTotal) * 100);
      } else {
        if (targetDownloads > 1000000) downloadPercentile = 98;
        else if (targetDownloads > 100000) downloadPercentile = 90;
        else if (targetDownloads > 10000) downloadPercentile = 75;
        else if (targetDownloads > 1000) downloadPercentile = 50;
        else downloadPercentile = 20;
      }
      
      const ratingHealth = Math.round((extDetail.averageRating || 0) * 20);
      const mcoi = Math.round(0.4 * downloadPercentile + 0.4 * ratingHealth + 0.2 * aspi);

      const optimizationActions = [];
      const titleLower = (extDetail.displayName || '').toLowerCase();

      const missingTitleKws = kws.filter(k => !titleLower.includes(k.toLowerCase()));
      if (missingTitleKws.length > 0) {
        optimizationActions.push({
          type: 'danger',
          title: 'ASO 标题权重缺失',
          content: `核心检索词 [${missingTitleKws.join(', ')}] 未在您的插件显示名称 (displayName) 中出现。建议在不破坏品牌感的情况下，把主检索词融入 displayName 中（例如: ${extDetail.displayName} - ${missingTitleKws[0] || ''}）。`
        });
      } else if (kws.length > 0) {
        optimizationActions.push({
          type: 'success',
          title: 'ASO 标题检索词覆盖完美',
          content: `您的核心监测词已成功融入插件名称中，这提供了最高的搜索推荐基础权重。`
        });
      }

      const borderLineKws = kwResults.filter(item => item.rank > 10 && item.rank <= 30);
      if (borderLineKws.length > 0) {
        optimizationActions.push({
          type: 'warning',
          title: '临界流量突破建议',
          content: `关键词 [${borderLineKws.map(i => i.keyword).join(', ')}] 当前排名在 11-30 名之间。建议在插件 tags 列表 and description 正文开头增加这些词的出现频次，并在下个版本更新日志中描述该功能，以使其冲入前 10。`
        });
      }

      if (extDetail.averageRating && extDetail.averageRating < 4.3) {
        optimizationActions.push({
          type: 'danger',
          title: '评分健康度落后',
          content: `当前平均评分 ${extDetail.averageRating.toFixed(1)} 低于同分类优质插件的水位 (>= 4.5)。请重点查看用户负面反馈，降低故障率，以避免搜索排名被算法降权。`
        });
      } else if (targetDownloads > 100 && (extDetail.reviewCount || 0) === 0) {
        optimizationActions.push({
          type: 'warning',
          title: '引导好评机制缺失',
          content: `您的下载量已达 ${targetDownloads}，但评价数为 0。建议引导活跃用户留下好评，能大幅拉升 ASO 综合权重。`
        });
      }

      if (categoryTop5.length > 0 && targetDownloads < categoryTop5[0].downloads) {
        const gap = categoryTop5[0].downloads - targetDownloads;
        optimizationActions.push({
          type: 'info',
          title: '分类领跑者追赶度量',
          content: `当前分类 "${primaryCategory}" 的领跑者 "${categoryTop5[0].name}" 拥有 ${categoryTop5[0].downloads.toLocaleString()} 下载量。您与它相差 ${gap.toLocaleString()} 次下载。`
        });
      }

      setAnalysisResults({
        mode: 'openvsx',
        query: `${namespace}.${name}`,
        displayName: extDetail.displayName || name,
        description: extDetail.description || '',
        icon: extDetail.files?.icon || '',
        downloads: targetDownloads,
        rating: extDetail.averageRating || 0,
        reviewCount: extDetail.reviewCount || 0,
        version: extDetail.version || '0.0.1',
        category: primaryCategory,
        aspi,
        mcoi,
        downloadPercentile,
        kwResults,
        categoryRank,
        categoryTotal,
        categoryTop5,
        actions: optimizationActions
      });

    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || '分析过程中发生未知错误，请重试');
    } finally {
      setAnalysisLoading(false);
    }
  };

  // 运行 Chrome Web Store 插件市场分析与 ASO 排名评估
  const handleChromeAnalysis = async () => {
    const id = analysisQuery.trim();
    if (!id || id.length !== 32 || !/^[a-z]+$/.test(id)) {
      setAnalysisError('请输入 Chrome 插件的 32 位唯一 ID（例如: degimalgkelhibdpeofjmkmhdfneidca）');
      return;
    }
    
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResults(null);
    setAnalysisProgress(0);

    const kws = analysisKeywords
      .split(/[,，]/)
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const totalSteps = 1 + kws.length;
    setAnalysisTotal(totalSteps);

    try {
      // 1. 获取插件详情页并提取元数据
      const detailUrl = `https://chromewebstore.google.com/detail/placeholder/${id}`;
      const detailRes = await fetch(detailUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!detailRes.ok) {
        throw new Error('未找到该 Chrome 插件，请确认插件 ID 是否已发布且公开。');
      }
      const htmlText = await detailRes.text();
      setAnalysisProgress(1);

      // 解析详情
      let displayName = '';
      const titleMatch = htmlText.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        displayName = titleMatch[1].replace(/\s*-\s*Chrome\s*(Web\s*Store|应用商店)/i, '').trim();
      } else {
        displayName = '未命名插件';
      }

      let downloads = 0;
      const usersMatch = htmlText.match(/([\d,\.\s]+)\+?\s*users/i) || htmlText.match(/([\d,\.\s]+)\+?\s*位用户/i);
      if (usersMatch) {
        downloads = parseInt(usersMatch[1].replace(/[,.\s]/g, ''), 10) || 0;
      }

      let rating = 0;
      const ratingMatch = htmlText.match(/Average rating\s+([\d\.]+)\s+out of/i) || htmlText.match(/aria-label="Average rating\s+([\d\.]+)/i);
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]) || 0;
      }

      let reviewCount = 0;
      const ratingsMatch = htmlText.match(/([\d,]+)\s+ratings/i) || htmlText.match(/([\d,]+)\s+个评分/i);
      if (ratingsMatch) {
        reviewCount = parseInt(ratingsMatch[1].replace(/,/g, ''), 10) || 0;
      }

      let icon = '';
      const ogImgMatch = htmlText.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || htmlText.match(/<meta\s+content="([^"]+)"\s+property="og:image"/i);
      if (ogImgMatch) {
        icon = ogImgMatch[1];
      }

      let primaryCategory = 'Other';
      const cats = ['Productivity', 'Developer Tools', 'Workflow', 'Planning', 'Accessibility', 'Fun', 'Social', 'Shopping', 'Lifestyle', 'News', 'Education', 'Utilities', 'Communication', 'Photos'];
      for (const cat of cats) {
        if (htmlText.toLowerCase().includes(cat.toLowerCase())) {
          primaryCategory = cat;
          break;
        }
      }

      // 2. 关键词搜索排名抓取
      const kwResults = [];
      for (const kw of kws) {
        try {
          const kwUrl = `https://chromewebstore.google.com/search/${encodeURIComponent(kw)}`;
          const kwRes = await fetch(kwUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          const kwHtml = await kwRes.text();
          
          const foundIds: string[] = [];
          const slugMap: Record<string, string> = {}; 
          
          let match;
          // 精确正则限制：使用带有 data-item-id 的卡片匹配，防止匹配到无关广告与侧边栏静态推荐
          const itemRegex = /data-item-id="([a-z]{32})"[\s\S]*?href="\.\/detail\/([^/]+)\/\1"/gi;
          while ((match = itemRegex.exec(kwHtml)) !== null) {
            const competitorId = match[1].toLowerCase();
            const competitorSlug = match[2];
            if (!foundIds.includes(competitorId)) {
              foundIds.push(competitorId);
              slugMap[competitorId] = competitorSlug;
            }
          }

          let rank = -1;
          const userIdx = foundIds.indexOf(id.toLowerCase());
          if (userIdx >= 0) {
            rank = userIdx + 1;
          }

          // 并发 fetch 抓取前 3 名流量主详情，填充真实下载和评分数据
          const top3Competitors = [];
          const top3Texts: string[] = [];
          for (let i = 0; i < Math.min(3, foundIds.length); i++) {
            const compId = foundIds[i];
            const compSlug = slugMap[compId] || '';
            let compName = compSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            let compDl = 0;
            let compRt = 0;
            let compRev = 0;
            let compDesc = '';
            
            try {
              const compRes = await fetch(`https://chromewebstore.google.com/detail/placeholder/${compId}`, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
              });
              if (compRes.ok) {
                const compHtml = await compRes.text();
                const tMatch = compHtml.match(/<title>([^<]+)<\/title>/i);
                if (tMatch) {
                  compName = tMatch[1].replace(/\s*-\s*Chrome\s*(Web\s*Store|应用商店)/i, '').trim();
                }
                const uMatch = compHtml.match(/([\d,\.\s]+)\+?\s*users/i) || compHtml.match(/([\d,\.\s]+)\+?\s*位用户/i);
                if (uMatch) {
                  compDl = parseInt(uMatch[1].replace(/[,.\s]/g, ''), 10) || 0;
                }
                const rMatch = compHtml.match(/Average rating\s+([\d\.]+)\s+out of/i) || compHtml.match(/aria-label="Average rating\s+([\d\.]+)/i);
                if (rMatch) {
                  compRt = parseFloat(rMatch[1]) || 0;
                }
                const revMatch = compHtml.match(/([\d,]+)\s+ratings/i) || compHtml.match(/([\d,]+)\s+个评分/i);
                if (revMatch) {
                  compRev = parseInt(revMatch[1].replace(/,/g, ''), 10) || 0;
                }
                const dMatch = compHtml.match(/<meta[^>]+name="description"[^>]+content="([^\"]+)"/i) || compHtml.match(/<meta[^>]+property="og:description"[^>]+content="([^\"]+)"/i);
                if (dMatch) {
                  compDesc = dMatch[1];
                }
              }
            } catch (err) {
              console.error('Fetch competitor details failed', err);
            }
            
            top3Competitors.push({
              name: compName || compId,
              id: compId,
              downloads: compDl,
              rating: compRt,
              reviewCount: compRev
            });
            top3Texts.push(compName);
            if (compDesc) top3Texts.push(compDesc);
          }

          // 口碑标杆借鉴：在 Top 3 竞品中排除自己，按口碑值排序
          const benchmarkApps = top3Competitors
            .filter(comp => comp.id.toLowerCase() !== id.toLowerCase())
            .map(comp => ({
              name: comp.name,
              id: comp.id,
              downloads: comp.downloads,
              rating: comp.rating,
              reviewCount: comp.reviewCount,
              kpiScore: comp.rating * (comp.reviewCount + 0.1)
            }))
            .sort((a, b) => b.kpiScore - a.kpiScore);

          // 关键词共性 ASO 挖掘
          const isChinese = ['cn', 'tw', 'hk'].includes(analysisCountry) || /[\u4e00-\u9fff]/.test(kw);
          const seoKeywords = extractSEOKeywordsFromTexts(top3Texts, isChinese);

          kwResults.push({
            keyword: kw,
            rank: rank,
            top3: top3Competitors,
            benchmarks: benchmarkApps,
            seoKeywords: seoKeywords
          });
        } catch (err) {
          console.error(`CWS keyword ${kw} query failed:`, err);
          kwResults.push({ keyword: kw, rank: -1, top3: [], benchmarks: [], seoKeywords: [] });
        } finally {
          setAnalysisProgress(prev => prev + 1);
        }
      }

      // 3. 算法计算
      let sumVisibility = 0;
      kwResults.forEach(item => {
        const r = item.rank;
        let v = 0;
        if (r === 1) v = 100;
        else if (r >= 2 && r <= 3) v = 95;
        else if (r >= 4 && r <= 10) v = 90 - 5 * (r - 4);
        else if (r >= 11 && r <= 30) v = 48 - 1.5 * (r - 11);
        else if (r >= 31 && r <= 100) v = 19 - 0.2 * (r - 31);
        else v = 0;
        sumVisibility += v;
      });
      const aspi = kwResults.length > 0 ? Math.round(sumVisibility / kwResults.length) : 0;

      let downloadPercentile = 20;
      if (downloads > 100000) downloadPercentile = 95;
      else if (downloads > 10000) downloadPercentile = 85;
      else if (downloads > 1000) downloadPercentile = 65;
      else if (downloads > 100) downloadPercentile = 45;
      else if (downloads > 10) downloadPercentile = 25;

      const ratingHealth = rating > 0 ? Math.round(rating * 20) : 60;
      const mcoi = Math.round(0.4 * downloadPercentile + 0.4 * ratingHealth + 0.2 * aspi);

      const optimizationActions = [];
      const titleLower = displayName.toLowerCase();

      const missingTitleKws = kws.filter(k => !titleLower.includes(k.toLowerCase()));
      if (missingTitleKws.length > 0) {
        optimizationActions.push({
          type: 'danger',
          title: 'ASO 检索词覆盖警告',
          content: `核心监测词 [${missingTitleKws.join(', ')}] 未在您的插件标题中包含。建议在不破坏品牌感的情况下，将核心检索词植入您的插件显示名称中。`
        });
      } else if (kws.length > 0) {
        optimizationActions.push({
          type: 'success',
          title: 'ASO 标题检索词状态良好',
          content: `您的核心监测词已很好地包含在插件显示名称中。`
        });
      }

      const borderLineKws = kwResults.filter(item => item.rank > 10 && item.rank <= 30);
      if (borderLineKws.length > 0) {
        optimizationActions.push({
          type: 'warning',
          title: '搜索临界区突破方案',
          content: `您的插件在关键词 [${borderLineKws.map(i => i.keyword).join(', ')}] 的搜索结果中排在 11-30 名。建议在详细描述 (Store Listing Description) 的前几句合理增加这些词的出现频次，以便有效冲入搜索前 10。`
        });
      }

      if (rating > 0 && rating < 4.2) {
        optimizationActions.push({
          type: 'danger',
          title: '转化率流失警告 (评分偏低)',
          content: `当前评分 ${rating.toFixed(1)} 偏低。这会影响详情页转化率和自然搜索排名，建议针对用户负面反馈打磨体验。`
        });
      } else if (downloads > 100 && reviewCount === 0) {
        optimizationActions.push({
          type: 'warning',
          title: '缺少社交共鸣 (0 ratings)',
          content: `用户已有 ${downloads} 人，但评分为 0。建议在插件内引导活跃用户留下评论以突破冷启动瓶颈。`
        });
      }

      setAnalysisResults({
        mode: 'chrome',
        query: id,
        displayName,
        description: '',
        icon: icon || '',
        downloads,
        rating,
        reviewCount,
        version: '',
        category: primaryCategory,
        aspi,
        mcoi,
        downloadPercentile,
        kwResults,
        categoryRank: -1,
        categoryTotal: 0,
        categoryTop5: [],
        actions: optimizationActions
      });

    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || '分析过程中发生未知错误，请重试');
    } finally {
      setAnalysisLoading(false);
    }
  };
  const handleAnalysisSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (analysisMode === 'appstore') {
      handleAppStoreAnalysis();
    } else if (analysisMode === 'openvsx') {
      handleOpenVSXAnalysis();
    } else if (analysisMode === 'chrome') {
      handleChromeAnalysis();
    }
  };

  // 翻译功能专属状态
  const [enableTranslation, setEnableTranslation] = useState(false);
  const [translationCache, setTranslationCache] = useState<Record<string, string>>({});

  const handleAddTranslation = (original: string, translated: string) => {
    setTranslationCache(prev => ({ ...prev, [original]: translated }));
  };

  // 记录上次检测到的标签页 URL，用于切换关键词或页面时清空抓取列表
  const [lastUrl, setLastUrl] = useState('');


  // 运行苹果 AppStore 的商业可行性与 ASO 关键词分析（无付费 API 纯净本地版）
  const handleAppStoreAnalysis = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = analysisQuery.trim();
    if (!query) {
      setAnalysisError('请输入关键词或 App ID');
      return;
    }
    
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisResults(null);
    setAnalysisProgress(0);
    setAnalysisTotal(0);

    const country = analysisCountry;
    // 获取对应的 X-Apple-Store-Front
    const storeFronts: Record<string, string> = {
      us: '143441-1,29',
      cn: '143465-19,29',
      jp: '143462-9,29',
      gb: '143444-9,29',
      tw: '143470-1,29',
      hk: '143463-1,29'
    };
    const storeFrontHeader = storeFronts[country] || '143441-1,29';

    try {
      // 1. 判断输入是否为纯数字 (App ID)
      const isAppId = /^\d+$/.test(query);
      let appList: any[] = [];

      if (isAppId) {
        // 直接根据 ID 获取详情
        const lookupUrl = `https://itunes.apple.com/lookup?id=${query}&country=${country}`;
        const res = await fetch(lookupUrl);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          appList = [data.results[0]];
        } else {
          throw new Error('未找到该 App ID 的详细信息');
        }
      } else {
        // 根据关键词搜索排名前 10 的 App（扩大样本数据）
        const searchUrl = `https://itunes.apple.com/search?media=software&term=${encodeURIComponent(query)}&country=${country}&limit=10`;
        const res = await fetch(searchUrl);
        const data = await res.json();
        appList = data.results || [];
      }

      if (appList.length === 0) {
        throw new Error('未检索到相关应用，请更换检索词或地区');
      }

      setAnalysisTotal(appList.length);

      // 2. 抓取 Autocomplete Hints 联想词树
      let hintsList: string[] = [];
      try {
        const hintRes = await fetch(
          `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(isAppId ? appList[0].trackName : query)}`,
          {
            headers: {
              'User-Agent': 'AppStore/3.0 iOS/15.0',
              'X-Apple-Store-Front': storeFrontHeader
            }
          }
        );
        const hintText = await hintRes.text();
        // 因为返回是 XML plist 格式，我们在本地用正则匹配 <string>...</string> 提取 hints
        const termRegex = /<key>term<\/key>\s*<string>([^<]+)<\/string>/g;
        let match;
        while ((match = termRegex.exec(hintText)) !== null) {
          const termVal = match[1].trim();
          if (termVal && !hintsList.includes(termVal)) {
            hintsList.push(termVal);
          }
        }
      } catch (err) {
        console.error('Fetch search hints failed:', err);
      }

      // 3. 对每一个 App 异步爬取详情页 HTML，提取内购项与精选评论
      const analyzedApps = await Promise.all(
        appList.map(async (app) => {
          const trackId = app.trackId;
          const detailPageUrl = `https://apps.apple.com/${country}/app/id${trackId}`;
          let inAppPurchases: { name: string; price: string }[] = [];
          let reviews: any[] = [];
          
          try {
            // 直接抓取网页内容
            const htmlRes = await fetch(detailPageUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            const htmlText = await htmlRes.text();
            
            // 匹配 serialized-server-data JSON 脚本
            const serverDataRegex = /<script[^>]+id="serialized-server-data"[^>]*>([\s\S]*?)<\/script>/;
            const match = htmlText.match(serverDataRegex);
            if (match) {
              const serverJson = JSON.parse(match[1].trim());
              
              // 提取 IAPs
              const infoItems = serverJson.data?.[0]?.data?.shelfMapping?.information?.items || [];
              const iapSection = infoItems.find(
                (item: any) => item.title === "In-App Purchases" || item.title === "App 内购买项目"
              );
              if (iapSection && iapSection.items_V3) {
                iapSection.items_V3.forEach((item: any) => {
                  if (item.leadingText && item.trailingText) {
                    inAppPurchases.push({ name: item.leadingText, price: item.trailingText });
                  }
                });
              } else if (iapSection && iapSection.items && iapSection.items[0]?.textPairs) {
                // 备用解析
                iapSection.items[0].textPairs.forEach((pair: any) => {
                  if (pair[0] && pair[1]) {
                    inAppPurchases.push({ name: pair[0], price: pair[1] });
                  }
                });
              }
              
              // 提取评论
              const reviewsList = serverJson.data?.[0]?.data?.shelfMapping?.productRatings?.seeAllAction?.pageData?.shelves?.[1]?.items || [];
              reviewsList.forEach((r: any) => {
                if (r.$kind === 'Review') {
                  reviews.push({
                    id: r.id,
                    title: r.title || '',
                    date: r.date || '',
                    content: r.contents || '',
                    rating: r.rating || 0,
                    author: r.reviewerName || '',
                    developerResponse: r.response?.contents || null
                  });
                }
              });
            }
          } catch (err) {
            console.error(`Scrape details failed for app ${trackId}:`, err);
          } finally {
            // 增加实时抓取进度更新
            setAnalysisProgress(prev => prev + 1);
          }
          
          // 计算该应用的 WTP (付费意愿) 和 NPI (痛点紧迫度)
          let wtpCountPositive = 0;
          let wtpCountNegative = 0;
          let npiCount = 0;
          
          const wtpPositiveRegex = /已订阅|买了永久|值这个钱|付费支持|worth every penny|subscribed|purchased|lifetime|pro|buy/i;
          const wtpNegativeRegex = /太贵|吃相难看|强制订阅|欺诈|广告太多|scam|overpriced|too expensive|ads|waste/i;
          const painpointRegex = /希望加入|要是能|闪退|无法保存|缺少功能|bug|wish it had|missing feature|crash|please add/i;
          
          reviews.forEach((rev) => {
            const text = `${rev.title} ${rev.content}`.toLowerCase();
            if (wtpPositiveRegex.test(text)) wtpCountPositive++;
            if (wtpNegativeRegex.test(text)) wtpCountNegative++;
            if (painpointRegex.test(text) || rev.rating <= 3) npiCount++;
          });
          
          const iapWeight = inAppPurchases.length > 0 ? (inAppPurchases.some(p => p.name.includes('Lifetime') || p.name.includes('永久') || p.name.includes('买断')) ? 2.0 : 1.5) : 0.5;
          const calculatedWtp = reviews.length > 0 
            ? Math.min(10, Math.round(((wtpCountPositive + 0.5 * (reviews.length - wtpCountPositive - wtpCountNegative)) / (wtpCountNegative + 1)) * iapWeight * 3)) 
            : 5;
            
          const calculatedNpi = reviews.length > 0
            ? Math.min(10, Math.round((npiCount / reviews.length) * 10))
            : 3;

          // 计算“反向优化突破潜力分 (Opportunity Score)”
          // 公式: log10(评分数 + 1) * (5 - 评分)
          const ratingCount = app.userRatingCount || 0;
          const logRatingCount = Math.log10(ratingCount + 1);
          const calculatedOppScore = Number((logRatingCount * (5 - (app.averageUserRating || 0))).toFixed(2));
            
          return {
            id: trackId,
            name: app.trackName,
            icon: app.artworkUrl100,
            developer: app.artistName,
            genre: app.primaryGenreName,
            rating: app.averageUserRating || 0,
            ratingCount,
            price: app.formattedPrice || 'Free',
            url: app.trackViewUrl,
            inAppPurchases,
            reviews,
            wtp: calculatedWtp,
            npi: calculatedNpi,
            oppScore: calculatedOppScore
          };
        })
      );

      // 4. 计算整个赛道的综合指标 (Macro Indicators)
      const avgWtp = analyzedApps.length > 0 
        ? Math.round(analyzedApps.reduce((acc, app) => acc + app.wtp, 0) / analyzedApps.length) 
        : 0;
      const avgNpi = analyzedApps.length > 0 
        ? Math.round(analyzedApps.reduce((acc, app) => acc + app.npi, 0) / analyzedApps.length) 
        : 0;

      // 5. 优化短语级 ASO SEO 词频统计（中英文 N-Gram 分词）
      const isChinese = ['cn', 'tw', 'hk'].includes(country) || /[\u4e00-\u9fff]/.test(query);
      const lang = isChinese ? 'zh' : 'en';
      
      const extractPhrases = (apps: any[], language: 'zh' | 'en') => {
        const phraseCounts: Record<string, number> = {};
        
        const enStopwords = [
          'the', 'and', 'to', 'a', 'of', 'in', 'is', 'it', 'for', 'this', 'that', 'with', 
          'but', 'i', 'you', 'app', 'my', 'on', 'have', 'are', 'was', 'so', 'just', 'be', 
          'or', 'not', 'at', 'an', 'as', 'if', 'me', 'my', 'can', 'with', 'about', 'would',
          'there', 'their', 'they', 'we', 'our', 'will', 'this', 'get', 'like', 'good', 
          'great', 'love', 'use', 'really', 'very', 'more', 'when', 'some', 'out', 'all',
          'one', 'only', 'than', 'into', 'even', 'make', 'also', 'after', 'been', 'which'
        ];
        
        const zhStopwords = [
          '的', '了', '是', '在', '我', '你', '他', '她', '它', '这', '那', '和', '有', '无', 
          '也', '就', '都', '而', '及', '与', '被', '让', '使', '等', '及', '关于', '对于', 
          '一个', '这个', '那个', '软件', '应用', '使用', '感觉', '觉得', '希望', '如果',
          '不能', '无法', '支持', '更新', '下载', '打开', '闪退', '因为', '所以', '但是'
        ];

        apps.forEach(appItem => {
          appItem.reviews.forEach((rev: any) => {
            if (rev.rating <= 3) {
              const text = `${rev.title} ${rev.content}`;
              
              if (language === 'zh') {
                // 中文滑动窗口分词 (提取 3 到 4 个字的中文短句短语)
                const cleanText = text.replace(/[^\u4e00-\u9fa5]/g, ' ');
                const segments = cleanText.split(/\s+/).filter(s => s.length >= 3);
                
                segments.forEach(seg => {
                  for (let len of [3, 4]) {
                    for (let i = 0; i <= seg.length - len; i++) {
                      const phrase = seg.slice(i, i + len);
                      // 排除包含常见停用词且未携带实际名词含义的短语
                      if (!zhStopwords.some(sw => phrase.includes(sw) && phrase.length <= sw.length + 1)) {
                        phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
                      }
                    }
                  }
                });
              } else {
                // 英文 N-Gram 分词 (2-gram & 3-gram)
                const cleanText = text.replace(/[^a-zA-Z\s]/g, '').toLowerCase();
                const words = cleanText.split(/\s+/).filter(w => w.length > 2);
                
                // 提取 2-gram
                for (let i = 0; i < words.length - 1; i++) {
                  const w1 = words[i];
                  const w2 = words[i+1];
                  if (!enStopwords.includes(w1) && !enStopwords.includes(w2)) {
                    const phrase = `${w1} ${w2}`;
                    phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
                  }
                }
                // 提取 3-gram
                for (let i = 0; i < words.length - 2; i++) {
                  const w1 = words[i];
                  const w2 = words[i+1];
                  const w3 = words[i+2];
                  if (!enStopwords.includes(w1) && !enStopwords.includes(w3)) {
                    const phrase = `${w1} ${w2} ${w3}`;
                    phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
                  }
                }
              }
            }
          });
        });

        return Object.entries(phraseCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(e => ({ word: e[0], count: e[1] }));
      };
      
      const topPainWords = extractPhrases(analyzedApps, lang);

      // 6. 整理反向优化建议榜
      const reverseOpportunities = analyzedApps
        .filter((app: any) => app.ratingCount > 30 && app.rating <= 4.2)
        .sort((a: any, b: any) => b.oppScore - a.oppScore)
        .slice(0, 3)
        .map((app: any) => {
          // 挑选出该竞品最典型的痛点评论作为具体突破口
          const coreComplaints = app.reviews
            .filter((r: any) => r.rating <= 3)
            .slice(0, 2)
            .map((r: any) => ({
              rating: r.rating,
              title: r.title,
              content: r.content
            }));
          return {
            id: app.id,
            name: app.name,
            icon: app.icon,
            rating: app.rating,
            ratingCount: app.ratingCount,
            oppScore: app.oppScore,
            url: app.url,
            coreComplaints
          };
        });

      setAnalysisResults({
        query: isAppId ? appList[0].trackName : query,
        avgWtp,
        avgNpi,
        topPainWords,
        apps: analyzedApps,
        hints: hintsList,
        reverseOpportunities
      });

    } catch (err: any) {
      console.error(err);
      setAnalysisError(err.message || '分析过程中发生未知错误，请重试');
    } finally {
      setAnalysisLoading(false);
    }
  };

  
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
        'yinliActiveProductId',
        'savedOpenVSXPlugins',
        'savedChromePlugins'
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
        if (result.savedOpenVSXPlugins) {
          setSavedOpenVSXPlugins(result.savedOpenVSXPlugins);
        }
        if (result.savedChromePlugins) {
          setSavedChromePlugins(result.savedChromePlugins);
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
        
        // 如果活动页的 URL 变化了，且是非空（例如新关键词搜索），清空旧抓取视频列表
        setLastUrl((prevUrl) => {
          if (urlStr && prevUrl && urlStr !== prevUrl) {
            // URL 确实发生了改变，重置视频抓取列表
            setPosts([]);
            setSelectedPostIds([]);
            setSelectedPost(null);
          }
          return urlStr;
        });

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

    // 清空上一个关键词的抓取视频列表
    setPosts([]);
    setSelectedPostIds([]);
    setSelectedPost(null);

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

      // 验证成功后，直接使用输入的 API Key 作为 token 保存
      setYinliToken(targetKey);
      setYinliUser(data.user);
      
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({
          yinliToken: targetKey,
          yinliUser: data.user,
          yinliApiUrl: yinliApiUrl, // 同时保存 API 服务端地址，以防重新启动后被重置为默认值导致验证失败
        });
      }

      showToast('隐力 API Key 绑定成功！', 'success');
      setYinliApiKey('');
      
      // 绑定成功后拉取产品列表
      fetchYinliProducts(targetKey);
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
        <div className="flex items-center gap-2">
          {/* 翻译自动开关 */}
          <button
            onClick={() => setEnableTranslation(!enableTranslation)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all duration-200 flex items-center gap-1 ${
              enableTranslation 
                ? 'bg-indigo-600/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-600/30' 
                : 'bg-slate-800 text-slate-400 border-slate-700/60 hover:text-slate-300 hover:bg-slate-700/60'
            }`}
            title={enableTranslation ? "点击关闭自动翻译" : "点击开启自动翻译（免费谷歌服务）"}
          >
            <span>🌐 {enableTranslation ? '译: 开' : '译: 关'}</span>
          </button>

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
          onClick={() => setActiveTab('analysis')}
          className={`flex-1 py-2.5 text-center border-b-2 transition-all duration-200 ${
            activeTab === 'analysis' 
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5' 
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📊 App分析
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
                          <TranslatedText 
                            text={post.content} 
                            enabled={enableTranslation} 
                            cache={translationCache} 
                            onTranslated={handleAddTranslation} 
                          />
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
                        <TranslatedText 
                          text={selectedYinliSignal.title} 
                          enabled={enableTranslation} 
                          cache={translationCache} 
                          onTranslated={handleAddTranslation} 
                        />
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed bg-slate-900/40 p-1.5 rounded border border-slate-900/60">
                        <TranslatedText 
                          text={selectedYinliSignal.textContent} 
                          enabled={enableTranslation} 
                          cache={translationCache} 
                          onTranslated={handleAddTranslation} 
                        />
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
                            <span className="truncate italic">
                              "<TranslatedText 
                                text={post.content} 
                                enabled={enableTranslation} 
                                cache={translationCache} 
                                onTranslated={handleAddTranslation} 
                              />"
                            </span>
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
            
            {/* 常用插件 ID 管理 */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 shrink-0">
              <h3 className="text-xs font-semibold text-slate-300">常用插件 ID 管理</h3>
              
              {/* OpenVSX 插件保存 */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 block font-medium">OpenVSX 插件 ID (如 meta.pyrefly)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="newOpenVSXId"
                    placeholder="ID: namespace.name"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
                  />
                  <input
                    type="text"
                    id="newOpenVSXName"
                    placeholder="备注"
                    className="w-20 px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const idInput = document.getElementById('newOpenVSXId') as HTMLInputElement;
                      const nameInput = document.getElementById('newOpenVSXName') as HTMLInputElement;
                      const id = idInput?.value.trim();
                      if (!id) return;
                      const name = nameInput?.value.trim() || id;
                      const updated = [...savedOpenVSXPlugins, { id, name }];
                      setSavedOpenVSXPlugins(updated);
                      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        chrome.storage.local.set({ savedOpenVSXPlugins: updated });
                      }
                      if (idInput) idInput.value = '';
                      if (nameInput) nameInput.value = '';
                    }}
                    className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                  >
                    保存
                  </button>
                </div>
                {/* 列表 */}
                <div className="flex flex-wrap gap-1 mt-1 max-h-[80px] overflow-y-auto pr-1">
                  {savedOpenVSXPlugins.map((plugin, index) => (
                    <span key={index} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 border border-slate-850 rounded-md text-[10px] text-slate-300">
                      <span className="truncate max-w-[80px]" title={plugin.id}>{plugin.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = savedOpenVSXPlugins.filter((_, i) => i !== index);
                          setSavedOpenVSXPlugins(updated);
                          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                            chrome.storage.local.set({ savedOpenVSXPlugins: updated });
                          }
                        }}
                        className="text-slate-500 hover:text-rose-400 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Chrome 插件保存 */}
              <div className="space-y-1.5 pt-2.5 border-t border-slate-900/40">
                <label className="text-[10px] text-slate-400 block font-medium">Chrome 插件 ID (32位小写字母)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    id="newChromeId"
                    placeholder="32位 ID"
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
                  />
                  <input
                    type="text"
                    id="newChromeName"
                    placeholder="备注"
                    className="w-20 px-2 py-1.5 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const idInput = document.getElementById('newChromeId') as HTMLInputElement;
                      const nameInput = document.getElementById('newChromeName') as HTMLInputElement;
                      const id = idInput?.value.trim().toLowerCase();
                      if (!id || id.length !== 32) {
                        showToast('请输入32位有效Chrome插件ID', 'error');
                        return;
                      }
                      const name = nameInput?.value.trim() || id;
                      const updated = [...savedChromePlugins, { id, name }];
                      setSavedChromePlugins(updated);
                      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                        chrome.storage.local.set({ savedChromePlugins: updated });
                      }
                      if (idInput) idInput.value = '';
                      if (nameInput) nameInput.value = '';
                    }}
                    className="px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold active:scale-95 transition-transform"
                  >
                    保存
                  </button>
                </div>
                {/* 列表 */}
                <div className="flex flex-wrap gap-1 mt-1 max-h-[80px] overflow-y-auto pr-1">
                  {savedChromePlugins.map((plugin, index) => (
                    <span key={index} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-950 border border-slate-850 rounded-md text-[10px] text-slate-300">
                      <span className="truncate max-w-[80px]" title={plugin.id}>{plugin.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = savedChromePlugins.filter((_, i) => i !== index);
                          setSavedChromePlugins(updated);
                          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
                            chrome.storage.local.set({ savedChromePlugins: updated });
                          }
                        }}
                        className="text-slate-500 hover:text-rose-400 font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
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

        {/* VIEW 5: AppStore ASO 与商业可行性分析 */}
        {activeTab === 'analysis' && (
          <div className="flex flex-col h-full space-y-4 min-h-0 overflow-y-auto pr-1">
            {/* 模式选择 Tab */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-850 shrink-0">
              <button
                type="button"
                onClick={() => { setAnalysisMode('appstore'); setAnalysisResults(null); setAnalysisError(null); }}
                className={`py-2 text-[10px] font-bold rounded-lg transition-all ${analysisMode === 'appstore' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50' : 'text-slate-400 hover:text-slate-200'}`}
              >
                🍎 AppStore 分析
              </button>
              <button
                type="button"
                onClick={() => { setAnalysisMode('openvsx'); setAnalysisResults(null); setAnalysisError(null); }}
                className={`py-2 text-[10px] font-bold rounded-lg transition-all ${analysisMode === 'openvsx' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50' : 'text-slate-400 hover:text-slate-200'}`}
              >
                📦 OpenVSX 插件
              </button>
              <button
                type="button"
                onClick={() => { setAnalysisMode('chrome'); setAnalysisResults(null); setAnalysisError(null); }}
                className={`py-2 text-[10px] font-bold rounded-lg transition-all ${analysisMode === 'chrome' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/50' : 'text-slate-400 hover:text-slate-200'}`}
              >
                🌐 Chrome 插件
              </button>
            </div>

            {/* 搜索控制区域 */}
            <form onSubmit={handleAnalysisSubmit} className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 shrink-0">
              <h3 className="text-xs font-semibold text-slate-300">
                {analysisMode === 'appstore' && '🍎 AppStore 市场与 ASO 探针'}
                {analysisMode === 'openvsx' && '📦 OpenVSX 插件 ASO 排名雷达'}
                {analysisMode === 'chrome' && '🌐 Chrome 插件 ASO 排名雷达'}
              </h3>
              
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={
                      analysisMode === 'appstore' 
                        ? '输入关键词或 App ID' 
                        : analysisMode === 'openvsx' 
                          ? '输入插件 ID (如: meta.pyrefly)' 
                          : '输入插件 32 位 ID (如: degimalg...'
                    }
                    value={analysisQuery}
                    onChange={(e) => setAnalysisQuery(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500"
                  />
                  {analysisMode === 'appstore' && (
                    <select
                      value={analysisCountry}
                      onChange={(e) => setAnalysisCountry(e.target.value)}
                      className="px-2 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="us">美国 🇺🇸</option>
                      <option value="cn">中国 🇨🇳</option>
                      <option value="jp">日本 🇯🇵</option>
                      <option value="gb">英国 🇬🇧</option>
                      <option value="tw">中国台湾 🇹🇼</option>
                      <option value="hk">中国香港 🇭🇰</option>
                    </select>
                  )}
                </div>

                {/* 快捷点击粘贴已存储的插件 */}
                {analysisMode === 'openvsx' && savedOpenVSXPlugins.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center bg-slate-950/40 p-2 rounded-lg border border-slate-850/50">
                    <span className="text-[10px] text-slate-500 shrink-0">已存插件:</span>
                    <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
                      {savedOpenVSXPlugins.map((plugin, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAnalysisQuery(plugin.id)}
                          className="px-2 py-0.5 bg-slate-950 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-850 hover:border-indigo-500/30 text-slate-300 rounded text-[9px] transition-colors truncate max-w-[120px]"
                          title={plugin.id}
                        >
                          {plugin.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {analysisMode === 'chrome' && savedChromePlugins.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center bg-slate-950/40 p-2 rounded-lg border border-slate-850/50">
                    <span className="text-[10px] text-slate-500 shrink-0">已存插件:</span>
                    <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto">
                      {savedChromePlugins.map((plugin, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAnalysisQuery(plugin.id)}
                          className="px-2 py-0.5 bg-slate-950 hover:bg-indigo-950 hover:text-indigo-300 border border-slate-850 hover:border-indigo-500/30 text-slate-300 rounded text-[9px] transition-colors truncate max-w-[120px]"
                          title={plugin.id}
                        >
                          {plugin.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {analysisMode !== 'appstore' && (
                  <input
                    type="text"
                    placeholder="核心监测关键词 (用逗号隔开，如: git, git graph)"
                    value={analysisKeywords}
                    onChange={(e) => setAnalysisKeywords(e.target.value)}
                    className="px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500"
                  />
                )}
              </div>

              <button
                type="submit"
                disabled={analysisLoading}
                className="w-full py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950/20"
              >
                {analysisLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>正在解析数据 ({analysisProgress} / {analysisTotal})...</span>
                  </>
                ) : (
                  <>
                    <span>🚀 开始实时商业化评估</span>
                  </>
                )}
              </button>
            </form>

            {analysisError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 shrink-0">
                ⚠️ {analysisError}
              </div>
            )}

            {/* 分析结果展示区 */}
            {analysisResults ? (
              analysisResults.mode && analysisResults.mode !== 'appstore' ? (
                // 插件分析报告 (OpenVSX 和 Chrome)
                <div className="space-y-4 pb-4">
                  {/* 1. 插件基础摘要 */}
                  <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 flex items-start gap-3 shrink-0">
                    {analysisResults.icon ? (
                      <img src={analysisResults.icon} className="w-12 h-12 rounded-xl object-cover border border-slate-800" alt="" />
                    ) : (
                      <div className="w-12 h-12 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center text-xl shrink-0">
                        {analysisResults.mode === 'chrome' ? '🧩' : '📦'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-xs font-bold text-slate-100 truncate">{analysisResults.displayName}</h3>
                        <a
                          href={getMarketLink(analysisResults.query, analysisResults.mode)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold shrink-0 transition-colors"
                          title="在市场中打开详情页"
                        >
                          ↗
                        </a>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate font-mono">{analysisResults.query}</p>
                      <div className="flex flex-wrap gap-2 text-[9px] text-slate-500">
                        <span>下载/用户: <strong className="text-slate-300">{(analysisResults.downloads || 0).toLocaleString()}</strong></span>
                        <span>评分: <strong className="text-slate-300">{(analysisResults.rating || 0).toFixed(1)} ★</strong> ({analysisResults.reviewCount || 0})</span>
                        <span>分类: <strong className="text-indigo-400">{analysisResults.category}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* 2. 双维度核心雷达指标 */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* ASPI 搜索能见度 */}
                    <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between relative overflow-hidden">
                      <div>
                        <span className="text-[10px] text-slate-400">ASO 搜索能见度 (ASPI)</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-indigo-400">{analysisResults.aspi}</span>
                          <span className="text-[10px] text-slate-500">/ 100</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full" 
                          style={{ width: `${analysisResults.aspi}%` }}
                        />
                      </div>
                      {/* 等级标签 */}
                      <span className="absolute top-2 right-2 text-xl font-black opacity-10 text-indigo-400">
                        {analysisResults.aspi >= 90 ? 'S' : analysisResults.aspi >= 75 ? 'A' : analysisResults.aspi >= 50 ? 'B' : 'C'}
                      </span>
                    </div>

                    {/* MCOI 市场竞争力 */}
                    <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-3 rounded-xl border border-slate-800/80 flex flex-col justify-between relative overflow-hidden">
                      <div>
                        <span className="text-[10px] text-slate-400">市场竞争力指数 (MCOI)</span>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-2xl font-black text-violet-400">{analysisResults.mcoi}</span>
                          <span className="text-[10px] text-slate-500">/ 100</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-full" 
                          style={{ width: `${analysisResults.mcoi}%` }}
                        />
                      </div>
                      <span className="absolute top-2 right-2 text-xl font-black opacity-10 text-violet-400">
                        {analysisResults.mcoi >= 90 ? 'S' : analysisResults.mcoi >= 75 ? 'A' : analysisResults.mcoi >= 50 ? 'B' : 'C'}
                      </span>
                    </div>
                  </div>

                  {/* 3. 关键词搜索排名 & 竞品 Benchmark */}
                  {analysisResults.kwResults && analysisResults.kwResults.length > 0 && (
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 shrink-0">
                      <h3 className="text-xs font-bold text-slate-200">🔍 关键词搜索排名 & ASO 标杆对比</h3>
                      <div className="space-y-3">
                        {analysisResults.kwResults.map((kwRes: any, idx: number) => (
                          <div key={idx} className="bg-slate-950/60 p-3 rounded-lg border border-slate-850 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-200">#{kwRes.keyword}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                kwRes.rank === 1 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                kwRes.rank > 1 && kwRes.rank <= 10 ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                                kwRes.rank > 10 && kwRes.rank <= 30 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                                排名: {kwRes.rank > 0 ? `第 ${kwRes.rank} 名` : '未上榜 (>100)'}
                              </span>
                            </div>

                            {/* Top 3 Competitors */}
                            {kwRes.top3 && kwRes.top3.length > 0 && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-semibold text-slate-500 block">该检索词下 Top 3 流量主:</span>
                                <div className="grid grid-cols-3 gap-2">
                                  {kwRes.top3.map((comp: any, cidx: number) => (
                                    <div key={cidx} className="bg-slate-900/80 p-1.5 rounded border border-slate-850 flex flex-col justify-between text-[9px] min-w-0">
                                      <div className="flex items-center justify-between gap-1 min-w-0">
                                        <span className="text-slate-300 font-bold truncate flex-1" title={comp.name}>{comp.name}</span>
                                        <a
                                          href={getMarketLink(comp.id, analysisResults.mode)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold shrink-0 transition-colors"
                                          title="在市场中打开"
                                        >
                                          ↗
                                        </a>
                                      </div>
                                      {comp.downloads > 0 ? (
                                        <span className="text-slate-400 font-semibold truncate">
                                          {comp.downloads >= 1000 ? `${(comp.downloads / 1000).toFixed(0)}k` : comp.downloads} {analysisResults.mode === 'chrome' ? 'users' : 'dl'}
                                        </span>
                                      ) : (
                                        <span className="text-slate-500 font-mono">No. {cidx+1}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Mined SEO/ASO Keywords */}
                            {kwRes.seoKeywords && kwRes.seoKeywords.length > 0 && (
                              <div className="space-y-1 pt-1.5 border-t border-slate-900/50">
                                <span className="text-[9px] font-semibold text-slate-500 block">💡 逆向 ASO 词频挖掘 (高能见度热词):</span>
                                <div className="flex flex-wrap gap-1">
                                  {kwRes.seoKeywords.map((item: any, sidx: number) => (
                                    <span key={sidx} className="px-1.5 py-0.2 bg-slate-900 border border-slate-850 text-slate-400 rounded text-[9px]">
                                      {item.word} ({item.count})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Recommended Benchmark/Inspiration Apps */}
                            {kwRes.benchmarks && kwRes.benchmarks.length > 0 && (
                              <div className="space-y-1 pt-1.5 border-t border-slate-900/50">
                                <span className="text-[9px] font-bold text-indigo-400 block">🎯 借鉴口碑标杆 (高频好评/SEO佳作):</span>
                                <div className="space-y-1">
                                  {kwRes.benchmarks.map((bench: any, bidx: number) => (
                                    <div key={bidx} className="flex justify-between items-center text-[9px] text-slate-400">
                                      <div className="flex items-center gap-1 min-w-0 flex-1">
                                        <span className="font-bold text-slate-300 truncate max-w-[130px]" title={bench.name}>
                                          {bidx+1}. {bench.name}
                                        </span>
                                        <a
                                          href={getMarketLink(bench.id, analysisResults.mode)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold shrink-0 transition-colors"
                                          title="在市场中打开"
                                        >
                                          ↗
                                        </a>
                                      </div>
                                      <span className="text-slate-500 shrink-0 font-mono pl-1">
                                        ★{bench.rating.toFixed(1)} ({bench.reviewCount}评) | {bench.downloads >= 100000 ? `${(bench.downloads/100000).toFixed(0)}y` : (bench.downloads >= 1000 ? `${(bench.downloads/1000).toFixed(0)}k` : bench.downloads)} dl
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 4. 分类下载排名与领跑者标杆 */}
                  {analysisResults.mode === 'openvsx' && analysisResults.categoryTop5 && analysisResults.categoryTop5.length > 0 && (
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-200">📊 分类下载排名</h3>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {analysisResults.categoryRank > 0 ? `第 ${analysisResults.categoryRank} 名 / 共 ${analysisResults.categoryTotal} 个` : `前 100 未上榜 / 共 ${analysisResults.categoryTotal} 个`}
                        </span>
                      </div>

                      <div className="space-y-1 bg-slate-950/60 p-2.5 rounded-lg border border-slate-850">
                        <span className="text-[9px] font-semibold text-slate-500 block">分类内热门领跑者 (Benchmark):</span>
                        <div className="space-y-1.5">
                          {analysisResults.categoryTop5.map((comp: any, cidx: number) => (
                            <div key={cidx} className="flex items-center justify-between text-[10px] text-slate-400 border-b border-slate-900/50 pb-1 last:border-b-0 last:pb-0">
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <span className="font-bold text-slate-300 truncate max-w-[140px]" title={comp.name}>
                                  {cidx+1}. {comp.name}
                                </span>
                                <a
                                  href={getMarketLink(comp.id, 'openvsx')}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-indigo-400 hover:text-indigo-300 text-[10px] font-bold shrink-0 transition-colors"
                                  title="在市场中打开"
                                >
                                  ↗
                                </a>
                              </div>
                              <span className="text-indigo-400 shrink-0 pl-1">{comp.downloads.toLocaleString()} 下载</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 5. 智能科学优化行动方案 */}
                  {analysisResults.actions && analysisResults.actions.length > 0 && (
                    <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/60 p-4 rounded-xl border border-indigo-500/20 space-y-3 shrink-0">
                      <h3 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <span>💡 ASO & 插件竞争力优化路线</span>
                      </h3>
                      
                      <div className="space-y-3">
                        {analysisResults.actions.map((act: any, idx: number) => (
                          <div key={idx} className={`p-3 rounded-lg border text-xs leading-relaxed ${
                            act.type === 'danger' ? 'bg-rose-500/5 border-rose-500/10 text-rose-300' :
                            act.type === 'warning' ? 'bg-amber-500/5 border-amber-500/10 text-amber-300' :
                            act.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300' :
                            'bg-slate-950/50 border-slate-850 text-slate-300'
                          }`}>
                            <span className="font-bold block pb-1">⚡ {act.title}：</span>
                            {act.content}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // 原有 AppStore 分析结果
                <div className="space-y-4 pb-4">
                  {/* 1. 赛道宏观仪表盘 */}
                  <div className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 p-4 rounded-2xl border border-slate-800/80 space-y-4 shrink-0">
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1">
                      🎯 赛道洞察: <span className="text-indigo-400">"{analysisResults.query}"</span>
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-400">平均付费意愿 (WTP)</span>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <span className="text-2xl font-black text-indigo-400">{analysisResults.avgWtp}</span>
                          <span className="text-[10px] text-slate-500">/ 10</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-indigo-500 to-violet-500 h-full rounded-full" 
                            style={{ width: `${analysisResults.avgWtp * 10}%` }}
                          />
                        </div>
                      </div>

                      <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/50 flex flex-col justify-between">
                        <span className="text-[10px] text-slate-400">用户痛点紧迫度 (NPI)</span>
                        <div className="flex items-baseline gap-1 mt-1.5">
                          <span className="text-2xl font-black text-violet-400">{analysisResults.avgNpi}</span>
                          <span className="text-[10px] text-slate-500">/ 10</span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-full" 
                            style={{ width: `${analysisResults.avgNpi * 10}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 核心痛点高频词 */}
                    {analysisResults.topPainWords.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <h4 className="text-[10px] font-semibold text-slate-400">用户主流诉求 & 痛点短语词频:</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {analysisResults.topPainWords.map((item: any, idx: number) => (
                            <span 
                              key={idx} 
                              className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/20 text-violet-300 rounded text-[9px] font-medium"
                            >
                              #{item.word} ({item.count})
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 反向突破雷达模块 */}
                  {analysisResults.reverseOpportunities && analysisResults.reverseOpportunities.length > 0 && (
                    <div className="bg-gradient-to-br from-rose-950/20 to-slate-900/60 p-4 rounded-xl border border-rose-500/20 space-y-3 shrink-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                          <span>🚨 反向突围潜力榜 (差评吸金机会)</span>
                        </h3>
                        <span className="text-[9px] text-slate-500">寻找高下载但口碑低的产品进行降维打击</span>
                      </div>

                      <div className="space-y-3">
                        {analysisResults.reverseOpportunities.map((opApp: any) => (
                          <div key={opApp.id} className="bg-slate-950/50 p-3 rounded-lg border border-slate-900 space-y-2">
                            <div className="flex items-center gap-2">
                              <img src={opApp.icon} className="w-6 h-6 rounded-md object-cover border border-slate-800" alt={opApp.name} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-bold text-slate-200 truncate">{opApp.name}</span>
                                    {opApp.url && (
                                      <a
                                        href={opApp.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-indigo-400 hover:text-indigo-300 text-[10px] shrink-0 font-semibold"
                                        title="在 App Store 中打开"
                                      >
                                        ↗
                                      </a>
                                    )}
                                  </div>
                                  <span className="text-[9px] text-rose-400 font-bold bg-rose-500/10 px-1 py-0.2 rounded shrink-0">潜力指数: {opApp.oppScore}</span>
                                </div>
                                <p className="text-[9px] text-slate-500 flex justify-between pt-0.5">
                                  <span>评分: {opApp.rating.toFixed(1)} ★ ({opApp.ratingCount} 个评分)</span>
                                </p>
                              </div>
                            </div>

                            {/* 痛点突破口 */}
                            {opApp.coreComplaints && opApp.coreComplaints.length > 0 && (
                              <div className="space-y-1 bg-rose-500/5 p-2 rounded border border-rose-500/10">
                                <span className="text-[9px] font-black text-rose-300 block">💡 致命痛点切入点 (有极大重构升级空间)：</span>
                                {opApp.coreComplaints.map((c: any, cIdx: number) => (
                                  <div key={cIdx} className="text-[9.5px] leading-relaxed text-slate-400 pl-1 border-l border-rose-400/40 my-1">
                                    <span className="font-bold text-rose-400">
                                      “<TranslatedText 
                                        text={c.title} 
                                        enabled={enableTranslation} 
                                        cache={translationCache} 
                                        onTranslated={handleAddTranslation} 
                                      />”
                                    </span> -{' '}
                                    <TranslatedText 
                                      text={c.content.slice(0, 150) + (c.content.length > 150 ? '...' : '')} 
                                      enabled={enableTranslation} 
                                      cache={translationCache} 
                                      onTranslated={handleAddTranslation} 
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 2. SEO / ASO 搜索联想词树 */}
                  {analysisResults.hints.length > 0 && (
                    <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800/80 space-y-2.5 shrink-0">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-200">🏷️ AppStore 搜索联想词 (ASO SEO)</h3>
                        <span className="text-[9px] text-slate-500">反映真实用户输入词频</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {analysisResults.hints.map((term: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setAnalysisQuery(term);
                            }}
                            className="px-2.5 py-1 bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 text-slate-300 hover:text-slate-100 rounded-lg text-[10px] transition-colors"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. 竞品 App格局深度解构 */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400">📱 竞品格局与商业模式解构</h3>
                    <div className="space-y-3">
                      {analysisResults.apps.map((app: any) => (
                        <AppDetailCard 
                          key={app.id} 
                          app={app} 
                          enableTranslation={enableTranslation}
                          translationCache={translationCache}
                          onTranslated={handleAddTranslation}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            ) : (
              !analysisLoading && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-3 bg-slate-900/20 rounded-2xl border border-slate-900/60">
                  <span className="text-4xl">📊</span>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-300">暂无分析数据</p>
                    <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
                      {analysisMode === 'appstore' && '请输入关键词或具体 App ID，系统将实时爬取 Apple AppStore 数据并计算评估。'}
                      {analysisMode === 'openvsx' && '请输入 Open VSX 插件 ID (如 meta.pyrefly) 并提供核心监测关键词，将为您评估搜索排名和优化方向。'}
                      {analysisMode === 'chrome' && '请输入 Chrome 插件 ID 并提供核心监测关键词，将为您计算 ASO 能见度及市场竞争力。'}
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// 竞品卡片子组件
function AppDetailCard({ 
  app, 
  enableTranslation, 
  translationCache, 
  onTranslated 
}: { 
  app: any; 
  enableTranslation: boolean; 
  translationCache: Record<string, string>; 
  onTranslated: (original: string, translated: string) => void; 
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-800/80 overflow-hidden transition-all duration-205">
      {/* 头部摘要 - 点击直接跳转到对应的 app 详情页面 */}
      <div 
        onClick={() => {
          if (app.url) {
            window.open(app.url, '_blank');
          }
        }}
        className="p-3 flex items-start gap-3 cursor-pointer hover:bg-slate-900/40 transition-colors"
      >
        <img 
          src={app.icon} 
          alt={app.name} 
          className="w-10 h-10 rounded-xl object-cover border border-slate-850 shrink-0" 
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-100 truncate">{app.name}</h4>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-black text-indigo-400">WTP: {app.wtp}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center min-w-[20px] h-[20px] font-mono text-[10px]"
                title={expanded ? "收起详情" : "展开详情"}
              >
                {expanded ? '▲' : '▼'}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 truncate">{app.developer} · {app.genre}</p>
          <div className="flex items-center justify-between text-[9px] text-slate-400 pt-1">
            <div className="flex items-center gap-1">
              <span className="text-amber-500">★</span>
              <span>{app.rating.toFixed(1)}</span>
              <span className="text-slate-500">({app.ratingCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">痛点 NPI: {app.npi}</span>
              <span className="px-1.5 py-0.2 bg-slate-950 rounded border border-slate-800 text-slate-300 font-semibold">{app.price}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 展开部分 */}
      {expanded && (
        <div className="border-t border-slate-850/50 bg-slate-950/40 p-3 space-y-3 text-[11px]">
          {/* 内购项列表 */}
          <div className="space-y-1.5">
            <h5 className="font-bold text-slate-400 flex items-center gap-1 text-[10px]">
              💰 App 内购买项目 (In-App Purchases)
            </h5>
            {app.inAppPurchases.length > 0 ? (
              <div className="grid grid-cols-1 gap-1 pl-1">
                {app.inAppPurchases.map((iap: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center py-0.5 border-b border-slate-900/40 last:border-0">
                    <span className="text-slate-300 truncate pr-2">{iap.name}</span>
                    <span className="text-indigo-400 font-bold font-mono text-[10px] shrink-0">{iap.price}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-600 pl-1">未检测到 App 内购买项目 (可能靠广告变现或完全免费)</p>
            )}
          </div>

          {/* 精选评论分析 */}
          <div className="space-y-2">
            <h5 className="font-bold text-slate-400 flex items-center justify-between text-[10px]">
              <span>💬 用户深度口碑与反馈 ({app.reviews.length} 条)</span>
              <a 
                href={app.url} 
                target="_blank" 
                rel="noreferrer" 
                className="text-indigo-400 hover:text-indigo-300 transition-colors text-[9px]"
              >
                去 AppStore 查看 ↗
              </a>
            </h5>
            {app.reviews.length > 0 ? (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {app.reviews.map((rev: any) => (
                  <div key={rev.id} className="bg-slate-900/40 p-2 rounded-lg border border-slate-900 space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="font-bold text-slate-300 truncate">
                        <TranslatedText 
                          text={rev.title} 
                          enabled={enableTranslation} 
                          cache={translationCache} 
                          onTranslated={onTranslated} 
                        />
                      </span>
                      <div className="flex items-center gap-1 text-amber-500 shrink-0 font-mono text-[9px]">
                        {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                      </div>
                    </div>
                    <p className="text-slate-400 text-[10px] leading-relaxed whitespace-pre-wrap">
                      <TranslatedText 
                        text={rev.content} 
                        enabled={enableTranslation} 
                        cache={translationCache} 
                        onTranslated={onTranslated} 
                      />
                    </p>
                    {rev.developerResponse && (
                      <div className="mt-1.5 p-1.5 bg-indigo-950/20 border-l border-indigo-500/30 rounded text-[9.5px] text-indigo-300">
                        <p className="font-bold text-[9px] mb-0.5 text-indigo-400">开发者回复：</p>
                        <p>
                          <TranslatedText 
                            text={rev.developerResponse} 
                            enabled={enableTranslation} 
                            cache={translationCache} 
                            onTranslated={onTranslated} 
                          />
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-slate-600 pl-1">未抓取到精选评论数据</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// 自动翻译组件
interface TranslatedTextProps {
  text: string;
  enabled: boolean;
  cache: Record<string, string>;
  onTranslated: (original: string, translated: string) => void;
}

function TranslatedText({ text, enabled, cache, onTranslated }: TranslatedTextProps) {
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (enabled && text && !cache[text] && !translating) {
      // 简单判断是否包含英文/外文特征（排除纯数字、标点符号，如果全都是中文字符或数字，则不翻译以节省请求）
      const hasForeignText = /[a-zA-Z]/i.test(text);
      if (!hasForeignText) {
        return;
      }

      setTranslating(true);
      const doTranslate = async () => {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(text)}`;
          const res = await fetch(url);
          if (res.ok) {
            const json = await res.json();
            if (json && json[0]) {
              const translated = json[0].map((item: any) => item[0]).join('').trim();
              if (translated) {
                onTranslated(text, translated);
              }
            }
          }
        } catch (e) {
          console.error(e);
        } finally {
          setTranslating(false);
        }
      };
      doTranslate();
    }
  }, [enabled, text, cache, translating]);

  if (!enabled) return <>{text}</>;
  
  if (cache[text]) {
    return (
      <span className="text-slate-300">
        {cache[text]}
        <span className="text-[8px] text-indigo-400 bg-indigo-500/10 px-1 py-0.2 rounded ml-1 scale-90 inline-block font-normal">译</span>
      </span>
    );
  }

  if (translating) {
    return (
      <span className="text-slate-500 inline-flex items-center gap-1">
        <svg className="animate-spin h-3 w-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="opacity-50 text-[10px] truncate max-w-[120px]">{text}</span>
      </span>
    );
  }

  return <>{text}</>;
}


