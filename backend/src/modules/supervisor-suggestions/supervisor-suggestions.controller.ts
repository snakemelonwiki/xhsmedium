import {
  Controller, Get, Post, Patch, Body, Param, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionRole, getSessionUserId } from '../../common/session.utils';
import { SupervisorSuggestionsService } from './supervisor-suggestions.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

const SUPERVISOR_LIKE_ROLES = new Set(['admin', 'owner', 'supervisor']);

/**
 * 主管建议接口（A 端 P2-A）
 *
 * doc/v1.2-完整交付版-AB端任务分配.md 行 281-288：
 *   - POST /api/supervisor-suggestions    supervisor/owner/admin 创建
 *   - GET  /api/supervisor-suggestions    supervisor/owner/admin 看全，operation 只看自己
 *   - PATCH /api/supervisor-suggestions/:id/read  标记已读
 */
@Controller('supervisor-suggestions')
@UseGuards(AuthGuard)
export class SupervisorSuggestionsController {
  constructor(
    private readonly service: SupervisorSuggestionsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const supervisorId = getSessionUserId(req) || body.actorUserId || '';
    const role = getSessionRole(req);
    if (!supervisorId) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    if (!SUPERVISOR_LIKE_ROLES.has(role)) {
      return res.status(403).json({ ok: false, message: 'only supervisor/admin/owner can create suggestions' });
    }
    try {
      const saved = await this.service.create(supervisorId, {
        operatorId: body.operatorId,
        postId: body.postId || null,
        accountId: body.accountId || null,
        content: body.content,
      });
      // 写操作日志（不阻塞主流程）
      try {
        await this.operationLogs.log({
          userId: supervisorId,
          action: 'supervisor_suggestion_create',
          targetType: 'supervisor_suggestion',
          targetId: saved.id,
          detail: stringifyDetail({
            operatorId: body.operatorId,
            postId: body.postId || null,
            accountId: body.accountId || null,
            content: typeof body.content === 'string' ? body.content.slice(0, 200) : '',
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[supervisor-suggestions] operation log failed', (logErr as any)?.message || logErr);
      }
      return res.json({ ok: true, data: saved });
    } catch (err: any) {
      const status = err?.status === 400 ? 400 : 422;
      return res.status(status).json({ ok: false, message: err?.message || 'create failed' });
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('operatorId') operatorId?: string,
    @Query('supervisorId') supervisorId?: string,
    @Query('isRead') isRead?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = getSessionUserId(req);
    const role = getSessionRole(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const isReadFlag = isRead === undefined || isRead === ''
      ? undefined
      : (isRead === '1' || isRead === 'true' ? 1 : 0);
    const result = await this.service.listPaged({
      actorUserId: userId,
      actorRole: role,
      operatorId: operatorId || undefined,
      supervisorId: supervisorId || undefined,
      isRead: isReadFlag as any,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
    return res.json(result);
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req);
    const role = getSessionRole(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const ok = await this.service.markRead(id, userId, role);
    return res.json({ ok });
  }
}
