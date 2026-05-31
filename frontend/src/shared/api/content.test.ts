import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.hoisted(() => vi.fn());

vi.mock('./apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./apiClient')>();
  return {
    ...actual,
    apiClient: {
      post: postMock,
    },
  };
});

import { togglePostFavorite } from './content';

describe('togglePostFavorite', () => {
  beforeEach(() => {
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
