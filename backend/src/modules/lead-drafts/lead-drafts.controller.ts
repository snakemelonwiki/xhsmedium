import { Controller, Get, Put, Delete, Body, Param, Req, Res, Query } from '@nestjs/common';
import { LeadDraftsService } from './lead-drafts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';

@Controller('lead-drafts')
export class LeadDraftsController {
  constructor(private readonly leadDraftsService: LeadDraftsService) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || (req.query?.actorUserId as string) || '';
    const draftType = type || 'lead';
    if (!actorUserId) {
      // 无登录态：保持旧行为返回空数组；分页参数下也以空 paged 对象返回
      if (limit !== undefined || offset !== undefined) {
        return res.json({ items: [], total: 0, limit: Number(limit) || 20, offset: Number(offset) || 0 });
      }
      return res.json([]);
    }
    // 任一存在 → 走 paged → 返回对象；否则数组（兼容旧前端）
    if (limit !== undefined || offset !== undefined) {
      const paged = await this.leadDraftsService.findByUserPaged(
        actorUserId,
        draftType,
        Number(limit) || 20,
        Number(offset) || 0,
      );
      return res.json(paged);
    }
    const rows = await this.leadDraftsService.findByUser(actorUserId, draftType);
    return res.json(rows);
  }

  @Put(':id')
  async upsert(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body.actorUserId || '';
    if (!actorUserId) {
      return res.status(401).json({ ok: false, message: 'unauthorized' });
    }
    const draftType = body.draftType || 'lead';
    const contentJson = typeof body.contentJson === 'string'
      ? body.contentJson
      : JSON.stringify(body.contentJson || {});
    const imageUrls = body.imageUrls !== undefined ? body.imageUrls : null;

    const draftId = id || makeId();
    const saved = await this.leadDraftsService.upsert(draftId, actorUserId, {
      draftType,
      contentJson,
      imageUrls,
    });
    return res.json({ ok: true, data: saved });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Res() res: Response) {
    await this.leadDraftsService.remove(id);
    return res.json({ ok: true });
  }
}
