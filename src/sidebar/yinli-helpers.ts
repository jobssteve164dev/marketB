export type AifAccount = Record<string, any>;

export type YinliSignalLike = {
  id: number;
  source?: string | null;
  url?: string | null;
  strategies?: Array<{ content?: string | null }>;
};

const AIF_ACCOUNT_FIELDS = [
  'email',
  'name',
  'displayName',
  'nickname',
  'username',
  'apiKey',
  'userId',
  'id',
  'credits',
  'remainingCredits',
  'quota',
  'plan',
  'level'
];

export const isObjectRecord = (value: unknown): value is Record<string, any> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const hasAccountField = (value: Record<string, any>) => {
  return AIF_ACCOUNT_FIELDS.some((key) => value[key] !== undefined && value[key] !== null && value[key] !== '');
};

export const normalizeAifAccount = (payload: any, identityCode?: string): AifAccount | null => {
  const candidates = [
    payload?.user,
    payload?.account,
    payload?.profile,
    payload?.customer,
    payload?.data?.user,
    payload?.data?.account,
    payload?.data?.profile,
    payload?.data?.customer,
    payload?.data,
    payload?.result?.user,
    payload?.result?.account,
    payload?.result?.profile,
    payload?.result
  ];

  const account = candidates.find((candidate) => isObjectRecord(candidate) && hasAccountField(candidate));
  if (account) return account;
  if (isObjectRecord(payload) && hasAccountField(payload)) return payload;

  const trimmedIdentityCode = identityCode?.trim();
  return trimmedIdentityCode ? { apiKey: trimmedIdentityCode } : null;
};

export const getAifAccountLabel = (account: any) => {
  if (!account) return '已连接账户';
  const apiKey = typeof account.apiKey === 'string' ? account.apiKey : '';
  if (account.email) return account.email;
  if (account.name) return account.name;
  if (account.displayName) return account.displayName;
  if (account.nickname) return account.nickname;
  if (account.username) return account.username;
  if (account.userId) return `用户 ${account.userId}`;
  if (account.id) return `用户 ${account.id}`;
  if (apiKey) return `身份代码 ...${apiKey.slice(-6)}`;
  return '已连接账户';
};

export const getAifAccountBadge = (account: any) => {
  if (!account) return '';
  if (account.credits !== undefined) return `${account.credits} 积分`;
  if (account.remainingCredits !== undefined) return `${account.remainingCredits} 积分`;
  if (account.quota !== undefined) return `${account.quota} 额度`;
  if (account.plan) return account.plan;
  if (account.level) return account.level;
  return '';
};

const decodeNestedUrl = (value: string): string => {
  let current = value.trim();
  for (let i = 0; i < 3; i++) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
};

const extractNestedUrl = (url: URL): string | null => {
  const keys = ['url', 'u', 'target', 'targetUrl', 'target_url', 'redirect', 'redirect_url', 'q'];
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (!value) continue;
    const decoded = decodeNestedUrl(value);
    if (/^https?:\/\//i.test(decoded)) {
      return decoded;
    }
  }
  return null;
};

const normalizeRedditUrl = (candidate: string): string | null => {
  try {
    const parsed = new URL(candidate);
    const nestedUrl = extractNestedUrl(parsed);
    if (nestedUrl) {
      const nested = normalizeRedditUrl(nestedUrl);
      if (nested) return nested;
    }

    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'redd.it') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.reddit.com/comments/${id}` : null;
    }
    if (!host.endsWith('reddit.com')) return null;
    if (!/(^|\/)(r\/[^/]+\/comments|comments)\//.test(parsed.pathname)) return null;

    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeHttpUrl = (candidate: string | null | undefined): string | null => {
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

export const getYinliSignalReplyUrl = (signal: YinliSignalLike): string | null => {
  const source = (signal.source || '').toLowerCase();
  const rawUrl = signal.url || '';

  if (source.includes('reddit')) {
    return normalizeRedditUrl(rawUrl);
  }

  return normalizeHttpUrl(rawUrl);
};

export const getMissingStrategySignalIds = (signals: YinliSignalLike[]) => {
  return signals
    .filter((signal) => !Array.isArray(signal.strategies) || signal.strategies.length === 0)
    .map((signal) => signal.id);
};
