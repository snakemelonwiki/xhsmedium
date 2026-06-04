import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Req, Res, Query, UseGuards, Headers } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { DebounceGuard } from '../../common/debounce.guard';
import { AuthGuard, Public } from '../../common/auth.guard';
import { getSessionUserId } from '../../common/session.utils';
import { CollaborationTasksService } from '../collaboration-tasks/collaboration-tasks.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly collaborationTasksService: CollaborationTasksService,
    private readonly operationLogs: OperationLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('scope') scope?: 'self' | 'employee' | 'all',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('employeeId') employeeId?: string,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
    @Query('postType') postType?: string,
    @Query('status') status?: string,
    @Query('addStatus') addStatus?: string,
    @Query('processStatus') processStatus?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('keyword') keyword?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    // BUG-2: 新增筛选参数
    @Query('assignedSalesUserId') assignedSalesUserId?: string,
    @Query('postId') postId?: string,
    @Query('dealStatus') dealStatus?: string,
  ) {
    const session = (req as any).session;
    // §9 / AC-10.2：传了 limit 或 offset 任一即视为分页请求，返回 { items, total, limit, offset }。
    //   不传任何分页参数 → 兼容旧前端：返回纯数组。
    const wantsPaging = limit !== undefined || offset !== undefined;
    const effectiveScope = this.resolveScope(session?.role, scope);
    const filters = {
      scope: effectiveScope,
      employeeId,
      actorEmployeeId: session?.employeeId || '',
      actorUserId: getSessionUserId(req),
      actorRole: session?.role || '',
      accountId,
      platform,
      postType,
      status,
      addStatus,
      processStatus,
      search: q || search || keyword,
      from,
      to,
      // BUG-2: 新增筛选字段
      assignedSalesUserId,
      postId,
      dealStatus,
    };

    if (wantsPaging) {
      const result = await this.leadsService.findFilteredPaged(
        filters,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(result);
    }

    const rows = await this.leadsService.findFiltered(filters);
    return res.json(rows);
  }

  @Get('stats')
  async stats(
    @Req() req: Request,
    @Res() res: Response,
    @Query('scope') scope?: 'self' | 'employee' | 'all',
    @Query('employeeId') employeeId?: string,
    @Query('period') period?: 'today' | 'week' | 'month' | 'custom',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountId') accountId?: string,
    @Query('platform') platform?: string,
    @Query('postType') postType?: string,
    @Query('status') status?: string,
    @Query('addStatus') addStatus?: string,
    @Query('processStatus') processStatus?: string,
  ) {
    const session = (req as any).session;
    const result = await this.leadsService.stats({
      scope: this.resolveScope(session?.role, scope),
      employeeId,
      period,
      from,
      to,
      actorEmployeeId: session?.employeeId || '',
      actorUserId: getSessionUserId(req),
      actorRole: session?.role || '',
      accountId,
      platform,
      postType,
      status,
      addStatus,
      processStatus,
    });
    return res.json(result);
  }

  private resolveScope(role?: string, scope?: 'self' | 'employee' | 'all'): 'self' | 'employee' | 'all' {
    if (role === 'admin' || role === 'owner') {
      return scope || 'all';
    }
    return 'self';
  }

  @Get('export')
  async exportLeads(@Req() req: Request, @Res() res: Response) {
    // Legacy TSV export — keep for backward compatibility
    const rows = await this.leadsService.findAll();
    const header = '创建时间\t平台\t联系方式\t昵称\t状态\t分配销售\t备注\n';
    const body = rows.map((l) =>
      `${l.createdAt}\t${l.platform}\t${l.contactInfo}\t${l.nickname || ''}\t${l.status}\t${l.assignedSalesUserName || ''}\t${l.note || ''}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=leads_export.tsv');
    return res.send(header + body);
  }

  @Get('tomorrow-followups')
  async tomorrowFollowups(
    @Req() req: Request, @Res() res: Response,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const salesUserId = getSessionUserId(req) || actorUserId || '';
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.leadsService.findTomorrowFollowupsPaged(
        salesUserId,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(result);
    }
    const rows = await this.leadsService.findTomorrowFollowups(salesUserId);
    return res.json(rows);
  }

  @Post()
  @UseGuards(DebounceGuard)
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      const session = (req as any).session;
      // v1.3 / OP-5 / CROSS-1: 是否分流
      //   0 = 未分流：必传 assignedSalesUserId（service 层强校验）
      //   1 = 已分流：销售字段置空
      // 未传时按未分流处理，保留旧默认。
      const isDispatchedRaw = body.isDispatched;
      const isDispatched: 0 | 1 =
        isDispatchedRaw === 1 || isDispatchedRaw === '1' || isDispatchedRaw === true ? 1 : 0;
      const rawSalesId = body.assignedSalesUserId ? String(body.assignedSalesUserId) : '';
      const assignedSalesUserId = isDispatched === 1 ? null : rawSalesId || null;
      const assignedSalesUserName =
        isDispatched === 1 ? '' : body.assignedSalesUserName || '';

      await this.leadsService.create({
        id: makeId(),
        employeeId: session?.employeeId || '',
        accountId: body.accountId,
        postId: body.postId || null,
        platform: body.platform,
        contactInfo: body.contactInfo,
        nickname: body.nickname || '',
        budget: body.budget,
        majorContent: body.majorContent,
        ip: body.ip,
        status: body.status || (assignedSalesUserId ? 'assigned' : 'new'),
        dealAmount: body.dealAmount,
        note: body.note,
        requirementNote: body.requirementNote,
        supervisorNote: body.supervisorNote,
        captureImageUrl: body.captureImageUrl,
        salesFeedback: body.salesFeedback || '',
        salesUpdatedAt: body.salesUpdatedAt,
        salesUserName: body.salesUserName || '',
        assignedSalesUserId,
        assignedSalesUserName,
        processStatus: body.processStatus || 'not_contacted',
        addStatus: body.addStatus || 'not_added',
        intention: body.intention || null,
        isDispatched,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      // BadRequestException / ConflictException 等 NestJS 异常直接抛出让全局过滤器处理
      if (err.status) throw err;
      // 其他未预期错误
      console.error('[leads.create] unexpected error:', err.message || err);
      return res.status(500).json({ ok: false, message: 'Internal server error' });
    }
  }

  // 注意：批量导入模板下载必须位于 `:id` 路由之前，否则 NestJS 会把
  // `import-template.xlsx` 当作 :id 命中 findOne 并返回 404。
  @Get('import-template.xlsx')
  @Public()
  async downloadImportTemplate(@Res() res: Response) {
    const BOM = '﻿';
    const csv =
      BOM +
      '平台,联系方式,昵称,来源账号,备注\n' +
      '小红书,13800138000,示例客户,运营A,客户备注示例\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="leads_import_template.csv"',
    );
    return res.send(csv);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const row = await this.leadsService.findOne(id, {
      actorUserId: getSessionUserId(req),
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!row) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    // E/P1-01: 查看单条 lead 详情（包含 contactInfo 联系方式）记一条 VIEW_SENSITIVE。
    // best-effort 写日志，失败不阻塞响应。
    try {
      await this.operationLogs.log({
        userId: getSessionUserId(req),
        action: OPERATION_LOG_ACTIONS.VIEW_SENSITIVE,
        targetType: OPERATION_LOG_TARGET_TYPES.LEAD,
        targetId: id,
        detail: stringifyDetail({
          leadCode: row.leadCode || null,
          hasContact: Boolean(row.contactInfo),
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[leads] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json(row);
  }

  @Put(':id')
  @UseGuards(DebounceGuard)
  async update(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req);
    const before = await this.leadsService.findOne(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    // v1.3 / OP-5 / CROSS-1: 编辑客资时支持 isDispatched
    // 已分流(isDispatched=1)：销售字段强制清空；未传时保留原值（不强行改）。
    const updatePatch: Record<string, unknown> = {
      accountId: body.accountId,
      postId: body.postId || null,
      contactInfo: body.contactInfo,
      nickname: body.nickname || '',
      budget: body.budget,
      majorContent: body.majorContent,
      ip: body.ip,
      status: body.status,
      dealAmount: body.dealAmount,
      note: body.note,
      requirementNote: body.requirementNote,
      supervisorNote: body.supervisorNote,
      captureImageUrl: body.captureImageUrl,
      salesFeedback: body.salesFeedback,
      salesUpdatedAt: body.salesUpdatedAt,
      salesUserName: body.salesUserName,
      assignedSalesUserId: body.assignedSalesUserId,
      assignedSalesUserName: body.assignedSalesUserName,
      processStatus: body.processStatus,
      addStatus: body.addStatus,
      intention: body.intention,
    };
    if (body.isDispatched !== undefined) {
      const nextIsDispatched: 0 | 1 =
        body.isDispatched === 1 || body.isDispatched === '1' || body.isDispatched === true ? 1 : 0;
      updatePatch.isDispatched = nextIsDispatched;
      if (nextIsDispatched === 1) {
        // 已分流：销售字段强制置空
        updatePatch.assignedSalesUserId = null;
        updatePatch.assignedSalesUserName = '';
      }
    }
    await this.leadsService.update(id, updatePatch);
    // REASSIGN：本次请求把 assigned_sales_user_id 改成与原值不同的人，视为改派
    if (
      before
      && body.assignedSalesUserId !== undefined
      && (before as any).assignedSalesUserId !== body.assignedSalesUserId
    ) {
      try {
        await this.operationLogs.log({
          userId: actorUserId,
          action: OPERATION_LOG_ACTIONS.REASSIGN,
          targetType: OPERATION_LOG_TARGET_TYPES.LEAD,
          targetId: id,
          detail: stringifyDetail({
            from: (before as any).assignedSalesUserId || null,
            to: body.assignedSalesUserId || null,
          }),
          ip: parseIp(req),
        });
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.error('[leads] operation log failed', (logErr as any)?.message || logErr);
      }
      // BF-15 修复：改派时通知新销售（仅当分配到真实用户时）
      const newSalesId = (body.assignedSalesUserId || '').toString().trim();
      if (newSalesId) {
        try {
          await this.notificationsService.create({
            receiverIds: [newSalesId],
            senderId: actorUserId || null,
            portType: 'sales',
            typeCode: NOTIFICATION_TYPES.LEAD_ASSIGNED,
            title: '客资已改派给您',
            content: `客资 ${(before as any).contactInfo || ''} 已从 ${(before as any).assignedSalesUserName || (before as any).assignedSalesUserId || '未分配'} 改派给您，请尽快跟进`,
            relatedId: id,
            relatedType: 'lead',
          });
        } catch (notifErr) {
          // eslint-disable-next-line no-console
          console.error('[leads] reassign notification failed', (notifErr as any)?.message || notifErr);
        }
      }
    }
    return res.json({ ok: true });
  }

  @Put(':id/board')
  @UseGuards(DebounceGuard)
  async updateBoard(@Param('id') id: string, @Body() body: any, @Headers('if-match') ifMatch: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    // 解析 If-Match header 为 expectedUpdatedAt（可选，向后兼容）
    const expectedUpdatedAt = ifMatch ? new Date(ifMatch) : undefined;
    try {
      await this.leadsService.updateBoard(id, {
        status: body.status,
        assignedSalesUserId: body.assignedSalesUserId,
        assignedSalesUserName: body.assignedSalesUserName,
        processStatus: body.processStatus,
        addStatus: body.addStatus,
        intention: body.intention,
        intentionLevel: body.intentionLevel,
        nextFollowTime: body.nextFollowTime,
        followNote: body.followNote,
        followType: body.followType,
      }, actorUserId, expectedUpdatedAt);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Patch(':id/status')
  @UseGuards(DebounceGuard)
  async updateStatus(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    try {
      const lead = await this.leadsService.updateSalesStatus(id, {
        status: body.status,
        processStatus: body.processStatus,
        addStatus: body.addStatus,
        intention: body.intention,
        intentionLevel: body.intentionLevel,
        nextFollowTime: body.nextFollowTime,
        followNote: body.followNote || body.content || body.note,
        followType: body.followType,
      }, actorUserId);
      if (!lead) return res.status(404).json({ ok: false, message: 'not found' });
      return res.json({ ok: true, lead });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Get(':id/follow-records')
  async listFollowRecords(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Query('paged') paged: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId: getSessionUserId(req),
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    // §9 / AC-10.2 same shape switch as GET /api/leads:
    //   - 没传 limit/offset 任一 → 返回数组（旧前端兼容，前端把 await 出来的当作 Array 用）
    //   - 显式传了 limit/offset，或 paged=1 → 返回 { items, total, limit, offset }
    // 现役前端 (leads-monitor.js / orders-views.js) 调 follow-records 时会带 limit=100/50，
    // 仍走数组分支，不会把 records 错当成对象。需要 total 时前端额外加 paged=1 即可。
    const wantsPaging = paged === '1' || paged === 'true';
    if (wantsPaging) {
      const result = await this.leadsService.listFollowRecordsPaged(
        id,
        Number(limit) || 50,
        Number(offset) || 0,
      );
      return res.json(result);
    }
    const rows = await this.leadsService.listFollowRecords(
      id,
      Number(limit) || 50,
      Number(offset) || 0,
    );
    return res.json(rows);
  }

  @Post(':id/follow-records')
  async addFollowRecord(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    try {
      await this.leadsService.addFollowRecord(id, actorUserId, {
        followType: body.followType,
        content: body.content,
        nextFollowTime: body.nextFollowTime,
        processStatus: body.processStatus,
        intention: body.intention,
        intentionLevel: body.intentionLevel,
        // v1.3 / SA-1 + CROSS-2 扩展字段，回写 leads 自身
        clientDegree: body.clientDegree,
        clientMajorResearch: body.clientMajorResearch,
        clientTimeRequirement: body.clientTimeRequirement,
        objectionPoint: body.objectionPoint,
        followAction: body.followAction,
        followActionAt: body.followActionAt,
        requirementNote: body.requirementNote,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  /**
   * v1.3 / SA-1: 销售写跟进别名端点（与 follow-records 行为一致）。
   * 一些前端代码会按 /follow-ups 调用；同时支持。
   */
  @Post(':id/follow-ups')
  async addFollowUp(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.addFollowRecord(id, body, req, res);
  }

  /**
   * v1.3 / SA-3: 销售端"更新成交状态"端点。
   * 弹窗选择 dealStatus（not_deal / deal_pending / deal_done / refunded / invalid）+ dealAmount。
   */
  @Patch(':id/deal-status')
  @UseGuards(DebounceGuard)
  async updateDealStatus(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    try {
      const lead = await this.leadsService.updateDealStatus(id, actorUserId, {
        dealStatus: body.dealStatus,
        dealAmount: body.dealAmount,
      });
      if (!lead) return res.status(404).json({ ok: false, message: 'not found' });
      return res.json({ ok: true, lead });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  /**
   * v1.3 / SA-3: 销售端"更新意向程度"端点。
   * 弹窗选择 intentionLevel（high / mid / low / invalid / pending）。
   */
  @Patch(':id/intention-level')
  @UseGuards(DebounceGuard)
  async updateIntentionLevel(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    try {
      const lead = await this.leadsService.updateIntentionLevel(id, actorUserId, {
        intentionLevel: body.intentionLevel,
      });
      if (!lead) return res.status(404).json({ ok: false, message: 'not found' });
      return res.json({ ok: true, lead });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Post(':id/collaboration')
  async createCollaboration(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const requesterId = getSessionUserId(req) || body.actorUserId || '';
    if (!requesterId) {
      return res.status(401).json({ ok: false, message: 'no requester' });
    }
    const canAccess = await this.leadsService.canAccessLead(id, {
      actorUserId: requesterId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    if (!canAccess) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    try {
      const task = await this.collaborationTasksService.create({
        leadId: id,
        type: body.type,
        reason: body.reason || body.remark || null,
        requesterId,
      });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Post(':id/remind')
  async remind(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    // Legacy: notification-only route
    const session = (req as any).session;
    // Placeholder: in legacy code this creates notifications in JSON
    // For now, just return OK
    return res.json({ ok: true });
  }

  @Post(':id/source-confirm')
  async sourceConfirm(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
    try {
      const result = await this.leadsService.confirmSource({
        id,
        matchedPostId: body.matchedPostId,
        sourceOperatorId: body.sourceOperatorId,
        actorUserId,
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || '';
    // E/P1-01: 删除前取 before 快照用于审计 detail；操作日志写 DELETE action。
    const before = await this.leadsService.findOne(id, {
      actorUserId: userId,
      actorEmployeeId: session?.employeeId || '',
      actorRole: session?.role || '',
    });
    await this.leadsService.remove(id);
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.LEAD,
        targetId: id,
        detail: stringifyDetail({
          leadCode: before?.leadCode || null,
          contactInfo: before?.contactInfo || null,
          platform: before?.platform || null,
          status: before?.status || null,
        }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[leads] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }
}
