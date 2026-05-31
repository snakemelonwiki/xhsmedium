import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, Query, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { DebounceGuard } from '../../common/debounce.guard';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

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
    @Query('from') from?: string,
    @Query('to') to?: string,
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
      actorUserId: session?.userId || session?.id || '',
      actorRole: session?.role || '',
      accountId,
      platform,
      postType,
      status,
      addStatus,
      from,
      to,
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
  ) {
    const session = (req as any).session;
    const result = await this.leadsService.stats({
      scope: this.resolveScope(session?.role, scope),
      employeeId,
      period,
      from,
      to,
      actorEmployeeId: session?.employeeId || '',
      actorUserId: session?.userId || session?.id || '',
      actorRole: session?.role || '',
      accountId,
      platform,
      postType,
      status,
      addStatus,
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
    const salesUserId = session?.userId || session?.id || actorUserId || '';
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

  // ---- 被动添加客资识别（passive） §4.3 ----
  // 注意：这一组路由必须在所有 `:id` 路由之前注册，否则 NestJS 会把
  // 字面量 'passive' 当作 :id 参数命中错误的处理函数。

  @Get('passive/candidates')
  async passiveCandidates(
    @Req() req: Request,
    @Res() res: Response,
    @Query('phone') phone?: string,
    @Query('wechat') wechat?: string,
    @Query('nickname') nickname?: string,
    @Query('actorUserId') queryActorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const actorEmployeeId = session?.employeeId || queryActorUserId || '';
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.leadsService.findPassiveCandidatesPaged({
        phone,
        wechat,
        nickname,
        actorEmployeeId,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const rows = await this.leadsService.findPassiveCandidates({
      phone,
      wechat,
      nickname,
      actorEmployeeId,
    });
    return res.json(rows);
  }

  @Post('passive/bind')
  async passiveBind(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
    const actorUserName = session?.employeeName || session?.username || '';
    try {
      const result = await this.leadsService.bindPassive({
        leadId: body.leadId,
        contact: body.contact || '',
        salesFeedback: body.salesFeedback,
        actorUserId,
        actorUserName,
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Post('passive/new')
  async passiveNew(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
    const actorUserName = session?.employeeName || session?.username || '';
    try {
      const result = await this.leadsService.createPassive({
        contact: body.contact || '',
        nickname: body.nickname,
        platform: body.platform,
        salesFeedback: body.salesFeedback,
        actorUserId,
        actorUserName,
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Post()
  @UseGuards(DebounceGuard)
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
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
      status: body.status || 'new',
      dealAmount: body.dealAmount,
      note: body.note,
      captureImageUrl: body.captureImageUrl,
      salesFeedback: body.salesFeedback || '',
      salesUpdatedAt: body.salesUpdatedAt,
      salesUserName: body.salesUserName || '',
      assignedSalesUserId: body.assignedSalesUserId || null,
      assignedSalesUserName: body.assignedSalesUserName || '',
      processStatus: body.processStatus || 'not_contacted',
      addStatus: body.addStatus || 'not_added',
      intention: body.intention || null,
    });
    return res.json({ ok: true });
  }

  @Put(':id')
  @UseGuards(DebounceGuard)
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.leadsService.update(id, {
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
      captureImageUrl: body.captureImageUrl,
      salesFeedback: body.salesFeedback,
      salesUpdatedAt: body.salesUpdatedAt,
      salesUserName: body.salesUserName,
      assignedSalesUserId: body.assignedSalesUserId,
      assignedSalesUserName: body.assignedSalesUserName,
      processStatus: body.processStatus,
      addStatus: body.addStatus,
      intention: body.intention,
    });
    return res.json({ ok: true });
  }

  @Put(':id/board')
  @UseGuards(DebounceGuard)
  async updateBoard(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
    await this.leadsService.updateBoard(id, {
      assignedSalesUserId: body.assignedSalesUserId,
      assignedSalesUserName: body.assignedSalesUserName,
      processStatus: body.processStatus,
      addStatus: body.addStatus,
      intention: body.intention,
      intentionLevel: body.intentionLevel,
      nextFollowTime: body.nextFollowTime,
      followNote: body.followNote,
      followType: body.followType,
    }, actorUserId);
    return res.json({ ok: true });
  }

  @Get(':id/follow-records')
  async listFollowRecords(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Query('paged') paged: string,
    @Res() res: Response,
  ) {
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
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
    try {
      await this.leadsService.addFollowRecord(id, actorUserId, {
        followType: body.followType,
        content: body.content,
        nextFollowTime: body.nextFollowTime,
      });
      return res.json({ ok: true });
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
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
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
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.leadsService.remove(id);
    return res.json({ ok: true });
  }
}
