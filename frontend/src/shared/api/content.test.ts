import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.hoisted(() => vi.fn());
const postMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: {
      get: getMock,
      post: postMock,
    },
  };
});

import { listGalleryPosts, listPosts, listRankings, togglePostFavorite } from './content';

describe('togglePostFavorite', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('posts the favorite toggle payload for a post', async () => {
    postMock.mockResolvedValue({ favorited: true, favorites: 8 });

    await expect(togglePostFavorite('post-1')).resolves.toEqual({
      isFavorited: true,
      favorites: 8,
    });

    expect(postMock).toHaveBeenCalledWith('/favorites/toggle', {
      targetType: 'post',
      targetId: 'post-1',
    });
  });
});

describe('content image URL mapping', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('uses thumbnail URLs for gallery cards while keeping original cover URLs', async () => {
    getMock.mockResolvedValue({
      items: [
        {
          id: 'post-1',
          platform: '小红书',
          title: '旧本地图片',
          cover_image_url: '/uploads/1777456340857-origin.png',
          cover_thumb_url: 'uploads/post-covers/thumbs/post-1.jpg',
        },
        {
          id: 'post-2',
          platform: '抖音',
          title: 'OSS 图片',
          cover_image_url: 'https://oss.example.com/post-2.png',
          cover_thumb_url: 'https://oss.example.com/post-2-thumb.jpg',
        },
        {
          id: 'post-3',
          platform: '小红书',
          title: '曾被误归一化的本地图片',
          cover_image_url: 'https://uploads/1777456340857-origin.png',
        },
        {
          id: 'post-4',
          platform: '小红书',
          title: '旧本地服务绝对地址',
          cover_image_url: 'http://localhost:8089/uploads/1777456340857-origin.png',
        },
      ],
      total: 4,
      limit: 20,
      offset: 0,
    });

    await expect(listGalleryPosts({ page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [
        {
          id: 'post-1',
          coverImageUrl: '/uploads/1777456340857-origin.png',
          coverThumbUrl: '/uploads/post-covers/thumbs/post-1.jpg',
        },
        {
          id: 'post-2',
          coverImageUrl: 'https://oss.example.com/post-2.png',
          coverThumbUrl: 'https://oss.example.com/post-2-thumb.jpg',
        },
        {
          id: 'post-3',
          coverImageUrl: '/uploads/1777456340857-origin.png',
        },
        {
          id: 'post-4',
          coverImageUrl: '/uploads/1777456340857-origin.png',
        },
      ],
    });
  });
});

describe('content list query helpers', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it('passes operation post filters through to the posts API', async () => {
    getMock.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    await listPosts({
      page: 1,
      pageSize: 20,
      platform: 'xiaohongshu',
      accountId: 'acc-1',
      postType: 'note',
      trafficMin: 100,
      trafficMax: 500,
    });

    expect(getMock).toHaveBeenCalledWith('/posts', {
      query: {
        page: 1,
        pageSize: 20,
        platform: 'xiaohongshu',
        accountId: 'acc-1',
        postType: 'note',
        trafficMin: 100,
        trafficMax: 500,
        limit: 20,
        offset: 0,
      },
    });
  });

  it('passes ranking type, period and platform through to the rankings API', async () => {
    getMock.mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 });

    await listRankings('traffic', { page: 2, pageSize: 20, period: '7d', platform: 'xhs' });

    expect(getMock).toHaveBeenCalledWith('/rankings', {
      query: {
        type: 'traffic',
        period: '7d',
        platform: 'xhs',
        limit: 20,
        offset: 20,
      },
    });
  });
});
