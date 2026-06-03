import { Body, Controller, Get, Post, Patch, Param, Query, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';
import { AuthGuard } from '../../common/auth.guard';
import { UseGuards } from '@nestjs/common';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';

/** 主管建议管理仅 admin/supervisor 可执行 */
function ensureSupervisor(req: any, res: Response): boolean {
  const role = getSessionRole(req);
  if (!['admin', 'owner', 'supervisor'].includes(role)) {
    res.status(403).json({ ok: false, message: 'forbidden: 仅 admin/supervisor 可发送建议' });
    return false;
  }
  return true;
}

@Controller('supervisor-suggestions')
@UseGuards(AuthGuard)
export class SupervisorSuggestionsController {
  constructor(private readonly service: SupervisorSuggestionsService) {}

  /**
   * 创建主管建议，当前版本支持作品、账号、员工建议。
   */
  @Post()
  async create(@Body() body: any, @Req() req: any, @Res() res: Response) {
    if (!ensureSupervisor(req, res)) return;
    const senderId = getSessionUserId(req);
    try {
      const data = await this.service.create({
        senderId,
        targetType: body.targetType,
        targetId: body.targetId,
        content: body.content || body.suggestion || body.supervisorSuggestion,
      });
      return res.json({ ok: true, data });
    } catch (error: any) {
      return res.status(422).json({ ok: false, message: error?.message || '主管建议保存失败' });
    }
  }

  /**
   * 查询主管建议列表。
   * - 主管可查看所有建议
   * - 运营只能查看自己的建议
   */
  @Get()
  async list(
    @Req() req: any,
    @Res() res: Response,
    @Query('targetType') targetType?: string,
    @Query('employeeId') employeeId?: string,
    @Query('readStatus') readStatus?: string,
  ) {
    const role = getSessionRole(req);
    const userId = getSessionUserId(req);

    // 普通运营只能查看自己的建议
    const query: any = {};
    if (!['admin', 'owner', 'supervisor'].includes(role)) {
      query.receiverId = userId;
    }
    if (targetType) query.targetType = targetType;
    if (employeeId && ['admin', 'owner', 'supervisor'].includes(role)) {
      query.employeeId = employeeId;
    }
    if (readStatus !== undefined && readStatus !== '') {
      query.readStatus = readStatus === 'true' || readStatus === '1' ? 1 : 0;
    }

    const items = await this.service.list(query);
    return res.json({ items });
  }

  /**
   * 标记建议为已读。
   */
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const userId = getSessionUserId(req);
    const success = await this.service.markAsRead(id, userId);
    return res.json({ ok: true, success });
  }

  /**
   * 批量标记建议为已读。
   */
  @Post('read-all')
  async markAllAsRead(@Req() req: any, @Res() res: Response) {
    const userId = getSessionUserId(req);
    const count = await this.service.markAllAsRead(userId);
    return res.json({ ok: true, count });
  }

  /**
   * 获取未读建议数量。
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: any, @Res() res: Response) {
    const userId = getSessionUserId(req);
    const count = await this.service.getUnreadCount(userId);
    return res.json({ count });
  }
}
