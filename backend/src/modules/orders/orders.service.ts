import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Order } from '../../entities/order.entity';
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

interface CloseDealDto {
  serviceType?: string | null;
  amount?: number | string | null;
  remark?: string | null;
}

interface ListOrdersOptions {
  role?: string;
  status?: string;
  scope?: string;
  currentUserId?: string;
  sessionRole?: string;
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

    if (options.status) {
      qb.andWhere('o.order_status = :status', { status: options.status });
    }

    const isAdminLike = options.sessionRole === 'admin' || options.sessionRole === 'owner';

    if (options.role === 'academic') {
      if (options.scope === 'all' && isAdminLike) {
        // no extra filter
      } else {
        // default: mine — restrict to academic_user_id = current user
        if (!options.currentUserId) {
          return [];
        }
        qb.andWhere('o.academic_user_id = :uid', { uid: options.currentUserId });
      }
    } else if (!isAdminLike) {
      // non-admin without role=academic: default to records they sold
      if (options.currentUserId) {
        qb.andWhere(
          '(o.sales_user_id = :uid OR o.academic_user_id = :uid)',
          { uid: options.currentUserId },
        );
      } else {
        return [];
      }
    }

    const rows = await qb.getMany();
    return rows.map((r) => this.mapOrder(r));
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

    if (options.status) {
      qb.andWhere('o.order_status = :status', { status: options.status });
    }

    const isAdminLike = options.sessionRole === 'admin' || options.sessionRole === 'owner';

    if (options.role === 'academic') {
      if (options.scope === 'all' && isAdminLike) {
        // no extra filter
      } else {
        if (!options.currentUserId) {
          return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
        }
        qb.andWhere('o.academic_user_id = :uid', { uid: options.currentUserId });
      }
    } else if (!isAdminLike) {
      if (options.currentUserId) {
        qb.andWhere(
          '(o.sales_user_id = :uid OR o.academic_user_id = :uid)',
          { uid: options.currentUserId },
        );
      } else {
        return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
      }
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

  async findOne(id: string): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
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
  }

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
