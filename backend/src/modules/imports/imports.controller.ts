import {
  Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { ImportsService } from './imports.service';
import { PostsBulkImportService } from './posts-bulk-import.service';

@Controller()
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly postsBulkImportService: PostsBulkImportService,
  ) {}

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

  /**
   * #7 客资 Excel/CSV 上传导入：解析首个工作表，兼容模板表头与 CSV。
   */
  @Post('leads/import')
  @UseInterceptors(FileInterceptor('file'))
  async importExcel(@UploadedFile() file: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || 'anonymous';
    if (!file?.buffer) {
      return res.status(400).json({ ok: false, message: 'file required' });
    }
    const rows = this.parseLeadImportRows(file.buffer);
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: '导入文件没有可识别的数据行' });
    }
    const result = await this.importsService.importLeadsPaste(rows, actorUserId);
    return res.json(result);
  }

  @Get('leads/import-template.xlsx')
  async downloadTemplate(@Res() res: Response) {
    const buffer = this.buildWorkbookBuffer([
      ['platform', 'contact', 'nickname', 'account_name', 'remark'],
      ['小红书', '13800138000', '客户昵称', '来源账号', '备注'],
    ]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="leads_import_template.xlsx"',
    );
    return res.send(buffer);
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
  ) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || 'anonymous';
    const role = session?.role || '';
    const scope = String((req.query as any)?.scope || '');
    const rows = (scope === 'all' && (role === 'admin' || role === 'owner'))
      ? await this.importsService.listAllTasks(type)
      : await this.importsService.listTasks(actorUserId, type);
    return res.json(rows);
  }

  /**
   * #7 作品批量导入：粘贴 TSV / CSV 文本批量入库。
   * - 必填 session.userId 与 session.employeeId（未登录或未绑定员工返回 401）
   * - body: { raw: string, delimiter?: 'tab' | 'comma' }，默认 tab
   */
  @Post('imports/posts/paste')
  async importPostsByPaste(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId: string = session?.userId ?? '';
    const employeeId: string = session?.employeeId ?? '';
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    if (!employeeId) {
      return res.status(401).json({ ok: false, message: '当前账号未绑定员工，无法导入作品' });
    }

    const raw = typeof body?.raw === 'string' ? body.raw : '';
    const delimiter = body?.delimiter === 'comma' ? 'comma' : 'tab';
    if (!raw.trim()) {
      return res.status(400).json({ ok: false, message: 'raw required' });
    }
    const result = await this.postsBulkImportService.importPostsByPaste(
      userId,
      employeeId,
      raw,
      delimiter,
    );
    return res.json(result);
  }

  /**
   * #7 作品 Excel/CSV 上传导入：xlsx/csv 转成与粘贴导入相同的表头文本。
   */
  @Post('imports/posts/file')
  @UseInterceptors(FileInterceptor('file'))
  async importPostsByFile(@UploadedFile() file: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId: string = session?.userId ?? '';
    const employeeId: string = session?.employeeId ?? '';
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    if (!employeeId) {
      return res.status(401).json({ ok: false, message: '当前账号未绑定员工，无法导入作品' });
    }
    if (!file?.buffer) {
      return res.status(400).json({ ok: false, message: 'file required' });
    }
    const raw = this.parseTabText(file.buffer);
    if (!raw.trim()) {
      return res.status(400).json({ ok: false, message: '导入文件没有可识别的数据行' });
    }
    const result = await this.postsBulkImportService.importPostsByPaste(userId, employeeId, raw, 'tab');
    return res.json(result);
  }

  @Get('imports/posts/template.xlsx')
  async downloadPostsTemplate(@Res() res: Response) {
    const buffer = this.buildWorkbookBuffer([
      ['账号名', '平台', '标题', '文案', '作品链接', '作品类型', '播放量', '点赞', '评论', '收藏', '转发', '发布日期', '备注'],
      ['示例账号', '小红书', '示例标题', '示例文案', 'https://example.com/post', '获客贴', '1000', '20', '3', '5', '1', '2026-05-30', ''],
    ]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="posts_import_template.xlsx"');
    return res.send(buffer);
  }

  /**
   * #7 作品批量导入：列出当前用户的导入历史（默认 type=posts）。
   * 复用 ImportsService.listTasks 的实现。
   */
  @Get('imports/tasks')
  async listImportTasks(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
  ) {
    const session = (req as any).session;
    const userId: string = session?.userId ?? '';
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    const importType = type ?? 'posts';
    const role = session?.role || '';
    const scope = String((req.query as any)?.scope || '');
    const rows = (scope === 'all' && (role === 'admin' || role === 'owner'))
      ? await this.importsService.listAllTasks(importType)
      : await this.importsService.listTasks(userId, importType);
    return res.json(rows);
  }

  /**
   * 将 xlsx/csv Buffer 转换成 TSV 文本，首行保留表头。
   */
  private parseTabText(buffer: Buffer): string {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
    return rows
      .filter((row) => row.some((cell) => String(cell ?? '').trim()))
      .map((row) => row.map((cell) => String(cell ?? '').trim()).join('\t'))
      .join('\n');
  }

  /**
   * 客资导入文件转为 importLeadsPaste 兼容行，自动跳过模板表头。
   */
  private parseLeadImportRows(buffer: Buffer): string[] {
    const raw = this.parseTabText(buffer);
    const lines = raw.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return [];
    const first = lines[0].toLowerCase().replace(/\s+/g, '');
    const hasHeader = first.includes('platform') && first.includes('contact');
    return hasHeader ? lines.slice(1) : lines;
  }

  /**
   * 构造模板 xlsx 文件。
   */
  private buildWorkbookBuffer(rows: string[][]): Buffer {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'template');
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }
}
