import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { CollaborationTasksService } from './collaboration-tasks.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('collaboration-tasks')
@UseGuards(AuthGuard)
export class CollaborationTasksController {
  constructor(
    private readonly service: CollaborationTasksService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  private async logSafe(args: {
    userId: string;
    action: OPERATION_LOG_ACTIONS;
    targetId: string;
    detail?: any;
    req?: Request;
  }): Promise<void> {
    try {
      await this.operationLogs.log({
        userId: args.userId || '',
        action: args.action,
        targetType: OPERATION_LOG_TARGET_TYPES.COLLABORATION,
        targetId: args.targetId,
        detail: stringifyDetail(args.detail),
        ip: parseIp(args.req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[collaboration-tasks] operation log failed', (logErr as any)?.message || logErr);
    }
  }

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const requesterId = getSessionUserId(req) || body.actorUserId || '';
    if (!requesterId) {
      return res.status(401).json({ ok: false, message: 'no requester' });
    }
    try {
      const task = await this.service.create({
        leadId: body.leadId,
        type: body.type,
        reason: body.reason || null,
        requesterId,
      });
      // 写操作日志：协同任务创建
      await this.logSafe({
        userId: requesterId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetId: (task as any)?.id || '',
        detail: {
          leadId: body.leadId,
          type: body.type,
          reason: body.reason || null,
        },
        req,
      });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('leadId') leadId?: string,
    @Query('keyword') keyword?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('startAt') startAt?: string,
    @Query('endAt') endAt?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || actorUserId || '';
    const role = session?.role || '';
    // 兼容多种搜索字段命名（keyword / q / search 任一即生效）。
    const mergedKeyword = (keyword || q || search || '').trim() || undefined;
    // §9 / AC-10.2：传了 limit 或 offset 任一即视为分页请求，返回 { items, total, limit, offset }；
    //   不传任何分页参数 → 兼容旧前端：返回纯数组。
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.service.listPaged({
        scope,
        status,
        type,
        leadId,
        keyword: mergedKeyword,
        startAt,
        endAt,
        userId,
        employeeId: session?.employeeId || '',
        role,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const rows = await this.service.list({
      scope,
      status,
      type,
      leadId,
      keyword: mergedKeyword,
      startAt,
      endAt,
      userId,
      employeeId: session?.employeeId || '',
      role,
    });
    return res.json(rows);
  }

  @Put(':id/claim')
  async claim(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const handlerId = getSessionUserId(req) || body.actorUserId || '';
    if (!handlerId) {
      return res.status(401).json({ ok: false, message: 'no handler' });
    }
    try {
      const task = await this.service.claim(id, handlerId);
      if (!task) return res.status(404).json({ ok: false, message: 'not found' });
      // 写操作日志：协同任务认领
      await this.logSafe({
        userId: handlerId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetId: id,
        detail: { step: 'claim' },
        req,
      });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  // 同时暴露 PUT 与 PATCH：销售端 /sales/collaboration 与运营端
  // /operation/collaboration 对 handle 接口使用不同 verb，需保持并存。
  // NestJS 不允许多个 HTTP verb 装饰器修饰同一方法体，所以拆成两个 wrapper，
  // 内部都委托到 service.handle。
  @Put(':id/handle')
  async handlePut(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.runHandle(id, body, req, res);
  }

  @Patch(':id/handle')
  async handlePatch(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.runHandle(id, body, req, res);
  }

  private async runHandle(id: string, body: any, req: Request, res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    try {
      const task = await this.service.handle(id, body.handledNote || body.result || '', {
        actorUserId,
        actorEmployeeId: session?.employeeId || '',
        actorRole: session?.role || '',
      });
      if (!task) return res.status(404).json({ ok: false, message: 'not found' });
      // 写操作日志：协同任务处理
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.STATUS_CHANGE,
        targetId: id,
        detail: {
          step: 'handle',
          handledNote: body.handledNote || body.result || '',
        },
        req,
      });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  // 同时暴露 PUT 与 PATCH：销售端 /sales/collaboration 与运营端
  // /operation/collaboration 对 close 接口使用不同 verb，需保持并存。
  // NestJS 不允许多个 HTTP verb 装饰器修饰同一方法体，所以拆成两个 wrapper，
  // 内部都委托到 runClose → service.close。TC-PERM-037 P0 修复：close 增加
  // 发起人/管理员越权校验。
  @Put(':id/close')
  async closePut(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.runClose(id, req, res);
  }

  @Patch(':id/close')
  async closePatch(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    return this.runClose(id, req, res);
  }

  private async runClose(id: string, req: Request, res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || '';
    const actorRole = session?.role || '';
    try {
      const task = await this.service.close(id, {
        actorUserId,
        actorRole,
      });
      if (!task) return res.status(404).json({ ok: false, message: 'not found' });
      // 写操作日志：协同任务关闭
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.UPDATE,
        targetId: id,
        detail: { step: 'close' },
        req,
      });
      return res.json({ ok: true, task });
    } catch (err: any) {
      // assertCanClose 抛 'no permission' / 'close requires user' → 403；
      // 其它业务错误（理论上不应再出现）→ 422。
      const msg = err?.message || 'invalid';
      if (typeof msg === 'string' && /no permission|close requires user/i.test(msg)) {
        return res.status(403).json({ ok: false, message: msg });
      }
      return res.status(422).json({ ok: false, message: msg });
    }
  }

  /**
   * 手动触发一次协同任务超时扫描（仅 admin/owner 可用）。
   * 用于本地回归、生产侧应急（如调度卡死后手动催发）。
   * 必须放在 `@Get(':id')` 之前，避免 'scan-timeouts' 被路由参数 :id 抢占。
   */
  @Post('scan-timeouts')
  async triggerTimeoutScan(@Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const role = session?.role || '';
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ ok: false, message: 'forbidden' });
    }
    try {
      const result = await this.service.runOnce();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'scan failed' });
    }
  }

  /**
   * 列出当前所有 timeout 状态的协同任务（仅 admin/owner 可用全表）。
   * 必须放在 `@Get(':id')` 之前，避免 'timeouts' 被路由参数 :id 抢占。
   */
  @Get('timeouts')
  async listTimeouts(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const role = session?.role || '';
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ ok: false, message: 'forbidden' });
    }
    const result = await this.service.listTimeouts({
      userId: getSessionUserId(req),
      role,
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
    return res.json(result);
  }
}
