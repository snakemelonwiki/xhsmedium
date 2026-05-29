import { Controller, Get, Post, Param, Req, Res } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Request, Response } from 'express';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async findAll(@Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = session?.userId || '';
    const role = session?.role || '';
    const employeeId = session?.employeeId || '';
    const items = this.notificationsService.listForUser(userId, role, employeeId);
    return res.json({
      items: items.slice(0, 30),
      unreadCount: items.filter((item) => item.unread).length,
    });
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    this.notificationsService.markRead(id, session?.userId || '');
    return res.json({ ok: true });
  }
}
