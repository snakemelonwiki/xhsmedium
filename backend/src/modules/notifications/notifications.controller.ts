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
    const user = (req as any).user;

    console.log('[DEBUG] Request info:', {
      hasSession: !!session,
      hasUser: !!user,
      session,
      user,
      authHeader: req.headers.authorization?.substring(0, 50),
    });

    const userId = session?.userId || session?.id || user?.sub || user?.id || actorUserId || '';
    const userRole = session?.role || user?.role || 'staff';

    // 根据用户角色确定端口类型
    let portType: string;
    if (userRole === 'sales') {
      portType = 'sales';
    } else if (userRole === 'academic') {
      portType = 'academic';
    } else {
      portType = 'operations';
    }

    console.log('[DEBUG] Notifications query:', { userId, userRole, portType, status, type, limit, offset });

    // 暂时不筛选portType，测试是否有数据
    const result = await this.notificationsService.listForUser(userId, {
      status: status === 'unread' ? 'unread' : 'all',
      type: type || undefined,
      // portType,  // 暂时注释掉
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
