import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExportsService, ExportType } from './exports.service';

const ALLOWED_TYPES: ExportType[] = [
  'leads',
  'orders',
  'collaboration_records',
  'posts',
  'rankings',
];

@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  /**
   * 创建一个异步导出任务。
   *   body: { exportType, filter?, actorUserId?, actorRole? }
   * filter 原样落库（filter_json）并在生成时透传给具体导出器。
   */
  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || body?.actorUserId || '';
    const userRole = session?.role || body?.actorRole || 'staff';
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const exportType = body?.exportType as ExportType;
    if (!ALLOWED_TYPES.includes(exportType)) {
      return res.status(422).json({ ok: false, message: 'invalid exportType' });
    }
    try {
      const filter = (body?.filter && typeof body.filter === 'object') ? { ...body.filter } : {};
      // 把当前操作人角色透传给 service 做脱敏，落库前会被 _userRole 这个内部键带过去
      filter._userRole = userRole;
      const result = await this.service.create({
        userId,
        userRole,
        exportType,
        filterJson: filter,
      });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err?.message || String(err) });
    }
  }

  @Get()
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || actorUserId || '';
    // 任一存在 → 走 paged → 返回对象；否则数组（兼容旧前端）
    if (limit !== undefined || offset !== undefined) {
      const paged = await this.service.listForUserPaged(
        userId,
        type || undefined,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(paged);
    }
    const rows = await this.service.listForUser(userId, type || undefined);
    return res.json(rows);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    const task = await this.service.findOne(id);
    if (!task) {
      return res.status(404).json({ ok: false, message: 'not found' });
    }
    return res.json(task);
  }
}
