import { Controller, Get, Post, Param, Req, Res, Query, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Request, Response } from 'express';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('actorUserId') actorUserId?: string,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || actorUserId || '';
    const result = await this.notificationsService.listForUser(userId, {
      status: status === 'unread' ? 'unread' : 'all',
      type: type || undefined,
      limit: limit ? Number(limit) : 30,
      offset: offset ? Number(offset) : 0,
    });
    return res.json({
      items: result.items,
      unreadCount: result.unreadCount,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    });
  }

  // Legacy path retained — frontend posts to /api/notifications/:id/read.
  @Post(':id/read')
  async markRead(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || body?.actorUserId || '';
    const ok = await this.notificationsService.markRead(id, userId);
    return res.json({ ok, changed: ok });
  }

  @Post('read-all')
  async markAllRead(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || body?.actorUserId || '';
    const affected = await this.notificationsService.markAllRead(userId);
    return res.json({ ok: true, affected });
  }
}
