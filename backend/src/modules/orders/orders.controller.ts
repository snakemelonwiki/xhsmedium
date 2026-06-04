import {
  Controller, Get, Post, Patch, Body, Param, Req, Res, Query, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { OrdersService } from './orders.service';
import { RemindersService } from './reminders.service';
import { OrderAbnormalFeedbackService } from './order-abnormal-feedback.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { AuthGuard } from '../../common/auth.guard';
import { getSessionUserId } from '../../common/session.utils';
import {
  OPERATION_LOG_ACTIONS,
  OPERATION_LOG_TARGET_TYPES,
  parseIp,
  stringifyDetail,
} from '../../shared/operation-logs.constants';

@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly remindersService: RemindersService,
    private readonly abnormalFeedbackService: OrderAbnormalFeedbackService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * Helper: best-effort 写一条操作日志，try/catch 包住避免日志失败影响主流程。
   * service 内部已用同方法，但本 controller 仍按"控制器层注入日志"的要求显式补一份。
   */
  private async logSafe(args: {
    userId: string;
    action: OPERATION_LOG_ACTIONS;
    targetType: OPERATION_LOG_TARGET_TYPES;
    targetId: string;
    detail?: any;
    req?: Request;
  }): Promise<void> {
    try {
      await this.operationLogs.log({
        userId: args.userId || '',
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId,
        detail: stringifyDetail(args.detail),
        ip: parseIp(args.req),
      });
    } catch (logErr) {
      // eslint-disable-next-line no-console
      console.error('[orders] operation log failed', (logErr as any)?.message || logErr);
    }
  }

  /**
   * Sales marks a lead as deal-closed; spawns the order in a single transaction.
   * Mounted on the leads path so it lives next to the lead lifecycle but inside
   * the orders module (leaves leads.controller.ts untouched).
   *
   * v1.3 / SA-8 + SA-9: 同步创建 orders / order_finance / order_follow_records 三表。
   * 接受 productType / guaranteeType / paymentStage / clientRequirementNote 等扩展字段。
   */
  @Post('leads/:id/close-deal')
  async closeDeal(
    @Param('id') leadId: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const salesUserId = getSessionUserId(req) || body?.salesUserId || '';
    if (!salesUserId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      const result = await this.ordersService.closeDeal(leadId, salesUserId, {
        serviceType: body?.serviceType ?? null,
        amount: body?.amount ?? null,
        remark: body?.remark ?? null,
        productType: body?.productType ?? null,
        guaranteeType: body?.guaranteeType ?? null,
        paymentStage: body?.paymentStage ?? null,
        clientRequirementNote: body?.clientRequirementNote ?? null,
        contractStatus: body?.contractStatus ?? null,
        paidStatus: body?.paidStatus ?? null,
        deliveryRequirement: body?.deliveryRequirement ?? null,
        expectedHandleTime: body?.expectedHandleTime ?? null,
      });
      // 写操作日志：销售成单（订单创建）
      await this.logSafe({
        userId: salesUserId,
        action: OPERATION_LOG_ACTIONS.CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER,
        targetId: result.orderId,
        detail: {
          from: 'lead.close-deal',
          leadId,
          serviceType: body?.serviceType ?? null,
          productType: body?.productType ?? null,
          amount: body?.amount ?? null,
          orderCode: result.orderCode,
        },
        req,
      });
      return res.json({ ok: true, orderId: result.orderId, orderCode: result.orderCode });
    } catch (err: any) {
      const status = err?.status || 422;
      return res.status(status).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  /**
   * 教务端首页六宫格汇总。
   * 必须放在 `@Get('orders/:id')` 之前，避免 'academic' 被路由参数 :id 抢占。
   */
  @Get('academic/home-summary')
  async academicHomeSummary(@Req() req: Request, @Res() res: Response) {
    const userId = getSessionUserId(req) || '';
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      const data = await this.ordersService.getAcademicHomeSummary(userId);
      return res.json(data);
    } catch (err: any) {
      return res
        .status(500)
        .json({ ok: false, message: err?.message || 'home summary failed' });
    }
  }

  @Get('orders')
  async list(
    @Req() req: Request,
    @Res() res: Response,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('handoverStatus') handoverStatus?: string,
    @Query('scope') scope?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('actorRole') actorRole?: string,
    @Query('keyword') keyword?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('paidStatus') paidStatus?: string,
    @Query('salesId') salesId?: string,
    @Query('academicAdminId') academicAdminId?: string,
    @Query('serviceType') serviceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('abnormal') abnormal?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const session = (req as any).session;
    const currentUserId = getSessionUserId(req) || actorUserId || '';
    const sessionRole = session?.role || actorRole;
    // 兼容多种搜索字段命名（keyword / q / search 任一即生效）。
    const mergedKeyword = (keyword || q || search || '').trim() || undefined;
    // 解析 abnormal 参数
    const abnormalFlag = abnormal === 'true' || abnormal === '1';
    // §9 / AC-10.2：传了 limit 或 offset 任一即视为分页请求，返回 { items, total, limit, offset }；
    //   不传任何分页参数 → 兼容旧前端：返回纯数组。
    const wantsPaging = limit !== undefined || offset !== undefined;
    if (wantsPaging) {
      const result = await this.ordersService.listPaged({
        role,
        status,
        handoverStatus,
        scope,
        currentUserId,
        sessionRole,
        keyword: mergedKeyword,
        paidStatus,
        salesId,
        academicAdminId,
        serviceType,
        startDate,
        endDate,
        abnormal: abnormalFlag,
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      });
      return res.json(result);
    }
    const rows = await this.ordersService.list({
      role,
      status,
      handoverStatus,
      scope,
      currentUserId,
      sessionRole,
      keyword: mergedKeyword,
      paidStatus,
      salesId,
      academicAdminId,
      serviceType,
      startDate,
      endDate,
      abnormal: abnormalFlag,
    });
    return res.json(rows);
  }

  /**
   * 教务/销售视角的"节点提醒"列表：列出自己跟进过 OR 自己名下订单
   * 中下次提醒时间已到 / 即将在 upcomingHours 小时内到的记录。
   * 必须放在 `@Get('orders/:id')` 之前，否则 'reminders' 会被路由参数 :id 抢占。
   */
  @Get('orders/reminders/pending')
  async listPendingReminders(
    @Req() req: Request,
    @Res() res: Response,
    @Query('upcomingHours') upcomingHours?: string,
    @Query('limit') limit?: string,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || '';
    if (!userId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    const items = await this.remindersService.listPending(userId, {
      upcomingHours: upcomingHours !== undefined ? Number(upcomingHours) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
    return res.json({ items, total: items.length });
  }

  /**
   * 手动触发一次提醒扫描（仅 admin/owner 可用）；
   * 用于本地回归与生产侧应急（如调度卡死后手动催发）。
   */
  @Post('orders/reminders/scan')
  async triggerScan(@Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const role = session?.role || '';
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ ok: false, message: 'forbidden' });
    }
    const result = await this.remindersService.runOnce();
    return res.json({ ok: true, ...result });
  }

  /**
   * 手动触发一次订单节点超时扫描（仅 admin/owner 可用）。
   * 必须放在 `@Get('orders/:id')` 之前，避免 'scan-node-timeouts' 被路由参数 :id 抢占。
   */
  @Post('orders/scan-node-timeouts')
  async triggerNodeTimeoutScan(@Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    const role = session?.role || '';
    if (role !== 'admin' && role !== 'owner') {
      return res.status(403).json({ ok: false, message: 'forbidden' });
    }
    try {
      const result = await this.remindersService.runOrderNodeTimeoutScan();
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      return res.status(500).json({ ok: false, message: err?.message || 'scan failed' });
    }
  }

  @Get('orders/:id')
  async findOne(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const session = (req as any).session;
    try {
      const order = await this.ordersService.findOne(id, {
        userId: getSessionUserId(req) ||'',
        role: session?.role || '',
      });
      return res.json(order);
    } catch (err: any) {
      const code = err?.status || 404;
      return res.status(code).json({ ok: false, message: err?.message || 'not found' });
    }
  }

  @Patch('orders/:id')
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const userId = getSessionUserId(req) || '';
    const role = session?.role || '';
    try {
      // P0 越权修复 (TC-PERM-023)：sales/academic 只能改自己经手 / 自己已认领 / 池单。
      // 失败一律 404，避免泄漏"订单存在但无权限"信息，与 findOne 的 404 行为一致。
      const canAccess = await this.ordersService.canAccessOrder(id, { userId, role });
      if (!canAccess) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }
      await this.ordersService.update(id, userId, {
        order_status: body?.order_status,
        paid_status: body?.paid_status,
        academic_user_id: body?.academic_user_id,
        service_type: body?.service_type,
        amount: body?.amount,
        remark: body?.remark,
      });
      // 写操作日志：含 order_status 视为 status_change，否则按 UPDATE
      const isStatusChange = body?.order_status !== undefined;
      await this.logSafe({
        userId,
        action: isStatusChange
          ? OPERATION_LOG_ACTIONS.STATUS_CHANGE
          : OPERATION_LOG_ACTIONS.UPDATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER,
        targetId: id,
        detail: {
          order_status: body?.order_status,
          paid_status: body?.paid_status,
          academic_user_id: body?.academic_user_id,
          service_type: body?.service_type,
          amount: body?.amount,
        },
        req,
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
    const actorUserId = getSessionUserId(req) || body?.actorUserId || '';
    const role = session?.role || '';
    try {
      // P0 越权修复：跟进记录必须由有订单可见性的用户提交，否则返 404。
      const canAccess = await this.ordersService.canAccessOrder(id, {
        userId: actorUserId,
        role,
      });
      if (!canAccess) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }
      await this.ordersService.addFollowRecord(id, actorUserId, {
        nodeType: body?.nodeType,
        content: body?.content,
        nextRemindAt: body?.nextRemindAt,
        attachmentUrl: body?.attachmentUrl,
        attachmentName: body?.attachmentName,
      });
      // 写操作日志：订单跟进节点
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.STATUS_CHANGE,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER_FOLLOW,
        targetId: id,
        detail: {
          orderId: id,
          nodeType: body?.nodeType,
          content: body?.content,
          nextRemindAt: body?.nextRemindAt,
        },
        req,
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

  // =====================================================================
  // §11.1 / 文档 1.2 订单交接状态机路由
  // GET    /api/orders/:id/handover           - 查交接状态
  // POST   /api/orders/:id/handover/hand-over  - 销售主动发起交接（pending → handed_over）
  // POST   /api/orders/:id/handover/accept     - 教务接单（→ accepted，orderStatus 推 in_progress）
  // POST   /api/orders/:id/handover/reject     - 教务拒收（→ rejected，必传 reason）
  // =====================================================================

  @Get('orders/:id/handover')
  async getHandover(@Param('id') id: string, @Res() res: Response) {
    try {
      const data = await this.ordersService.getHandoverStatus(id);
      return res.json({ ok: true, ...data });
    } catch (err: any) {
      const code = err?.status || 404;
      return res.status(code).json({ ok: false, message: err?.message || 'not found' });
    }
  }

  @Post('orders/:id/handover/hand-over')
  async handoverHandOver(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || '';
    if (!actorUserId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      await this.ordersService.handOver(id, actorUserId);
      // 写操作日志：销售主动发起交接
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.HANDOVER,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER,
        targetId: id,
        detail: { step: 'hand-over' },
        req,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  @Post('orders/:id/handover/accept')
  async handoverAccept(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || '';
    if (!actorUserId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      await this.ordersService.acceptHandover(id, actorUserId);
      // 写操作日志：教务接单
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.HANDOVER,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER,
        targetId: id,
        detail: { step: 'accept' },
        req,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  @Post('orders/:id/handover/reject')
  async handoverReject(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actorUserId = getSessionUserId(req) || '';
    if (!actorUserId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      await this.ordersService.rejectHandover(id, actorUserId, body?.reason);
      // 写操作日志：教务拒收
      await this.logSafe({
        userId: actorUserId,
        action: OPERATION_LOG_ACTIONS.HANDOVER,
        targetType: OPERATION_LOG_TARGET_TYPES.ORDER,
        targetId: id,
        detail: { step: 'reject', reason: body?.reason || null },
        req,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  /**
   * 创建订单异常反馈（独立于 follow_records 的节点）。
   * 教务 / 主管可创建；创建时驱动 orders.orderStatus = 'abnormal'。
   */
  @Post('orders/:id/abnormal-feedback')
  async createAbnormalFeedback(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actor = {
      userId: getSessionUserId(req) ||body?.actorUserId || '',
      role: session?.role || body?.actorRole || '',
    };
    if (!actor.userId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      // P0 越权修复：异常反馈提交人也必须有订单可见性；
      // 具体的写权限（学术 / 销售 / 主管）由 abnormalFeedbackService.canWrite 二次校验。
      const canAccess = await this.ordersService.canAccessOrder(id, actor);
      if (!canAccess) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }
      const result = await this.abnormalFeedbackService.create(id, actor, {
        abnormalType: body?.abnormalType,
        description: body?.description,
        expectedHelper: body?.expectedHelper,
      });
      // 写操作日志：异常反馈创建
      await this.logSafe({
        userId: actor.userId,
        action: OPERATION_LOG_ACTIONS.ABNORMAL_CREATE,
        targetType: OPERATION_LOG_TARGET_TYPES.ABNORMAL_FEEDBACK,
        targetId: result.id,
        detail: {
          orderId: id,
          abnormalType: body?.abnormalType,
          expectedHelper: body?.expectedHelper,
        },
        req,
      });
      return res.json({ ok: true, ...result });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }

  /**
   * 列出订单的全部异常反馈。
   * 权限：销售仅自己经手的订单可见；教务对自己已认领 + 池单可见；admin/owner 全可见。
   */
  @Get('orders/:id/abnormal-feedback')
  async listAbnormalFeedback(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actor = {
      userId: getSessionUserId(req) ||'',
      role: session?.role || '',
    };
    if (!actor.userId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      const items = await this.abnormalFeedbackService.findByOrder(id, actor);
      return res.json({ items, total: items.length });
    } catch (err: any) {
      const code = err?.status || 404;
      return res.status(code).json({ ok: false, message: err?.message || 'not found' });
    }
  }

  /**
   * 关闭 / 标记处理中 一条异常反馈。
   * 关闭后回退 orders.orderStatus 到 in_progress / to_receive，并通知所有相关方。
   */
  @Patch('orders/:id/abnormal-feedback/:feedbackId/close')
  async closeAbnormalFeedback(
    @Param('id') id: string,
    @Param('feedbackId') feedbackId: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const session = (req as any).session;
    const actor = {
      userId: getSessionUserId(req) ||body?.actorUserId || '',
      role: session?.role || body?.actorRole || '',
    };
    if (!actor.userId) {
      return res.status(401).json({ ok: false, message: 'unauthenticated' });
    }
    try {
      // P0 越权修复：关闭 / 处理中 操作人也必须有订单可见性；
      // 具体的关闭权限（创建人 / 主管 / 教务管理员）由 abnormalFeedbackService.canClose 二次校验。
      const canAccess = await this.ordersService.canAccessOrder(id, actor);
      if (!canAccess) {
        return res.status(404).json({ ok: false, message: 'not found' });
      }
      await this.abnormalFeedbackService.close(id, feedbackId, actor, {
        closeNote: body?.closeNote,
        status: body?.status,
      });
      // 写操作日志：异常反馈关闭/处理中
      await this.logSafe({
        userId: actor.userId,
        action: OPERATION_LOG_ACTIONS.ABNORMAL_CLOSE,
        targetType: OPERATION_LOG_TARGET_TYPES.ABNORMAL_FEEDBACK,
        targetId: feedbackId,
        detail: {
          orderId: id,
          status: body?.status || 'closed',
        },
        req,
      });
      return res.json({ ok: true });
    } catch (err: any) {
      const code = err?.status || 422;
      return res.status(code).json({ ok: false, message: err?.message || 'invalid' });
    }
  }
}
