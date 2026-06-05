import { Body, Controller, Get, Param, Patch, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionRole, getSessionUserId } from '../../common/session.utils';
import { ScrapingAlertService } from './scraping-alert.service';
import { ScrapingLockService } from './scraping-lock.service';

/**
 * 抓取告警 / 抓取锁 — 仅 owner 可见
 *
 * 端点：
 *   GET  /api/scraping-alerts             列表（分页 + level/resolved 过滤）
 *   GET  /api/scraping-alerts/stats       统计概览
 *   PATCH /api/scraping-alerts/:id/resolve 标记已处理
 *   GET  /api/scraping-alerts/lock-status 当前抓取锁状态
 */
@Controller('scraping-alerts')
@UseGuards(AuthGuard)
export class ScrapingAlertsController {
  constructor(
    private readonly alertService: ScrapingAlertService,
    private readonly lockService: ScrapingLockService,
  ) {}

  private ensureOwner(req: any, res: Response): boolean {
    if (getSessionRole(req) !== 'owner') {
      res.status(403).json({ ok: false, message: 'forbidden: 仅 owner 可访问抓取告警' });
      return false;
    }
    return true;
  }

  @Get()
  async list(
    @Req() req: any,
    @Res() res: Response,
    @Query('level') level?: string,
    @Query('resolved') resolved?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!this.ensureOwner(req, res)) return;
    const data = await this.alertService.list({
      level,
      resolved: resolved === undefined ? undefined : Number(resolved),
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ ok: true, data });
  }

  @Get('stats')
  async stats(@Req() req: any, @Res() res: Response) {
    if (!this.ensureOwner(req, res)) return;
    const data = await this.alertService.stats();
    res.json({ ok: true, data });
  }

  @Patch(':id/resolve')
  async resolve(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    if (!this.ensureOwner(req, res)) return;
    const userId = getSessionUserId(req);
    const row = await this.alertService.resolve(id, userId);
    if (!row) {
      res.status(404).json({ ok: false, message: '告警不存在' });
      return;
    }
    res.json({ ok: true, data: row });
  }

  @Get('lock-status')
  async lockStatus(@Req() req: any, @Res() res: Response) {
    if (!this.ensureOwner(req, res)) return;
    res.json({ ok: true, data: this.lockService.getStatus() });
  }
}
