import { describe, expect, it } from 'vitest';

import { formatStudyPlatform, getStudyPlatformColor } from './platformDisplay';

describe('study ranking platform display', () => {
  it('formats backend platform keys as Chinese labels', () => {
    expect(formatStudyPlatform('douyin')).toBe('抖音');
    expect(formatStudyPlatform('xiaohongshu')).toBe('小红书');
    expect(formatStudyPlatform('xhs')).toBe('小红书');
  });

  it('keeps unknown platforms readable and derives tag colors from normalized labels', () => {
    expect(formatStudyPlatform('未知平台')).toBe('未知平台');
    expect(getStudyPlatformColor('douyin')).toBe('blue');
    expect(getStudyPlatformColor('xiaohongshu')).toBe('red');
  });
});
