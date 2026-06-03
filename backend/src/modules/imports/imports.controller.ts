import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { ImportsService } from './imports.service';
import { getSessionUserId } from '../../common/session.utils';

@Controller()
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('leads/import-paste')
  async importPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'rows required' });
    }
    // 异步入口：创建任务 + 入队，返回 taskId
    const { taskId, status } = await this.importsService.enqueueImport({
      type: 'leads-paste',
      userId: actorUserId,
      employeeId: actorEmployeeId,
      rows,
    });
    return res.json({ ok: true, taskId, status });
  }

  @Post('leads/import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: any, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = this.rowsFromUpload(file, body);
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'file or rows required' });
    }
    // 异步入口：创建任务 + 入队，返回 taskId
    const { taskId, status } = await this.importsService.enqueueImport({
      type: 'leads-import',
      userId: actorUserId,
      employeeId: actorEmployeeId,
      rows,
      fileBuffer: file?.buffer,
    });
    return res.json({ ok: true, taskId, status });
  }

  // leads/import-template.xlsx 已挪到 LeadsController（避免被 leads/:id 路由抢占）。

  @Post('posts/import-paste')
  async importPostsPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'rows required' });
    }
    // 异步入口：创建任务 + 入队，返回 taskId
    const { taskId, status } = await this.importsService.enqueueImport({
      type: 'posts-paste',
      userId: actorUserId,
      employeeId: actorEmployeeId,
      rows,
    });
    return res.json({ ok: true, taskId, status });
  }

  @Post('posts/import')
  @UseInterceptors(FileInterceptor('file'))
  async importPostsExcel(@UploadedFile() file: any, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || body?.actorUserId || 'anonymous';
    const actorEmployeeId = session?.employeeId || body?.employeeId || '';
    const rows = this.rowsFromUpload(file, body);
    if (rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'file or rows required' });
    }
    // 异步入口：创建任务 + 入队，返回 taskId
    const { taskId, status } = await this.importsService.enqueueImport({
      type: 'posts-import',
      userId: actorUserId,
      employeeId: actorEmployeeId,
      rows,
      fileBuffer: file?.buffer,
    });
    return res.json({ ok: true, taskId, status });
  }

  // posts/import-template.xlsx 已挪到 PostsController（避免被 posts/:id 路由抢占）。

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
    const actorUserId = getSessionUserId(req) || 'anonymous';
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
