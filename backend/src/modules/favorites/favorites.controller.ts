import {
  Controller, Get, Post, Delete, Body, Param, Query, Req, Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoritesService } from './favorites.service';
import { Favorite } from '../../entities/favorite.entity';
import { normalizePostType, normalizeTrafficByType } from '../../shared/utils/normalize';

/**
 * 收藏域控制器（路由前缀由 main.ts 全局加 /api）：
 * - POST   /favorites                       新增收藏
 * - DELETE /favorites/:targetType/:targetId 取消收藏
 * - GET    /favorites?targetType=post       我的收藏列表（post 时 join 作品详情）
 * - GET    /favorites/check/:targetType/:targetId  收藏状态检查
 *
 * 所有路由从 (req as any).session?.userId 取登录用户，未登录返回 401。
 */
@Controller('favorites')
export class FavoritesController {
  constructor(
    private readonly favoritesService: FavoritesService,
    @InjectRepository(Favorite)
    private readonly favoriteRepo: Repository<Favorite>,
  ) {}

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    if (!userId) return res.status(401).json({ message: '请先登录' });

    const targetType = String(body?.targetType || '').trim();
    const targetId = String(body?.targetId || '').trim();
    if (!targetType || !targetId) {
      return res.status(400).json({ message: '缺少 targetType 或 targetId' });
    }
    await this.favoritesService.addFavorite(userId, targetType, targetId);
    return res.json({ ok: true });
  }

  @Delete(':targetType/:targetId')
  async remove(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    if (!userId) return res.status(401).json({ message: '请先登录' });
    await this.favoritesService.removeFavorite(userId, targetType, targetId);
    return res.json({ ok: true });
  }

  @Get()
  async list(
    @Query('targetType') targetType: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    if (!userId) return res.status(401).json({ message: '请先登录' });

    const type = (targetType || '').trim();

    // post 类型：直接 LEFT JOIN posts 拉作品详情，避免前端二次请求
    if (type === 'post') {
      const rows = await this.fetchFavoritePosts(userId);
      return res.json({ ok: true, rows });
    }

    // 其它 targetType：返回原始 favorite 列表，由上层按需扩展
    const favorites = await this.favoritesService.listFavoritesByUser(userId, type || undefined);
    return res.json({ ok: true, rows: favorites });
  }

  @Get('check/:targetType/:targetId')
  async check(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId: string = session?.userId || '';
    if (!userId) return res.status(401).json({ message: '请先登录' });
    const isFavorited = await this.favoritesService.isFavorited(userId, targetType, targetId);
    return res.json({ isFavorited });
  }

  /**
   * 我的收藏-作品视图：INNER JOIN posts，仅返回未被删除的 favorite，按 favorites.create_time 倒序。
   * 字段映射成驼峰，附加 isFavorited:true 方便前端复用作品卡片渲染。
   */
  private async fetchFavoritePosts(userId: string): Promise<any[]> {
    const sql = `
      SELECT p.id, p.employee_id, p.account_id, p.platform, p.title, p.copywriting,
             p.cover_image_url, p.post_url, p.post_type, p.traffic,
             p.likes, p.comments, p.favorites, p.shares,
             p.metrics_updated_at, p.published_at, p.created_at, p.updated_at,
             1 AS is_favorited
        FROM favorites f
        INNER JOIN posts p ON p.id COLLATE utf8mb4_unicode_ci = f.target_id
        WHERE f.user_id = ? AND f.target_type = 'post' AND f.deleted = 0
        ORDER BY f.create_time DESC
    `;
    const rows = await this.favoriteRepo.query(sql, [userId]);
    return (rows as any[]).map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      accountId: r.account_id,
      platform: r.platform,
      title: r.title,
      copywriting: r.copywriting || '',
      coverImageUrl: r.cover_image_url,
      postUrl: r.post_url,
      postType: normalizePostType(r.post_type),
      traffic: normalizeTrafficByType(r.post_type, Number(r.traffic || 0)),
      likes: Number(r.likes || 0),
      comments: Number(r.comments || 0),
      favorites: Number(r.favorites || 0),
      shares: Number(r.shares || 0),
      metricsUpdatedAt: r.metrics_updated_at,
      publishedAt: r.published_at,
      createdAt: r.created_at,
      isFavorited: true,
    }));
  }
}
