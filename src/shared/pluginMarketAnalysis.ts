export type PluginMarketplace = 'openvsx' | 'vscode';

export type PluginKeywordMarketRank = {
  marketplace: PluginMarketplace;
  keyword: string;
  rank: number;
  total: number;
  scanned: number;
  topDownloads: number;
  topItems: Array<{
    id: string;
    name: string;
    description: string;
    downloads: number;
    rating: number;
  }>;
};

export type PluginKeywordOpportunity = {
  keyword: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  bestRank: number;
  openvsx: PluginKeywordMarketRank;
  vscode: PluginKeywordMarketRank;
  recommendation: string;
};

export type ExperimentalPluginListing = {
  keyword: string;
  namespaceHint: string;
  extensionId: string;
  displayName: string;
  description: string;
  descriptionZh: string;
};

export type PluginKeywordOpportunityReport = {
  keywords: string[];
  opportunities: PluginKeywordOpportunity[];
  experimentalListing: ExperimentalPluginListing | null;
};

type NormalizedPluginItem = {
  id: string;
  name: string;
  description: string;
  downloads: number;
  rating: number;
};

const DEFAULT_GROWTH_KEYWORDS = [
  'ai',
  'agent',
  'ai agent',
  'coding agent',
  'ai coding',
  'ai coding agent',
  'ai code agent',
  'agent roadmap',
  'ai roadmap',
  'coding roadmap',
  'project roadmap',
  'claude code',
  'codex',
  'cursor agent',
  'local ai agent',
  'agent sessions',
  'agent workflow'
];

const VSCODE_SORT_BY: Record<string, number> = {
  relevance: 0,
  timestamp: 1,
  downloadCount: 4,
  rating: 6,
  weightedRating: 12
};

const normalizeId = (value: string) => value.trim().toLowerCase();

const uniqueTerms = (terms: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  terms.forEach(term => {
    const clean = term.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  });
  return result;
};

export const buildPluginOpportunityKeywords = (
  monitoredKeywords: string[],
  context: { displayName?: string; description?: string } = {}
) => {
  const text = `${context.displayName || ''} ${context.description || ''}`.toLowerCase();
  const contextualTerms: string[] = [];
  if (text.includes('roadmap')) contextualTerms.push('ai roadmap', 'coding roadmap', 'project roadmap');
  if (text.includes('agent')) contextualTerms.push('agent workflow', 'agent sessions', 'local ai agent');
  if (text.includes('claude')) contextualTerms.push('claude code');
  if (text.includes('codex')) contextualTerms.push('codex');
  if (text.includes('cursor')) contextualTerms.push('cursor agent');
  return uniqueTerms([...monitoredKeywords, ...contextualTerms, ...DEFAULT_GROWTH_KEYWORDS]).slice(0, 24);
};

const toSlug = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48);

const readOpenVSXItem = (item: any): NormalizedPluginItem => ({
  id: `${item.namespace || ''}.${item.name || ''}`.replace(/^\./, '').replace(/\.$/, ''),
  name: item.displayName || item.name || `${item.namespace || ''}.${item.name || ''}`,
  description: item.description || '',
  downloads: Number(item.downloadCount || 0),
  rating: Number(item.averageRating || 0)
});

const readVSCodeItem = (item: any): NormalizedPluginItem => {
  const publisher = item.publisher?.publisherName || item.publisher?.displayName || '';
  const name = item.extensionName || '';
  const stats = Array.isArray(item.statistics) ? item.statistics : [];
  const getStat = (name: string) => Number(stats.find((stat: any) => stat.statisticName === name)?.value || 0);
  return {
    id: `${publisher}.${name}`.replace(/^\./, '').replace(/\.$/, ''),
    name: item.displayName || name || `${publisher}.${name}`,
    description: item.shortDescription || '',
    downloads: getStat('install') || getStat('downloadCount'),
    rating: getStat('averagerating')
  };
};

const fetchOpenVSXRank = async (
  keyword: string,
  targetId: string,
  scanLimit: number,
  pageSize: number
): Promise<PluginKeywordMarketRank> => {
  const items: NormalizedPluginItem[] = [];
  let total = 0;

  for (let offset = 0; offset < scanLimit; offset += pageSize) {
    const url = new URL('https://open-vsx.org/api/-/search');
    url.searchParams.set('query', keyword);
    url.searchParams.set('sortBy', 'relevance');
    url.searchParams.set('sortOrder', 'desc');
    url.searchParams.set('size', String(pageSize));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`OpenVSX 查询失败: ${response.status}`);
    const data = await response.json();
    const batch = Array.isArray(data.extensions) ? data.extensions.map(readOpenVSXItem) : [];
    total = Number(data.totalSize || batch.length || total);
    items.push(...batch);
    if (items.some(item => normalizeId(item.id) === normalizeId(targetId))) break;
    if (batch.length < pageSize) break;
  }

  const rank = items.findIndex(item => normalizeId(item.id) === normalizeId(targetId)) + 1;
  return {
    marketplace: 'openvsx',
    keyword,
    rank,
    total,
    scanned: items.length,
    topDownloads: items[0]?.downloads || 0,
    topItems: items.slice(0, 5)
  };
};

const fetchVSCodeRank = async (
  keyword: string,
  targetId: string,
  scanLimit: number,
  pageSize: number
): Promise<PluginKeywordMarketRank> => {
  const items: NormalizedPluginItem[] = [];
  let total = 0;

  for (let pageNumber = 1; items.length < scanLimit; pageNumber += 1) {
    const response = await fetch('https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery', {
      method: 'POST',
      headers: {
        'Accept': 'application/json;api-version=7.2-preview.1;excludeUrls=true',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filters: [{
          criteria: [
            { filterType: 8, value: 'Microsoft.VisualStudio.Code' },
            { filterType: 10, value: keyword }
          ],
          pageNumber,
          pageSize,
          sortBy: VSCODE_SORT_BY.relevance,
          sortOrder: 0
        }],
        assetTypes: [],
        flags: 256 | 512 | 1024
      })
    });
    if (!response.ok) throw new Error(`VS Marketplace 查询失败: ${response.status}`);
    const data = await response.json();
    const result = data.results?.[0];
    const batch = Array.isArray(result?.extensions) ? result.extensions.map(readVSCodeItem) : [];
    total = Number(result?.resultMetadata?.find((meta: any) => meta.metadataType === 'ResultCount')?.metadataItems?.[0]?.count || total || batch.length);
    items.push(...batch);
    if (items.some(item => normalizeId(item.id) === normalizeId(targetId))) break;
    if (batch.length < pageSize) break;
  }

  const rank = items.findIndex(item => normalizeId(item.id) === normalizeId(targetId)) + 1;
  return {
    marketplace: 'vscode',
    keyword,
    rank,
    total,
    scanned: items.length,
    topDownloads: items[0]?.downloads || 0,
    topItems: items.slice(0, 5)
  };
};

const scoreOpportunity = (keyword: string, openvsx: PluginKeywordMarketRank, vscode: PluginKeywordMarketRank) => {
  const ranks = [openvsx.rank, vscode.rank].filter(rank => rank > 0);
  const bestRank = ranks.length ? Math.min(...ranks) : 0;
  const demand = Math.log10(openvsx.topDownloads + vscode.topDownloads + openvsx.total + vscode.total + 10) * 18;
  const relevanceBonus = [
    'ai coding agent',
    'coding agent',
    'agent roadmap',
    'ai agent',
    'project roadmap'
  ].some(term => keyword.toLowerCase().includes(term)) ? 16 : 8;
  const rankSignal = bestRank === 0 ? 18 : bestRank <= 3 ? 70 : bestRank <= 10 ? 58 : bestRank <= 30 ? 45 : bestRank <= 100 ? 28 : 18;
  const competitionPenalty = Math.log10(Math.max(openvsx.topDownloads, vscode.topDownloads, 1)) * 3;
  const score = Math.max(0, Math.min(100, Math.round(rankSignal + demand + relevanceBonus - competitionPenalty)));
  const level: PluginKeywordOpportunity['level'] = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';
  return { score, level, bestRank };
};

const buildRecommendation = (keyword: string, score: number, bestRank: number) => {
  if (bestRank > 0 && bestRank <= 3) {
    return `已在 "${keyword}" 占据高位，优先把标题、首句描述和截图转化做扎实。`;
  }
  if (bestRank > 0 && bestRank <= 30) {
    return `"${keyword}" 已接近可见区，适合用名称、tags 和描述前两句继续强化。`;
  }
  if (score >= 70) {
    return `"${keyword}" 有足够需求但当前未进入前排，适合用于实验性新插件 ID 和显示名称。`;
  }
  if (score >= 45) {
    return `"${keyword}" 可作为描述与 tags 补充词，暂不建议压过主品牌词。`;
  }
  return `"${keyword}" 当前机会有限，适合监测，不适合作为主攻名称。`;
};

const createExperimentalListing = (
  opportunities: PluginKeywordOpportunity[],
  context: { displayName?: string; namespace?: string; description?: string }
): ExperimentalPluginListing | null => {
  const primary = opportunities.find(item => item.keyword === 'ai coding agent')
    || opportunities.find(item => item.keyword === 'coding agent')
    || opportunities.find(item => item.keyword.includes('roadmap'))
    || opportunities[0];
  if (!primary) return null;

  const brand = context.displayName?.match(/[a-z0-9]+/i)?.[0] || context.namespace || 'plugin';
  const keywordSlug = toSlug(primary.keyword);
  const needsRoadmap = /roadmap/i.test(`${context.displayName || ''} ${context.description || ''}`) && !keywordSlug.includes('roadmap');
  const extensionId = toSlug(`${keywordSlug}${needsRoadmap ? '-roadmap' : ''}`) || 'ai-coding-agent';
  const titleKeyword = primary.keyword
    .split(/\s+/)
    .map(part => part === 'ai' ? 'AI' : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const displayName = needsRoadmap
    ? `${titleKeyword} Roadmap - ${brand}`
    : `${titleKeyword} - ${brand}`;

  return {
    keyword: primary.keyword,
    namespaceHint: `${brand.replace(/[^a-z0-9]/gi, '') || 'Plugin'}AI`,
    extensionId,
    displayName,
    description: `${titleKeyword} cockpit for developers. Keep local agent sessions organized and turn scattered AI work into a Git-friendly project roadmap.`,
    descriptionZh: '面向独立开发者的 AI 编程 Agent 工作台。统一管理本地 Agent 会话，把分散的 AI 对话沉淀为适合 Git 管理的项目路线图。'
  };
};

export const analyzePluginKeywordOpportunities = async (input: {
  targetId: string;
  keywords: string[];
  displayName?: string;
  namespace?: string;
  description?: string;
  scanLimit?: number;
  pageSize?: number;
}): Promise<PluginKeywordOpportunityReport> => {
  const keywords = uniqueTerms(input.keywords).slice(0, 24);
  const scanLimit = input.scanLimit || 300;
  const pageSize = input.pageSize || 50;
  const opportunities: PluginKeywordOpportunity[] = [];

  for (const keyword of keywords) {
    const [openvsx, vscode] = await Promise.all([
      fetchOpenVSXRank(keyword, input.targetId, scanLimit, pageSize),
      fetchVSCodeRank(keyword, input.targetId, scanLimit, pageSize)
    ]);
    const scored = scoreOpportunity(keyword, openvsx, vscode);
    opportunities.push({
      keyword,
      score: scored.score,
      level: scored.level,
      bestRank: scored.bestRank,
      openvsx,
      vscode,
      recommendation: buildRecommendation(keyword, scored.score, scored.bestRank)
    });
  }

  opportunities.sort((a, b) => b.score - a.score);
  return {
    keywords,
    opportunities,
    experimentalListing: createExperimentalListing(opportunities, {
      displayName: input.displayName,
      namespace: input.namespace,
      description: input.description
    })
  };
};
