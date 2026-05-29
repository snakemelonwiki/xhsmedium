export const PLATFORMS = {
  XIAO_HONG_SHU: '小红书',
  DOU_YIN: '抖音',
} as const;

export type Platform = (typeof PLATFORMS)[keyof typeof PLATFORMS];
