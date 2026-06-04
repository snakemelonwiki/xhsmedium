import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { FavoritesService } from './favorites.service';
import { getSessionUserId } from '../../common/session.utils';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('targetType') targetType?: string,
  ) {
    const userId = getSessionUserId(req);
    const items = await this.favoritesService.list(userId, targetType);
    return res.json({ items, ids: items.map((item) => item.targetId) });
  }

  /**
   * v1.3 / OP-11 我的收藏：
   * 分页返回当前用户的收藏，按收藏时间倒序。
   * Query: targetType=post|account（可选），limit/offset（默认 20/0）。
   * 返回 items[i].target = 关联对象（post / account）快照，方便前端直接渲染。
   */
  @Get('mine')
  async listMine(
    @Req() req: Request,
    @Res() res: Response,
    @Query('targetType') targetType?: 'post' | 'account',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = getSessionUserId(req);
    const normalizedType =
      targetType === 'post' || targetType === 'account' ? targetType : undefined;
    const result = await this.favoritesService.listMinePaged({
      userId,
      targetType: normalizedType,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
    return res.json(result);
  }

  @Post('toggle')
  async toggle(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    const targetType = body?.targetType === 'account' ? 'account' : 'post';
    const result = await this.favoritesService.toggle(
      userId,
      targetType,
      body?.targetId || '',
    );
    return res.json(result);
  }

  @Post('sync')
  async sync(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    const targetType = body?.targetType === 'account' ? 'account' : 'post';
    const ids = await this.favoritesService.sync(
      userId,
      targetType,
      Array.isArray(body?.targetIds) ? body.targetIds : [],
    );
    return res.json({ ok: true, ids });
  }
}
