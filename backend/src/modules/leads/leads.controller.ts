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
    if (session?.role === 'staff' && session?.employeeId && scope !== 'all') {
      const rows = await this.leadsService.findByEmployee(session.employeeId);
      return res.json(rows);
    }
    const rows = await this.leadsService.findAll();
    return res.json(rows);
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
      processStatus: body.processStatus || '未接',
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
  async updateBoard(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    await this.leadsService.updateBoard(id, {
      assignedSalesUserId: body.assignedSalesUserId,
      assignedSalesUserName: body.assignedSalesUserName,
      processStatus: body.processStatus,
      addStatus: body.addStatus,
      intention: body.intention,
    });
    return res.json({ ok: true });
  }

  @Post(':id/remind')
  async remind(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    // Legacy: notification-only route
    const session = (req as any).session;
    // Placeholder: in legacy code this creates notifications in JSON
    // For now, just return OK
    return res.json({ ok: true });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.leadsService.remove(id);
    return res.json({ ok: true });
  }
}
