import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ImportsService } from './imports.service';

@Controller()
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('leads/import-paste')
  async importPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'rows required' });
    }
    const result = await this.importsService.importLeadsPaste(rows, actorUserId, actorEmployeeId);
    return res.json(result);
  }

  @Post('leads/import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: any, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = this.rowsFromUpload(file, body);
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'file or rows required' });
    }
    const result = await this.importsService.importLeadsPaste(rows, actorUserId, actorEmployeeId);
    return res.json(result);
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

  @Post('posts/import-paste')
  async importPostsPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'rows required' });
    }
    const result = await this.importsService.importPostsPaste(rows, actorUserId, actorEmployeeId);
    return res.json(result);
  }

  @Post('posts/import')
  @UseInterceptors(FileInterceptor('file'))
  async importPostsExcel(@UploadedFile() file: any, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = this.rowsFromUpload(file, body);
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'file or rows required' });
    }
    const result = await this.importsService.importPostsPaste(rows, actorUserId, actorEmployeeId);
    return res.json(result);
  }

  @Get('posts/import-template.xlsx')
  async downloadPostsTemplate(@Res() res: Response) {
    const BOM = '﻿';
    const csv =
      BOM +
      '平台,标题,作品类型,作品链接,账号ID,发布时间,文案,封面URL,流量,点赞,评论,收藏,备注\n' +
      '小红书,示例作品,获客贴,https://example.com,,2026-05-31,示例文案,,0,0,0,0,备注\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="posts_import_template.csv"');
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

  private rowsFromUpload(file: any, body: any): string[] {
    if (Array.isArray(body?.rows)) return body.rows;
    if (typeof body?.content === 'string') {
      return body.content.split(/\r?\n/).filter((line: string) => line.trim());
    }
    if (!file?.buffer) return [];
    return Buffer.from(file.buffer).toString('utf8').split(/\r?\n/).filter((line) => line.trim());
  }
}
