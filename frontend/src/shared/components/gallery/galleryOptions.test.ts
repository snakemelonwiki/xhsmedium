import { describe, expect, it } from 'vitest';

import { GALLERY_TYPE_OPTIONS, getGalleryTypeSelectValue } from './GalleryPageContent';

describe('gallery filter options', () => {
  it('keeps the type dropdown limited to the three plaza post categories', () => {
    const labels = GALLERY_TYPE_OPTIONS.map((option) => option.label);

    expect(labels).toEqual(['全部类型', '获客贴', '讨论贴', '人设贴']);
    expect(labels).not.toEqual(expect.arrayContaining(['图文', '视频', '营销贴', '营销帖']));
  });

  it('does not render removed type values in the dropdown selector', () => {
    expect(getGalleryTypeSelectValue('营销贴')).toBeUndefined();
    expect(getGalleryTypeSelectValue('图文')).toBeUndefined();
    expect(getGalleryTypeSelectValue('视频')).toBeUndefined();
    expect(getGalleryTypeSelectValue('讨论贴')).toBe('讨论贴');
  });
});
