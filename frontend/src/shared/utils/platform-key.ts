/**
 * 平台字符串标准化工具
 *
 * 背景：后端不同接口可能返回中英文混合的平台名（'小红书' / 'xiaohongshu' / 'XHS' / 'xhs' /
 *   '抖音' / 'douyin' / 'DouYin' / 'dy'），前端表单 value、列表筛选、统计聚合、URL 兜底识别
 *   等场景都要统一判断。集中到这一个文件，避免各处 `includes('douyin')` 写法不一致导致
 *   抖音链接偶然不被识别（参考 2026-06-06 抖音回填 bug：mapPlatformToKey 写得太严格）。
 *
 * 全部函数都是纯函数，无副作用。
 */

export type PlatformFormKey = '' | 'xiaohongshu' | 'douyin';
export type PlatformDisplay = '小红书' | '抖音';

/**
 * 后端平台字符串（'小红书' / '抖音' / 'xiaohongshu' / 'douyin' / 'XHS' / 'dy' 等）转表单 value。
 * 大小写无关；中英文都识别。
 */
export function mapPlatformToKey(platform: string | undefined | null): PlatformFormKey {
  if (!platform) return '';
  const lower = String(platform).toLowerCase().trim();
  if (lower === 'douyin' || lower.includes('douyin') || lower.includes('抖音') || lower === 'dy') {
    return 'douyin';
  }
  if (
    lower === 'xiaohongshu'
    || lower.includes('xiaohongshu')
    || lower.includes('小红书')
    || lower === 'xhs'
    || lower.includes('xhs')
  ) {
    return 'xiaohongshu';
  }
  return '';
}

/**
 * 反向：表单 value（'xiaohongshu' / 'douyin'）转中文显示名（'小红书' / '抖音'）。
 * 给列表/详情页"平台"列渲染用。
 */
export function platformKeyToDisplay(key: string | undefined | null): PlatformDisplay | '' {
  const k = mapPlatformToKey(key);
  if (k === 'xiaohongshu') return '小红书';
  if (k === 'douyin') return '抖音';
  return '';
}

/**
 * URL 兜底识别：postUrl 没填平台字段时，从 URL 域名猜平台。
 * 覆盖：xiaohongshu.com / xhslink.com / douyin.com / iesdouyin.com / v.douyin.com
 */
export function inferPlatformFromUrl(url: string | undefined | null): PlatformFormKey {
  if (!url) return '';
  if (/douyin\.com|iesdouyin\.com|v\.douyin\.com/i.test(url)) return 'douyin';
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return 'xiaohongshu';
  return '';
}

/**
 * 一站式：根据后端返回的 platform 字段 + URL 兜底，拿到最终表单 value。
 * 推荐在所有"作品录入 / 编辑 / 客资解析"等场景直接用这个。
 */
export function resolvePlatformKey(
  platform: string | undefined | null,
  postUrl?: string | undefined | null,
): PlatformFormKey {
  return mapPlatformToKey(platform) || inferPlatformFromUrl(postUrl);
}
