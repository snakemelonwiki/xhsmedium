import { Controller, Get, Post, Body, Req, Res, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { Request, Response } from 'express';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId, getSessionRole } from '../../common/session.utils';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../../entities/user.entity';
import { Repository } from 'typeorm';

@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * 销售首页六宫格数据。
   * 仅 sales 角色可访问，只能查看本人的数据。
   */
  @Get('home-summary')
  async getHomeSummary(@Req() req: Request, @Res() res: Response) {
    const role = getSessionRole(req);
    if (role !== 'sales') {
      return res.status(403).json({ ok: false, message: 'forbidden: 仅销售可访问此接口' });
    }
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ ok: false, message: '未登录' });
    }
    const summary = await this.salesService.getHomeSummary(userId);
    return res.json(summary);
  }

  /**
   * v1.3 / SA-6: 销售"今日未添加"客资列表（红标置顶数据源）。
   * 今日分配给我但 add_status = not_added 的客资。
   */
  @Get('leads/today-not-added')
  async listTodayNotAdded(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: 'unauthenticated' });
    const result = await this.salesService.listTodayNotAdded(
      userId,
      Number(limit) || 50,
      Number(offset) || 0,
    );
    return res.json(result);
  }

  /**
   * v1.3 / SA-11: 销售"当日待跟进"列表（仅销售可看）。
   * next_follow_time ≤ 今天 23:59:59 且未关闭。
   */
  @Get('followups/today')
  async listTodayFollowups(
    @Req() req: Request,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: 'unauthenticated' });
    const result = await this.salesService.listTodayFollowupsForSales(
      userId,
      Number(limit) || 50,
      Number(offset) || 0,
    );
    return res.json(result);
  }

  /**
   * v1.3 / SA-7: 销售"我的成交"列表。
   * WHERE orders.sales_user_id = currentUser。
   */
  @Get('deals')
  async listMyDeals(
    @Req() req: Request,
    @Res() res: Response,
    @Query('status') status?: string | string[],
    @Query('productType') productType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: 'unauthenticated' });
    const normalizedStatus = Array.isArray(status)
      ? status
      : (status ? [status] : undefined);
    const result = await this.salesService.listMyDeals(userId, {
      status: normalizedStatus,
      productType,
      startDate,
      endDate,
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
    });
    return res.json(result);
  }

  /**
   * v1.3 / SA-8 + SA-9: 销售"成交"端点（与 POST /api/leads/:id/close-deal 行为一致，
   * 但挂在 /api/sales/ 前缀下，便于前端从我的成交页面直接调用）。
   */
  @Post('deals/close')
  async closeDeal(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req);
    if (!userId) return res.status(401).json({ ok: false, message: 'unauthenticated' });
    const leadId = String(body?.leadId || '').trim();
    if (!leadId) return res.status(422).json({ ok: false, message: 'leadId required' });
    try {
      const result = await this.salesService.closeDeal(leadId, userId, body || {});
      return res.json({ ok: true, orderId: result.orderId, orderCode: result.orderCode });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }
}
