import { Controller, Get, Post, Patch, Param, Req, Res, Query, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId } from '../../common/session.utils';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('unread-count')
  async unreadCount(
    @Req() req: Request,
    @Res() res: Response,
    @Query('actorUserId') actorUserId?: string,
    @Query('typeCode') typeCode?: string,
  ) {
    const session = (req as any).session;
    const user = (req as any).user;
    const userId = getSessionUserId(req) || actorUserId || '';
    const userRole = session?.role || user?.role || 'staff';
    const portType = this.resolvePortType(userRole);
    if (typeCode) {
      // v1.3 / OP-6: 按 typeCode 拆分未读条数（"未读消息"与"主管建议"各自拉）
      const count = await this.notificationsService.getUnreadCountByType(typeCode, userId);
      return res.json({ unreadCount: count, typeCode });
    }
    const unreadCount = await this.notificationsService.countUnread(userId, portType);
    return res.json({ unreadCount });
  }

  /**
   * v1.3 SUP-3: 当前用户的未读提醒（type_code = 'reminder'）按发送者分组聚合。
   * 主管端消息中心使用，便于显示"XX 给你发了 N 条提醒"。
   * 默认 portType 由角色推得，主管 (admin/supervisor/owner) 走 'operations'。
   */
  @Get('unread-by-sender')
  async unreadBySender(
    @Req() req: Request,
    @Res() res: Response,
    @Query('actorUserId') actorUserId?: string,
  ) {
    const session = (req as any).session;
    const user = (req as any).user;
    const userId = getSessionUserId(req) || actorUserId || '';
    const userRole = session?.role || user?.role || 'staff';
    const portType = this.resolvePortType(userRole);
    const result = await this.notificationsService.listUnreadBySender(userId, portType);
    return res.json({ ok: true, ...result });
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
    const userId = getSessionUserId(req) || actorUserId || '';
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
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    // 越权检查：验证当前用户是否为通知接收者
    const notification = await this.notificationsService.findById(id);
    if (!notification || notification.receiverId !== userId) {
      return res.status(404).json({ ok: false, message: '通知不存在' });
    }
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
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    // 越权检查：验证当前用户是否为通知接收者
    const notification = await this.notificationsService.findById(id);
    if (!notification || notification.receiverId !== userId) {
      return res.status(404).json({ ok: false, message: '通知不存在' });
    }
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
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    const affected = await this.notificationsService.markAllRead(userId);
    return res.json({ ok: true, affected });
  }

  /**
   * Batch mark notifications as read.
   * Body: { ids: string[] } — accepts either an explicit list of notification ids
   * or { all: true } to mark every unread notification of the current user.
   */
  @Post('mark-read')
  async markReadMany(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    const rawIds = Array.isArray(body?.ids) ? body.ids : [];
    const ids: string[] = rawIds
      .map((id: unknown) => (id == null ? '' : String(id).trim()))
      .filter((id: string) => id.length > 0);
    const affected = await this.notificationsService.markReadMany(userId, ids);
    return res.json({ ok: true, affected });
  }

  /**
   * Mark every unread notification of the current user as read.
   * Body (optional): { typeCode?: string } — when provided, only notifications
   * matching that type are marked read.
   */
  @Post('mark-all-read')
  async markAllReadByType(
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || body?.actorUserId || '';
    const typeCode = body?.typeCode ? String(body.typeCode).trim() : undefined;
    const affected = await this.notificationsService.markAllRead(userId, typeCode || undefined);
    return res.json({ ok: true, affected });
  }

  private resolvePortType(userRole: string): string {
    if (userRole === 'sales') return 'sales';
    if (userRole === 'academic') return 'academic';
    return 'operations';
  }
}
