import { Controller, Get, Put, Delete, Body, Param, Req, Res, Query } from '@nestjs/common';
import { LeadDraftsService } from './lead-drafts.service';
import { Request, Response } from 'express';
import { makeId } from '../../shared/utils/id-generator';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller('lead-drafts')
export class LeadDraftsController {
  constructor(
    private readonly leadDraftsService: LeadDraftsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Res() res: Response,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || (req.query?.actorUserId as string) || '';
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
    const actorUserId = getSessionUserId(req) || body.actorUserId || '';
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
  async remove(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const userId = getSessionUserId(req);
    // E/P1-01: 写一条 DELETE 操作日志（targetType=lead，detail.source 标识来自草稿），
    // 草稿删除属低敏感操作但仍按 delete 留痕便于审计追溯。
    await this.leadDraftsService.remove(id);
    try {
      await this.operationLogs.log({
        userId,
        action: OPERATION_LOG_ACTIONS.DELETE,
        targetType: OPERATION_LOG_TARGET_TYPES.LEAD,
        targetId: id,
        detail: stringifyDetail({ source: 'lead-drafts' }),
        ip: parseIp(req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[lead-drafts] operation log failed', (logErr as any)?.message || logErr);
    }
    return res.json({ ok: true });
  }
}
