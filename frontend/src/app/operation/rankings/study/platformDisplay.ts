import { platformKeyToDisplay } from '@/shared/utils/platform-key';

/**
 * 学习榜单平台展示名。
 * 后端可能返回 douyin/xiaohongshu/xhs，也可能直接返回中文；页面统一展示中文。
 */
export function formatStudyPlatform(platform: string | undefined | null): string {
  const display = platformKeyToDisplay(platform);
  return display || String(platform || '未知平台');
}

/**
 * 学习榜单平台 Tag 颜色。
 */
export function getStudyPlatformColor(platform: string | undefined | null): 'blue' | 'red' {
  return formatStudyPlatform(platform).includes('抖') ? 'blue' : 'red';
}
