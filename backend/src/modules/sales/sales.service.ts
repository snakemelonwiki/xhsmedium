import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { todayString } from '../../shared/utils/date-utils';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Lead) private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  /**
   * 销售首页六宫格数据。
   * - newAssigned: 今日新分配客资数
   * - pendingAdd: 待添加微信
   * - notPassed: 未通过（跟进中状态）
   * - todayPending: 今日待跟进
   * - orderPending: 订单待交接
   * - dealDone: 今日成交
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

    const [
      newAssigned,
      pendingAdd,
      notPassed,
      todayPending,
      orderPending,
      dealDone,
    ] = await Promise.all([
      // 今日新分配客资数（assigned_sales_user_id = 当前销售）
      this.leadRepo.createQueryBuilder('l')
        .where('DATE(l.created_at) = :today', { today })
        .andWhere('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .getCount(),
      // 待添加微信（add_status = 'not_added'）
      this.leadRepo.createQueryBuilder('l')
        .where('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.add_status = :addStatus', { addStatus: 'not_added' })
        .getCount(),
      // 未通过（跟进中状态，process_status = 'following_up'）
      this.leadRepo.createQueryBuilder('l')
        .where('l.assigned_sales_user_id = :salesUserId', { salesUserId })
        .andWhere('l.process_status = :processStatus', { processStatus: 'following_up' })
        .getCount(),
      // 今日待跟进（创建日期为今天，assigned_sales_user_id = 当前销售）
      this.leadRepo.createQueryBuilder('l')
        .where('DATE(l.created_at) = :today', { today })
        .andWhere('l.assigned_sales_user_id = :salesUserId', { salesUserId })
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
}
