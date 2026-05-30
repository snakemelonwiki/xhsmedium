import { Controller, Get, Post, Put, Body, Param, Req, Res, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { CollaborationTasksService } from './collaboration-tasks.service';

@Controller('collaboration-tasks')
export class CollaborationTasksController {
  constructor(private readonly service: CollaborationTasksService) {}

  @Post()
  async create(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const requesterId = session?.userId || session?.id || body.actorUserId || '';
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
    @Query('leadId') leadId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const userId = session?.userId || session?.id || actorUserId || '';
    // §9 / AC-10.2：传了 limit 或 offset 任一即视为分页请求，返回 { items, total, limit, offset }；
    //   不传任何分页参数 → 兼容旧前端：返回纯数组。
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.service.listPaged({
        scope,
        status,
        leadId,
        userId,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const rows = await this.service.list({
      scope,
      status,
      leadId,
      userId,
    });
    return res.json(rows);
  }

  @Put(':id/claim')
  async claim(@Param('id') id: string, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const handlerId = session?.userId || session?.id || body.actorUserId || '';
    if (!handlerId) {
      return res.status(401).json({ ok: false, message: 'no handler' });
    }
    try {
      const task = await this.service.claim(id, handlerId);
      if (!task) return res.status(404).json({ ok: false, message: 'not found' });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Put(':id/handle')
  async handle(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    try {
      const task = await this.service.handle(id, body.handledNote || '');
      if (!task) return res.status(404).json({ ok: false, message: 'not found' });
      return res.json({ ok: true, task });
    } catch (err: any) {
      return res.status(422).json({ ok: false, message: err.message || 'invalid' });
    }
  }

  @Put(':id/close')
  async close(@Param('id') id: string, @Res() res: Response) {
    const task = await this.service.close(id);
    if (!task) return res.status(404).json({ ok: false, message: 'not found' });
    return res.json({ ok: true, task });
  }
}
