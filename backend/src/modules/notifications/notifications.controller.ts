import { Controller, Get, Post, Patch, Param, Req, Res, Query, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Request, Response } from 'express';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  async unreadCount(
    @Req() req: Request,
    @Res() res: Response,
    @Query('actorUserId') actorUserId?: string,
  ) {
    const session = (req as any).session;
    const user = (req as any).user;
    const userId = session?.userId || session?.id || user?.sub || user?.id || actorUserId || '';
    const userRole = session?.role || user?.role || 'staff';
    const portType = this.resolvePortType(userRole);
    const unreadCount = await this.notificationsService.countUnread(userId, portType);
    return res.json({ unreadCount });
  }

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
    const user = (req as any).user;
    const userId = session?.userId || session?.id || user?.sub || user?.id || actorUserId || '';
    const userRole = session?.role || user?.role || 'staff';

    const portType = this.resolvePortType(userRole);

    const result = await this.notificationsService.listForUser(userId, {
      status: status === 'unread' ? 'unread' : 'all',
      type: type || undefined,
      portType,
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

  @Patch(':id/read')
  async patchMarkRead(
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

  private resolvePortType(userRole: string): string {
    if (userRole === 'sales') return 'sales';
    if (userRole === 'academic') return 'academic';
    return 'operations';
  }
}
