import { Controller, Get, Param, Req, Res, Query, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { OperationLogsService } from './operation-logs.service';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';

/**
 * 操作日志只读接口的鉴权策略：
 * - 必须登录（class-level AuthGuard，未登录/无 token 直接 401）。
 * - admin / owner：可看全表审计日志。
 * - staff / sales / academic / operation / supervisor：只能看自己产生的日志
 *   （按 o.user_id = session.userId 过滤）。
 *
 * 注：service.log() 是系统内部写入入口（被 accounts / auth / users / orders /
 * collaboration-tasks / order-abnormal-feedback 多个模块调用），不在本 controller
 * 暴露，无需加守卫。
 */
@Controller('operation-logs')
@UseGuards(AuthGuard)
export class OperationLogsController {
  constructor(private readonly service: OperationLogsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('userId') userId?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const currentUserId: string = getSessionUserId(req);
    const sessionRole: string = getSessionRole(req);
    const isAdminLike = sessionRole === 'admin' || sessionRole === 'owner';

    const limitNum = Number(limit) || 50;
    const offsetNum = Number(offset) || 0;

    // 非 admin/owner：强制按本人过滤 userId，覆盖 query 参数中可能传入的任意值，
    // 避免 sales/staff/academic 越权查看他人审计日志。
    const effectiveUserId = isAdminLike ? userId : currentUserId;

    const rows = await this.service.list({
      userId: effectiveUserId,
      targetType,
      targetId,
      action,
      from,
      to,
      limit: limitNum,
      offset: offsetNum,
    });
    return res.json({ ...rows, limit: limitNum, offset: offsetNum });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const currentUserId: string = getSessionUserId(req);
    const sessionRole: string = getSessionRole(req);
    const isAdminLike = sessionRole === 'admin' || sessionRole === 'owner';

    const row = await this.service.findOne(id);
    if (!row) {
      return res.status(404).json({ message: '操作日志不存在' });
    }
    // 非 admin/owner：仅可查看 user_id = 当前用户的记录；越权访问统一返 404，
    // 避免通过 403/401 区分"存在但无权限"和"不存在"造成信息泄露。
    if (!isAdminLike && row.userId !== currentUserId) {
      return res.status(404).json({ message: '操作日志不存在' });
    }
    return res.json(row);
  }
}
