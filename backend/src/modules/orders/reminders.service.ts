import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, Repository, In } from 'typeorm';

import { Order } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { User } from '../../entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

/** 订单节点超时阈值（毫秒），默认 7 天 */
const NODE_TIMEOUT_MS = 7 * 24 * 3600 * 1000;
/** 扫描单轮上限 */
const SCAN_BATCH = 200;

/**
 * 节点提醒扫描器：每分钟扫描 order_follow_records.next_remind_at <= NOW
 * 且 reminder_sent_at IS NULL 的记录，向跟进人 + 订单当前教务发 ORDER_NODE_DUE 通知；
 * 发送成功后写 reminder_sent_at，保证幂等。
 */
@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);
  private running = false;
  private nodeTimeoutRunning = false;
  /** key=orderId, value=lastSentAt（内存缓存，7 天内不重复发） */
  private readonly recentlyNotified = new Map<string, Date>();

  constructor(
    @InjectRepository(OrderFollowRecord)
    private readonly followRepo: Repository<OrderFollowRecord>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly notifications: NotificationsService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'orderNodeReminderScan' })
  async scanDue(): Promise<void> {
    if (this.running) {
      // 上一轮还没跑完（或卡死），跳过避免堆积
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (err: any) {
      this.logger.error(`reminder scan failed: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * 单轮扫描：拉出到期未发的提醒（限 100 条防止单次跑过久），逐条发通知 + 标记。
   * 暴露 public 让管理端可手动 trigger（用作回归测试入口）。
   */
  async runOnce(): Promise<{ scanned: number; sent: number; failed: number }> {
    const now = new Date();
    const dueList = await this.followRepo.find({
      where: {
        nextRemindAt: LessThanOrEqual(now),
        reminderSentAt: IsNull(),
      },
      order: { nextRemindAt: 'ASC' },
      take: 100,
    });
    if (!dueList.length) {
      return { scanned: 0, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;
    // 一次性把涉及的订单批量取出来，避免 N+1
    const orderIds = Array.from(new Set(dueList.map((r) => r.orderId).filter(Boolean)));
    const orders = orderIds.length
      ? await this.orderRepo.find({ where: orderIds.map((id) => ({ id })) })
      : [];
    const orderMap = new Map(orders.map((o) => [o.id, o]));

    for (const record of dueList) {
      try {
        const order = orderMap.get(record.orderId);
        // 接收者去重：跟进人 + 当前教务（若不同）+ 销售。
        // N-P1-07 修复：销售（order.sales_user_id）也需要收到节点到期通知，
        // 因为教务节点进度直接影响销售后续交接与回访，spec 明确"销售/主管都收"。
        // 主管（role=admin/owner）暂不抄送：节点到期属例行提醒，主管看板已聚合
        // 所有异常（order_abnormal / supervision_suggestion），无需实时推送避免噪音；
        // 如未来需要再单独开 ORDER_NODE_DUE_SUPERVISOR 类型。
        const receivers = new Set<string>();
        if (record.userId) receivers.add(record.userId);
        if (order?.academicUserId) receivers.add(order.academicUserId);
        if (order?.salesUserId) receivers.add(order.salesUserId);

        await this.notifications.create({
          receiverIds: Array.from(receivers),
          senderId: null,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.ORDER_NODE_DUE,
          title: '订单节点到期',
          content: this.buildContent(record),
          relatedId: record.orderId,
          relatedType: 'order',
        });

        await this.followRepo.update(
          { id: record.id },
          { reminderSentAt: new Date() },
        );
        sent += 1;
      } catch (err: any) {
        failed += 1;
        this.logger.error(
          `reminder send failed (record=${record.id}, order=${record.orderId}): ${err?.message || err}`,
        );
      }
    }

    if (sent > 0 || failed > 0) {
      this.logger.log(`reminder scan: scanned=${dueList.length} sent=${sent} failed=${failed}`);
    }
    return { scanned: dueList.length, sent, failed };
  }

  /**
   * 查询某用户视角的待提醒列表（教务端"节点提醒"页消费）。
   * - upcomingHours: 把未来 N 小时内即将到期的也带回来
   * - 默认只看自己跟进 + 自己名下订单
   */
  async listPending(
    userId: string,
    opts: { upcomingHours?: number; limit?: number } = {},
  ): Promise<any[]> {
    if (!userId) return [];
    const upcomingHours = Math.max(0, Math.min(opts.upcomingHours ?? 24, 24 * 14));
    const limit = Math.max(1, Math.min(opts.limit ?? 50, 200));
    const horizon = new Date(Date.now() + upcomingHours * 3600 * 1000);

    const rows = await this.followRepo
      .createQueryBuilder('fr')
      .leftJoin(Order, 'o', 'o.id = fr.order_id')
      .where('fr.next_remind_at IS NOT NULL')
      .andWhere('fr.next_remind_at <= :horizon', { horizon })
      .andWhere('(fr.user_id = :uid OR o.academic_user_id = :uid)', { uid: userId })
      .orderBy('fr.next_remind_at', 'ASC')
      .limit(limit)
      .select([
        'fr.id AS id',
        'fr.order_id AS orderId',
        'fr.user_id AS userId',
        'fr.node_type AS nodeType',
        'fr.content AS content',
        'fr.next_remind_at AS nextRemindAt',
        'fr.reminder_sent_at AS reminderSentAt',
        'o.service_type AS serviceType',
        'o.order_status AS orderStatus',
      ])
      .getRawMany();

    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      userId: r.userId,
      nodeType: r.nodeType,
      content: r.content,
      nextRemindAt: r.nextRemindAt,
      reminderSentAt: r.reminderSentAt,
      isOverdue: r.nextRemindAt ? new Date(r.nextRemindAt).getTime() <= Date.now() : false,
      serviceType: r.serviceType || null,
      orderStatus: r.orderStatus || null,
    }));
  }

  private buildContent(record: OrderFollowRecord): string {
    const summary = (record.content || '').trim();
    const truncated = summary.length > 60 ? `${summary.slice(0, 60)}…` : summary;
    const prefix = `订单 ${record.orderId} 节点「${record.nodeType}」已到提醒时间`;
    return truncated ? `${prefix}：${truncated}` : prefix;
  }

  // =====================================================================
  // 订单节点超时扫描器
  // 每 30 分钟扫一次：in_progress / awaiting_client_info / awaiting_teacher / to_deliver
  // 且最后一条 follow_record 距今超 7 天（或无 follow_record 且订单创建超 7 天）
  // → 向所有 admin/owner 发 ORDER_NODE_OVERDUE 通知。
  // =====================================================================

  /**
   * 定时调度入口（每 30 分钟）。
   */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'orderNodeTimeoutScan' })
  async scanOrderNodeTimeouts(): Promise<void> {
    if (this.nodeTimeoutRunning) return;
    this.nodeTimeoutRunning = true;
    try {
      await this.runOrderNodeTimeoutScan();
    } catch (err: any) {
      this.logger.error(`order node timeout scan failed: ${err?.message || err}`);
    } finally {
      this.nodeTimeoutRunning = false;
    }
  }

  /**
   * 单轮扫描（暴露 public 给 controller 手动 trigger）。
   */
  async runOrderNodeTimeoutScan(): Promise<{
    scanned: number;
    notified: number;
    skipped: number;
    failed: number;
  }> {
    const now = new Date();
    const threshold = new Date(now.getTime() - NODE_TIMEOUT_MS);

    // 主动清理超过 7 天的缓存记录
    for (const [orderId, sentAt] of this.recentlyNotified.entries()) {
      if (now.getTime() - sentAt.getTime() > NODE_TIMEOUT_MS) {
        this.recentlyNotified.delete(orderId);
      }
    }

    // 候选订单：处于活跃状态，且创建超过 7 天
    const activeStatuses = ['in_progress', 'awaiting_client_info', 'awaiting_teacher', 'to_deliver'];
    const candidateOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.orderStatus IN (:...statuses)', { statuses: activeStatuses })
      .andWhere('o.createdAt < :threshold', { threshold })
      .orderBy('o.createdAt', 'ASC')
      .take(SCAN_BATCH)
      .getMany();

    if (!candidateOrders.length) {
      return { scanned: 0, notified: 0, skipped: 0, failed: 0 };
    }

    const orderIds = candidateOrders.map((o) => o.id);

    // 批量查出每单的最近一条 follow_record
    const lastFollowMap = new Map<string, Date | null>();
    const followRows = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoin(OrderFollowRecord, 'fr', 'fr.order_id = o.id')
      .select('o.id', 'orderId')
      .addSelect('MAX(fr.created_at)', 'lastFollowAt')
      .where('o.id IN (:...ids)', { ids: orderIds })
      .groupBy('o.id')
      .getRawMany();

    for (const row of followRows) {
      lastFollowMap.set(row.orderId, row.lastFollowAt ? new Date(row.lastFollowAt) : null);
    }

    // 收集所有 admin/owner 的 receiverIds
    const admins = await this.userRepo.find({
      where: { role: In(['admin', 'owner']) },
      select: { id: true },
    });
    const receiverIds = admins.map((u) => u.id);
    if (!receiverIds.length) {
      return { scanned: 0, notified: 0, skipped: 0, failed: 0 };
    }

    let notified = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of candidateOrders) {
      // 幂等：7 天内已发过，跳过
      const lastSent = this.recentlyNotified.get(order.id);
      if (lastSent && now.getTime() - lastSent.getTime() < NODE_TIMEOUT_MS) {
        skipped += 1;
        continue;
      }

      // 判断超时：最后跟进超过 7 天，或无跟进记录
      const lastFollowAt = lastFollowMap.get(order.id);
      const isOverdue =
        (lastFollowAt === null && order.createdAt < threshold) ||
        (lastFollowAt !== null && lastFollowAt < threshold);

      if (!isOverdue) {
        skipped += 1;
        continue;
      }

      // 发通知
      const daysSinceLastFollow = lastFollowAt
        ? Math.floor((now.getTime() - lastFollowAt.getTime()) / (24 * 3600 * 1000))
        : Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / (24 * 3600 * 1000));

      try {
        await this.notifications.create({
          receiverIds,
          senderId: null,
          portType: 'operations',
          typeCode: NOTIFICATION_TYPES.ORDER_NODE_OVERDUE,
          title: '订单节点超时',
          content: `订单 ${order.id} 已 ${daysSinceLastFollow} 天无进展，请关注`,
          relatedId: order.id,
          relatedType: 'order',
        });

        // 记录已发送
        this.recentlyNotified.set(order.id, now);
        notified += 1;

        // 写操作日志（system 触发）—— 暂时注释掉定时写数据进去
        // try {
        //   await this.operationLogs.log({
        //     userId: 'system',
        //     action: 'status_change',
        //     targetType: 'order',
        //     targetId: order.id,
        //     detail: `节点超时通知 (${daysSinceLastFollow} 天无进展)`,
        //   });
        // } catch (logErr: any) {
        //   this.logger.warn(
        //     `order node timeout log failed (order=${order.id}): ${logErr?.message || logErr}`,
        //   );
        // }
      } catch (err: any) {
        failed += 1;
        this.logger.error(
          `order node overdue notify failed (order=${order.id}): ${err?.message || err}`,
        );
      }
    }

    if (notified > 0 || failed > 0) {
      this.logger.log(
        `order node timeout scan: scanned=${candidateOrders.length} notified=${notified} skipped=${skipped} failed=${failed}`,
      );
    }
    return { scanned: candidateOrders.length, notified, skipped, failed };
  }
}
