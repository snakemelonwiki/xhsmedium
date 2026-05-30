import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ImportsService } from './imports.service';

@Controller()
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('leads/import-paste')
  async importPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || 'anonymous';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'rows required' });
    }
    const result = await this.importsService.importLeadsPaste(rows, actorUserId);
    return res.json(result);
  }

  @Post('leads/import')
  async importExcel(@Body() _body: any, @Res() res: Response) {
    // Placeholder for future Excel upload. Multer + xlsx wiring deferred.
    return res.json({
      ok: false,
      message: 'Excel 上传暂未实现，请使用 /import-paste',
    });
  }

  @Get('leads/import-template.xlsx')
  async downloadTemplate(@Res() res: Response) {
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

  @Get('import-tasks/:id')
  async getTask(@Param('id') id: string, @Res() res: Response) {
    const row = await this.importsService.getTask(id);
    if (!row) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    return res.json(row);
  }

  @Get('import-tasks')
  async listTasks(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || 'anonymous';
    // 任一存在 → 走 paged → 返回对象；否则数组（兼容旧前端）
    if (limit !== undefined || offset !== undefined) {
      const paged = await this.importsService.listTasksPaged(
        actorUserId,
        type,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(paged);
    }
    const rows = await this.importsService.listTasks(actorUserId, type);
    return res.json(rows);
  }
}
