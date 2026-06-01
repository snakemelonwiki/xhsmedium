import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Order, HANDOVER_STATUS_CODES, HandoverStatusCode } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

type PaidStatus = 'unpaid' | 'partial' | 'paid';
type OrderStatus =
  | 'to_receive'
  | 'in_progress'
  | 'awaiting_client_info'
  | 'awaiting_teacher'
  | 'to_deliver'
  | 'completed'
  | 'abnormal';

const ALLOWED_PAID: PaidStatus[] = ['unpaid', 'partial', 'paid'];
const ALLOWED_ORDER_STATUS: OrderStatus[] = [
  'to_receive',
  'in_progress',
  'awaiting_client_info',
  'awaiting_teacher',
  'to_deliver',
  'completed',
  'abnormal',
];
const ALLOWED_HANDOVER_STATUS: HandoverStatusCode[] = [...HANDOVER_STATUS_CODES];

interface CloseDealDto {
  serviceType?: string | null;
  amount?: number | string | null;
  remark?: string | null;
}

interface ListOrdersOptions {
  role?: string;
  status?: string;
  handoverStatus?: string;
  scope?: string;
  currentUserId?: string;
  sessionRole?: string;
  // 1.2 搜索/筛选 — 模糊搜索 + 条件搜索
  keyword?: string;
  paidStatus?: string;
  salesId?: string;
  academicAdminId?: string;
  serviceType?: string;
  startDate?: string;
  endDate?: string;
}

interface OrderPatchDto {
  order_status?: OrderStatus;
  paid_status?: PaidStatus;
  academic_user_id?: string | null;
  service_type?: string | null;
  amount?: number | string | null;
  remark?: string | null;
}

interface OrderFollowDto {
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | Date | null;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderFollowRecord)
    private readonly orderFollowRepository: Repository<OrderFollowRecord>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Sales marks a lead as deal-closed and spawns a new order in a single transaction.
   */
  async closeDeal(leadId: string, salesUserId: string, dto: CloseDealDto): Promise<string> {
    if (!salesUserId) {
      throw new BadRequestException('sales user required');
    }
    const orderId = makeId();
    let leadContact = '';
    await this.dataSource.transaction(async (manager) => {
      const lead = await manager.findOne(Lead, { where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException('lead not found');
      }
      leadContact = lead.contactInfo || '';
      await manager.update(Lead, { id: leadId }, { status: 'deal_closed' });
      await manager.insert(Order, {
        id: orderId,
        leadId,
        salesUserId,
        academicUserId: null,
        serviceType: dto.serviceType ?? null,
        amount: dto.amount != null && dto.amount !== '' ? String(dto.amount) : null,
        paidStatus: 'unpaid',
        orderStatus: 'to_receive',
        handoverStatus: 'handed_over',
        remark: dto.remark ?? null,
      });
    });

    // §11.1 deal_closed: 通知教务 / 主管。
    // 简化版：通知所有 academic / admin / owner 角色的用户。
    try {
      const receivers = await this.userRepository.find({
        where: { role: In(['academic', 'admin', 'owner']) as any },
        select: { id: true },
      });
      const ids = receivers.map((u) => u.id).filter((id) => id && id !== salesUserId);
      if (ids.length > 0) {
        await this.notificationsService.create({
          receiverIds: ids,
          senderId: salesUserId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '新订单已成交',
          content: `客资 ${leadContact} 已成交，请尽快接单`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[orders] notify deal_closed failed', err?.message || err);
    }

    return orderId;
  }

  async list(options: ListOrdersOptions): Promise<any[]> {
    const qb = this.orderRepository.createQueryBuilder('o').orderBy('o.created_at', 'DESC');
    this.applyOrderFilters(qb, options);

    this.applyOrdersScope(qb, options);
    if ((qb as any)._earlyReturnEmpty) return [];

    const rows = await qb.getMany();
    return rows.map((r) => this.mapOrder(r));
  }

  /**
   * 1.2 订单搜索/筛选：模糊搜索（订单号/客资联系方式）+ 条件搜索（付款/销售/教务/服务类型/时间）。
   * 注意：实体列名是 snake_case（o.sales_user_id / o.academic_user_id / o.paid_status 等），
   * 与 camelCase 属性不同；QueryBuilder 引用必须用数据库列名。
   */
  private applyOrderFilters(qb: any, options: ListOrdersOptions): void {
    if (options.status) {
      qb.andWhere('o.order_status = :status', { status: options.status });
    }

    if (
      options.handoverStatus &&
      ALLOWED_HANDOVER_STATUS.includes(options.handoverStatus as HandoverStatusCode)
    ) {
      qb.andWhere('o.handover_status = :handoverStatus', {
        handoverStatus: options.handoverStatus,
      });
    }

    if (options.paidStatus && ALLOWED_PAID.includes(options.paidStatus as PaidStatus)) {
      qb.andWhere('o.paid_status = :paidStatus', { paidStatus: options.paidStatus });
    }

    if (options.salesId) {
      qb.andWhere('o.sales_user_id = :salesId', { salesId: options.salesId });
    }

    if (options.academicAdminId) {
      qb.andWhere('o.academic_user_id = :academicAdminId', {
        academicAdminId: options.academicAdminId,
      });
    }

    if (options.serviceType) {
      qb.andWhere('o.service_type = :serviceType', { serviceType: options.serviceType });
    }

    if (options.startDate) {
      qb.andWhere('o.created_at >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      qb.andWhere('o.created_at <= :endDate', { endDate: options.endDate });
    }

    // 模糊搜索：订单号（o.id）+ 关联客资的联系方式/昵称。
    // 用 EXISTS 关联 leads 表（已有 idx_orders_lead_id 索引），避免改变主查询结构。
    const kw = options.keyword && options.keyword.trim();
    if (kw) {
      const like = `%${kw}%`;
      qb.andWhere(
        `(o.id LIKE :kw OR EXISTS (SELECT 1 FROM leads l WHERE l.id = o.lead_id AND (l.contact_info LIKE :kw OR l.nickname LIKE :kw)))`,
        { kw: like },
      );
    }
  }

  /**
   * 统一的订单可见性过滤，list/listPaged 共用，避免两处分支漂移：
   * - admin/owner：scope=all 看全量；其他 scope 仍受限于自己的销售/教务身份
   * - role=academic + scope=pool          → 只看池单（academic_user_id IS NULL）
   * - role=academic + scope=academic/mine → 池单 + 已分配给自己的单（默认教务端视角）
   * - role=academic + scope=assigned      → 仅已分配给自己的单
   * - role=sales 等其他角色               → 仅自己经手的销售/教务订单
   */
  private applyOrdersScope(qb: any, options: ListOrdersOptions): void {
    const isAdminLike = options.sessionRole === 'admin' || options.sessionRole === 'owner';

    if (isAdminLike && (options.scope === 'all' || !options.scope)) {
      return;
    }

    if (options.role === 'academic' || options.sessionRole === 'academic') {
      if (options.scope === 'pool') {
        qb.andWhere('o.academic_user_id IS NULL');
        return;
      }
      if (options.scope === 'assigned' || options.scope === 'mine') {
        if (!options.currentUserId) { qb._earlyReturnEmpty = true; return; }
        qb.andWhere('o.academic_user_id = :uid', { uid: options.currentUserId });
        return;
      }
      // 默认教务视角（scope=academic 或未传）：池单 + 自己已认领
      if (!options.currentUserId) {
        qb.andWhere('o.academic_user_id IS NULL');
        return;
      }
      qb.andWhere(
        '(o.academic_user_id IS NULL OR o.academic_user_id = :uid)',
        { uid: options.currentUserId },
      );
      return;
    }

    // 销售或未知角色：只看自己经手的销售/教务订单
    if (!options.currentUserId) { qb._earlyReturnEmpty = true; return; }
    qb.andWhere(
      '(o.sales_user_id = :uid OR o.academic_user_id = :uid)',
      { uid: options.currentUserId },
    );
  }

  // §9 / AC-10.2 订单列表分页
  // 控制器拿到 limit/offset 时改走 *Paged 版本，统一返回 { items, total, limit, offset }；
  // 无分页参数时仍走上面老接口（直接返回数组），保持前端兼容。
  // 业务过滤（role/scope/status）逻辑与 list() 完全一致，只在末尾包了分页 + count。
  async listPaged(
    options: ListOrdersOptions & { limit: number; offset: number },
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);

    const qb = this.orderRepository.createQueryBuilder('o').orderBy('o.created_at', 'DESC');
    this.applyOrderFilters(qb, options);

    this.applyOrdersScope(qb, options);
    if ((qb as any)._earlyReturnEmpty) {
      return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
    }

    qb.skip(safeOffset).take(safeLimit);
    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((r) => this.mapOrder(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async findOne(
    id: string,
    actor?: { userId?: string; role?: string },
  ): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (actor) {
      const role = actor.role || '';
      const uid = actor.userId || '';
      const isAdminLike = role === 'admin' || role === 'owner';
      if (!isAdminLike) {
        const canSee =
          (role === 'sales' && order.salesUserId === uid) ||
          (role === 'academic' && (order.academicUserId === uid || order.academicUserId == null)) ||
          (order.salesUserId === uid || order.academicUserId === uid);
        if (!canSee) {
          // 不暴露 "存在但无权限"；与不存在一致返回 404
          throw new NotFoundException('order not found');
        }
      }
    }
    const followRecords = await this.orderFollowRepository.find({
      where: { orderId: id },
      order: { createdAt: 'DESC' },
    });
    return {
      ...this.mapOrder(order),
      followRecords: followRecords.map((r) => this.mapFollowRecord(r)),
    };
  }

  async update(id: string, dto: OrderPatchDto): Promise<void> {
    const current = await this.orderRepository.findOne({ where: { id } });
    if (!current) {
      throw new NotFoundException('order not found');
    }
    const next: Partial<Order> = {};
    if (dto.order_status !== undefined) {
      if (!ALLOWED_ORDER_STATUS.includes(dto.order_status)) {
        throw new BadRequestException('invalid order_status');
      }
      next.orderStatus = dto.order_status;
    }
    if (dto.paid_status !== undefined) {
      if (!ALLOWED_PAID.includes(dto.paid_status)) {
        throw new BadRequestException('invalid paid_status');
      }
      next.paidStatus = dto.paid_status;
    }
    if (dto.academic_user_id !== undefined) {
      next.academicUserId = dto.academic_user_id || null;
    }
    if (dto.service_type !== undefined) {
      next.serviceType = dto.service_type || null;
    }
    if (dto.amount !== undefined) {
      next.amount = dto.amount != null && dto.amount !== '' ? String(dto.amount) : null;
    }
    if (dto.remark !== undefined) {
      next.remark = dto.remark || null;
    }
    if (Object.keys(next).length === 0) return;
    await this.orderRepository.update(id, next);
  }

  async addFollowRecord(
    orderId: string,
    actorUserId: string,
    dto: OrderFollowDto,
  ): Promise<void> {
    if (!dto.nodeType || !dto.nodeType.trim()) {
      throw new BadRequestException('nodeType required');
    }
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const nodeType = dto.nodeType.trim();
    await this.orderFollowRepository.save({
      id: makeId(),
      orderId,
      userId: actorUserId,
      nodeType,
      content: dto.content ? String(dto.content).trim() : null,
      nextRemindAt: dto.nextRemindAt ? new Date(dto.nextRemindAt) : null,
    });

    // §11.1 order_abnormal: 订单跟进出现异常节点，回写给销售。
    if (nodeType.includes('异常') && order.salesUserId && order.salesUserId !== actorUserId) {
      await this.notificationsService.create({
        receiverIds: [order.salesUserId],
        senderId: actorUserId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
        title: '订单异常',
        content: dto.content
          ? `订单跟进异常: ${String(dto.content).trim()}`
          : `订单跟进异常 (${nodeType})`,
        relatedId: orderId,
        relatedType: 'order',
      });
    }

    // 文档 1.2：教务添加「已接收 / 签收」类节点 → 自动转 accepted。
    // 用稳定的内部关键字判断，避免误触发："received" / "已接收" / "已签收"。
    const isReceivedNode =
      /^received$/i.test(nodeType) ||
      nodeType === '已接收' ||
      nodeType === '已签收';
    if (isReceivedNode && order.handoverStatus !== 'accepted') {
      try {
        await this.acceptHandover(orderId, actorUserId, { silent: true });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] auto acceptHandover failed', err?.message || err);
      }
    }
  }

  // =====================================================================
  // §11.1 / 文档 1.2 订单交接状态机 (handover_status)
  // 状态: pending → handed_over → accepted (履约) | rejected
  // 写入 operation_logs + 通知相关方（销售/教务）。
  // 不动现有 orderStatus 字段（保持向后兼容），只在校验为 pending/handed_over
  // 的订单上推进到 accepted 时同步把 orderStatus 从 to_receive 推到 in_progress。
  // =====================================================================

  async getHandoverStatus(id: string): Promise<{
    orderId: string;
    handoverStatus: HandoverStatusCode;
    orderStatus: OrderStatus;
    academicUserId: string | null;
    salesUserId: string;
  }> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    return {
      orderId: order.id,
      handoverStatus: order.handoverStatus,
      orderStatus: order.orderStatus,
      academicUserId: order.academicUserId,
      salesUserId: order.salesUserId,
    };
  }

  /**
   * 销售成交 / 主动发起交接：pending → handed_over。
   * closeDeal 内部已自动设 'handed_over'，本方法主要是暴露给前端按钮调用。
   */
  async handOver(orderId: string, actorUserId: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    if (order.handoverStatus === 'handed_over') {
      // 幂等：已经交接过的订单直接返回，避免重复通知。
      return;
    }
    if (order.handoverStatus !== 'pending') {
      throw new BadRequestException(
        `cannot hand over from current status: ${order.handoverStatus}`,
      );
    }

    await this.orderRepository.update(orderId, { handoverStatus: 'handed_over' });
    // 操作日志由 controller 层 OperationLogsService 写入（action=HANDOVER, step=hand-over），
    // service 层只负责业务状态翻转，避免双写。

    // 通知所有教务/主管：有新订单待接收。
    try {
      const receivers = await this.userRepository.find({
        where: { role: In(['academic', 'admin', 'owner']) as any },
        select: { id: true },
      });
      const ids = receivers.map((u) => u.id).filter((id) => id && id !== actorUserId);
      if (ids.length > 0) {
        await this.notificationsService.create({
          receiverIds: ids,
          senderId: actorUserId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '订单待接收',
          content: `订单 ${orderId} 已交接，请尽快接单`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[orders] notify hand_over failed', err?.message || err);
    }
  }

  /**
   * 教务接单：pending/handed_over → accepted，同时 orderStatus: to_receive → in_progress。
   * silent=true 用于内部自动触发（addFollowRecord 'received' 节点），不重复写日志。
   */
  async acceptHandover(
    orderId: string,
    actorUserId: string,
    opts: { silent?: boolean } = {},
  ): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    if (order.handoverStatus === 'accepted') {
      return; // 幂等
    }
    if (order.handoverStatus === 'rejected') {
      throw new BadRequestException('order has been rejected, cannot accept');
    }

    const nextOrderStatus: OrderStatus = order.orderStatus === 'to_receive' ? 'in_progress' : order.orderStatus;
    await this.orderRepository.update(orderId, {
      handoverStatus: 'accepted',
      orderStatus: nextOrderStatus,
    });

    if (!opts.silent) {
      // 操作日志由 controller 层 OperationLogsService 写入。
    } else {
      // 内部自动触发：日志由 controller 层 addFollowRecord 路径覆盖（STATUS_CHANGE）。
    }

    // 通知销售：教务已接单。
    if (order.salesUserId && order.salesUserId !== actorUserId) {
      try {
        await this.notificationsService.create({
          receiverIds: [order.salesUserId],
          senderId: actorUserId,
          portType: 'sales',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '订单已被接收',
          content: `订单 ${orderId} 已被教务接单，进入履约阶段`,
          relatedId: orderId,
          relatedType: 'order',
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] notify accept failed', err?.message || err);
      }
    }
  }

  /**
   * 教务拒收：pending/handed_over → rejected。必须传 reason，写 operation_logs。
   * 拒收后通知销售。
   */
  async rejectHandover(orderId: string, actorUserId: string, reason: string): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) {
      throw new BadRequestException('reason required for rejecting handover');
    }
    if (order.handoverStatus === 'rejected') {
      return; // 幂等
    }
    if (order.handoverStatus === 'accepted') {
      throw new BadRequestException('order already accepted, cannot reject');
    }

    await this.orderRepository.update(orderId, { handoverStatus: 'rejected' });
    // 操作日志由 controller 层 OperationLogsService 写入（action=HANDOVER, step=reject, reason=...）。

    if (order.salesUserId && order.salesUserId !== actorUserId) {
      try {
        await this.notificationsService.create({
          receiverIds: [order.salesUserId],
          senderId: actorUserId,
          portType: 'sales',
          typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
          title: '订单被拒收',
          content: `订单 ${orderId} 被拒收：${trimmedReason}`,
          relatedId: orderId,
          relatedType: 'order',
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] notify reject failed', err?.message || err);
      }
    }
  }

  // 注：交接状态变更日志统一由 controller 层 OperationLogsService 写入，
  //   不再在 service 层直接落库，避免依赖 OperationLogRepository。

  async listFollowRecords(
    orderId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit as number);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.orderFollowRepository.findAndCount({
      where: { orderId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return {
      items: rows.map((r) => this.mapFollowRecord(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private mapOrder(row: Order): any {
    return {
      id: row.id,
      leadId: row.leadId,
      salesUserId: row.salesUserId,
      academicUserId: row.academicUserId,
      serviceType: row.serviceType,
      amount: row.amount,
      paidStatus: row.paidStatus,
      orderStatus: row.orderStatus,
      handoverStatus: row.handoverStatus,
      remark: row.remark,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapFollowRecord(row: OrderFollowRecord): any {
    return {
      id: row.id,
      orderId: row.orderId,
      userId: row.userId,
      nodeType: row.nodeType,
      content: row.content,
      nextRemindAt: row.nextRemindAt,
      createdAt: row.createdAt,
    };
  }
}
