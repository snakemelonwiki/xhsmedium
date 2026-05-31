import { Controller, Get, Post, Put, Delete, Body, Param, Req, Res, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async findAll(@Req() req: Request, @Res() res: Response, @Query('scope') scope?: string) {
    const session = (req as any).session;
    const pagination = this.parsePagination((req as any).query || {});
    if (session?.role === 'staff' && session?.employeeId && scope !== 'all') {
      const result = await this.leadsService.findByEmployeePage(session.employeeId, pagination);
      return res.json(result);
    }
    const result = await this.leadsService.findAllPage(pagination);
    return res.json(result);
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
      scope: scope || (session?.role === 'staff' ? 'self' : 'all'),
      employeeId,
      period,
      from,
      to,
      actorEmployeeId: session?.employeeId || '',
      accountId,
      platform,
      postType,
      status,
      addStatus,
    });
    return res.json(result);
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
  ) {
    const session = (req as any).session;
    const actorEmployeeId = session?.employeeId || queryActorUserId || '';
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
      status: body.status || '新客资',
      dealAmount: body.dealAmount,
      note: body.note,
      captureImageUrl: body.captureImageUrl,
      salesFeedback: body.salesFeedback || '',
      salesUpdatedAt: body.salesUpdatedAt,
      salesUserName: body.salesUserName || '',
      assignedSalesUserId: body.assignedSalesUserId || null,
      assignedSalesUserName: body.assignedSalesUserName || '',
      processStatus: body.processStatus || 'not_contacted',
      addStatus: body.addStatus || '未添加',
      intention: body.intention || null,
    });
    return res.json({ ok: true });
  }

  @Put(':id')
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
    @Res() res: Response,
  ) {
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

  /**
   * 解析客资列表分页参数，兼容 limit/offset 与 page/pageSize。
   */
  private parsePagination(query: any): { limit: number; offset: number } {
    const pageSize = Number(query?.pageSize);
    const page = Number(query?.page);
    const rawLimit = Number(query?.limit);
    const limit = Math.min(Math.max(Number.isFinite(pageSize) && pageSize > 0 ? pageSize : (Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20), 1), 200);
    const rawOffset = Number(query?.offset);
    const offset = Number.isFinite(page) && page > 0
      ? (Math.floor(page) - 1) * limit
      : (Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0);
    return { limit, offset };
  }
}
