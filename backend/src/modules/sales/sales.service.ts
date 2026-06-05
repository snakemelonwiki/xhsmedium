import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { todayString } from '../../shared/utils/date-utils';
import { OrdersService } from '../orders/orders.service';
import { LeadsService } from '../leads/leads.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly leadsService: LeadsService,
  ) {}

  /**
   * 销售首页六宫格数据。
   * - newAssigned: 今日新分配客资数
   * - pendingAdd: 待添加微信
   * - notPassed: 未通过（跟进中状态）
   * - todayPending: 今日待跟进
   * - orderPending: 订单待交接
   * - dealDone: 今日成交
   *
   * v1.3 / CROSS-1 联动：所有 lead 查询都加 WHERE is_dispatched = 0
   */
  async getHomeSummary(salesUserId: string): Promise<{
    newAssigned: number;
    pendingAdd: number;
    notPassed: number;
    todayPending: number;
    orderPending: number;
    dealDone: number;
  }> {
    const today = todayString();

    // v1.3 / SA-11 P0 修复：销售端首页六宫格中所有 lead 侧统计也排除 deal_done / refunded，
    //   与「我的客资」列表保持口径一致——已成交/已退款的客资属于「我的成交」侧，不计入"待跟进"维度。
    //   orderPending / dealDone 走 orders 表（来源独立），不受此约束。
    // 注意: 整个条件用括号包成一个 OR 表达式,避免 AND/OR 优先级错配后被前面的 is_dispatched
    //   之外的字段"绕过"。
    const leadNotClosed = "(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))";

    const [
      newAssigned,
      pendingAdd,
      notPassed,
      todayPending,
      orderPending,
      dealDone,
    ] = await Promise.all([
      // 今日新分配客资数（assigned_sales_user_id = 当前销售，is_dispatched = 0，且非已成交/已退款）
      this.leadRepo.createQueryBuilder('l')
        .where('DATE(l.created_at) = :today', { today })
        .andWhere('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.is_dispatched = 0')
        .andWhere(leadNotClosed)
        .getCount(),
      // 待添加微信（add_status = 'not_added'，且非已成交/已退款）
      this.leadRepo.createQueryBuilder('l')
        .where('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.is_dispatched = 0')
        .andWhere('l.add_status = :addStatus', { addStatus: 'not_added' })
        .andWhere(leadNotClosed)
        .getCount(),
      // 未通过（跟进中状态，process_status = 'following_up'，且非已成交/已退款）
      this.leadRepo.createQueryBuilder('l')
        .where('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.is_dispatched = 0')
        .andWhere('l.process_status = :processStatus', { processStatus: 'following_up' })
        .andWhere(leadNotClosed)
        .getCount(),
      // 今日待跟进（创建日期为今天，assigned_sales_user_id = 当前销售，且非已成交/已退款）
      this.leadRepo.createQueryBuilder('l')
        .where('DATE(l.created_at) = :today', { today })
        .andWhere('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.is_dispatched = 0')
        .andWhere(leadNotClosed)
        .getCount(),
      // 订单待交接（handover_status = 'pending' 或 'handed_over'，且 sales_user_id = 当前销售）
      this.orderRepo.createQueryBuilder('o')
        .where('o.sales_user_id = :salesUserId', { salesUserId })
        .andWhere('o.handover_status IN (:...statuses)', { statuses: ['pending', 'handed_over'] })
        .getCount(),
      // 今日成交（订单创建日期为今天）
      this.orderRepo.createQueryBuilder('o')
        .where('DATE(o.created_at) = :today', { today })
        .andWhere('o.sales_user_id = :salesUserId', { salesUserId })
        .getCount(),
    ]);

    return {
      newAssigned: Number(newAssigned),
      pendingAdd: Number(pendingAdd),
      notPassed: Number(notPassed),
      todayPending: Number(todayPending),
      orderPending: Number(orderPending),
      dealDone: Number(dealDone),
    };
  }

  /**
   * v1.3 / SA-6: 销售端"今天分配给我但 add_status=not_added"的客资列表。
   * 用于"今日未添加"红标置顶数据源。
   */
  async listTodayNotAdded(salesUserId: string, limit: number, offset: number) {
    return this.leadsService.findTodayNotAdded(salesUserId, limit, offset);
  }

  /**
   * v1.3 / SA-11: 销售端"当日待跟进"列表（今日需要跟进的客资）。
   * next_follow_time ≤ 今天 23:59:59 且 process_status NOT IN (invalid, deal_done)。
   */
  async listTodayFollowupsForSales(salesUserId: string, limit: number, offset: number) {
    return this.leadsService.findTodayFollowupsForSales(salesUserId, limit, offset);
  }

  /**
   * v1.3 / SA-7: 销售"我的成交"列表，委托给 OrdersService。
   */
  async listMyDeals(salesUserId: string, options: {
    status?: string;
    productType?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }) {
    return this.ordersService.listMyDeals(salesUserId, options);
  }

  /**
   * v1.3 / SA-8 + SA-9: 销售"成交"入口。直接调用 closeDeal 落 orders / order_finance / order_follow_records。
   */
  async closeDeal(leadId: string, salesUserId: string, body: any) {
    if (!leadId) throw new BadRequestException('leadId required');
    if (!salesUserId) throw new BadRequestException('salesUserId required');
    // 校验 lead 存在且归属于当前销售（复用 leadsService.canAccessLead 规则）
    const canAccess = await this.leadsService.canAccessLead(leadId, {
      actorUserId: salesUserId,
      actorRole: 'sales',
    });
    if (!canAccess) {
      throw new NotFoundException('lead not found');
    }
    return this.ordersService.closeDeal(leadId, salesUserId, {
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
  }
}
