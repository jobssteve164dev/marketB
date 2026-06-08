import { BilibiliAdapter } from './bilibili.js';
import { YoutubeAdapter } from './youtube.js';
import { TwitterAdapter } from './twitter.js';
import { FacebookAdapter } from './facebook.js';
import type { BaseAdapter } from './base.js';

/**
 * 根据当前网页的域名，匹配对应的平台适配器
 */
export function getAdapterForCurrentPage(): BaseAdapter | null {
  const host = window.location.hostname.toLowerCase();
  
  if (host.includes('bilibili.com')) {
    return new BilibiliAdapter();
  }
  if (host.includes('youtube.com')) {
    return new YoutubeAdapter();
  }
  if (host.includes('twitter.com') || host.includes('x.com')) {
    return new TwitterAdapter();
  }
  if (host.includes('facebook.com')) {
    return new FacebookAdapter();
  }
  
  return null;
}
