import { describe, expect, it } from 'vitest';

import { buildPostExportFilter, getPostDetailDisplay } from './postDetail';

describe('buildPostExportFilter', () => {
  it('keeps current post board filters and omits empty values', () => {
    expect(buildPostExportFilter({ employeeId: 'emp-1', platform: undefined, keyword: '获客' })).toEqual({
      employeeId: 'emp-1',
      search: '获客',
    });
  });
});

describe('getPostDetailDisplay', () => {
  it('normalizes full copywriting, screenshot, metrics and supervisor suggestion', () => {
    expect(
      getPostDetailDisplay({
        id: 'post-1',
        title: '标题',
        copywriting: '完整文案',
        coverImageUrl: '/uploads/post.png',
        traffic: 120,
        likes: 8,
        comments: 3,
        favorites: 2,
        supervisorSuggestion: '建议复盘转化',
      }),
    ).toEqual({
      copywriting: '完整文案',
      screenshotUrl: '/uploads/post.png',
      metrics: [
        { label: '流量', value: 120 },
        { label: '赞', value: 8 },
        { label: '评', value: 3 },
        { label: '藏', value: 2 },
      ],
      supervisorSuggestion: '建议复盘转化',
    });
  });
});
