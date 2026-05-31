import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('targetType') targetType?: string,
  ) {
    const userId = this.resolveUserId(req);
    const items = await this.favoritesService.list(userId, targetType);
    return res.json({ items, ids: items.map((item) => item.targetId) });
  }

  @Post('toggle')
  async toggle(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = this.resolveUserId(req, body);
    const result = await this.favoritesService.toggle(
      userId,
      body?.targetType || 'post',
      body?.targetId || '',
    );
    return res.json(result);
  }

  @Post('sync')
  async sync(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = this.resolveUserId(req, body);
    const ids = await this.favoritesService.sync(
      userId,
      body?.targetType || 'post',
      Array.isArray(body?.targetIds) ? body.targetIds : [],
    );
    return res.json({ ok: true, ids });
  }

  private resolveUserId(req: Request, body?: any): string {
    const session = (req as any).session;
    const user = (req as any).user;
    return session?.userId || session?.id || user?.sub || user?.id || body?.actorUserId || '';
  }
}
