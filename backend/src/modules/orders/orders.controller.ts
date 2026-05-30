import {
  Controller, Get, Post, Patch, Body, Param, Req, Res, Query,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OrdersService } from './orders.service';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Sales marks a lead as deal-closed; spawns the order in a single transaction.
   * Mounted on the leads path so it lives next to the lead lifecycle but inside
   * the orders module (leaves leads.controller.ts untouched).
   */
  @Post('leads/:id/close-deal')
  async closeDeal(
    @Param('id') leadId: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const salesUserId = session?.userId || session?.id || body?.salesUserId || '';
    if (!salesUserId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      const orderId = await this.ordersService.closeDeal(leadId, salesUserId, {
        serviceType: body?.serviceType ?? null,
        amount: body?.amount ?? null,
        remark: body?.remark ?? null,
      });
      return res.json({ ok: true, orderId });
    } catch (err: any) {
      const status = err?.status || 422;
      return res.status(status).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  @Get('orders')
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('scope') scope?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('actorRole') actorRole?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const currentUserId = session?.userId || session?.id || actorUserId || '';
    const sessionRole = session?.role || actorRole;
    // §9 / AC-10.2：传了 limit 或 offset 任一即视为分页请求，返回 { items, total, limit, offset }；
    //   不传任何分页参数 → 兼容旧前端：返回纯数组。
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.ordersService.listPaged({
        role,
        status,
        scope,
        currentUserId,
        sessionRole,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const rows = await this.ordersService.list({
      role,
      status,
      scope,
      currentUserId,
      sessionRole,
    });
    return res.json(rows);
  }

  @Get('orders/:id')
  async findOne(@Param('id') id: string, @Res() res: Response) {
    try {
      const order = await this.ordersService.findOne(id);
      return res.json(order);
    } catch (err: any) {
      const code = err?.status || 404;
      return res.status(code).json({ ok: false, message: err?.message || 'not found' });
    }
  }

  @Patch('orders/:id')
  async update(@Param('id') id: string, @Body() body: any, @Res() res: Response) {
    try {
      await this.ordersService.update(id, {
        order_status: body?.order_status,
        paid_status: body?.paid_status,
        academic_user_id: body?.academic_user_id,
        service_type: body?.service_type,
        amount: body?.amount,
        remark: body?.remark,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  @Post('orders/:id/follow-records')
  async addFollowRecord(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = session?.userId || session?.id || body?.actorUserId || '';
    try {
      await this.ordersService.addFollowRecord(id, actorUserId, {
        nodeType: body?.nodeType,
        content: body?.content,
        nextRemindAt: body?.nextRemindAt,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  @Get('orders/:id/follow-records')
  async listFollowRecords(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // §9 / AC-10.2 跟进记录天然分页，直接返回 { items, total, limit, offset } 对象。
    const result = await this.ordersService.listFollowRecords(
      id,
      Number(limit) || 20,
      Number(offset) || 0,
    );
    return res.json(result);
  }
}
