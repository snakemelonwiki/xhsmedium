import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Order } from '../../entities/order.entity';
import { OrderAbnormalFeedback } from './entities/order-abnormal-feedback.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

export const ABNORMAL_TYPE_OPTIONS = [
  'client_uncooperative',
  'material_missing',
  'teacher_no_response',
  'cycle_risk',
  'payment_issue',
  'other',
] as const;

export type AbnormalType = typeof ABNORMAL_TYPE_OPTIONS[number];

export const EXPECTED_HELPER_OPTIONS = ['sales', 'supervisor', 'operation', 'other'] as const;
export type ExpectedHelper = typeof EXPECTED_HELPER_OPTIONS[number];

export const FEEDBACK_STATUSES = ['open', 'handling', 'closed'] as const;
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];

interface CreateAbnormalFeedbackDto {
  abnormalType: string;
  description?: string | null;
  expectedHelper?: string | null;
}

interface CloseAbnormalFeedbackDto {
  closeNote?: string | null;
  status?: 'handling' | 'closed';
}

interface Actor {
  userId: string;
  role: string;
}

@Injectable()
export class OrderAbnormalFeedbackService {
  constructor(
    @InjectRepository(OrderAbnormalFeedback)
    private readonly feedbackRepository: Repository<OrderAbnormalFeedback>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly operationLogsService: OperationLogsService,
  ) {}

  /**
   * 创建一条订单异常反馈：
   * - 校验订单存在 + 提交人至少有该订单的可见性
   * - 校验 abnormalType / expectedHelper 枚举
   * - 写入反馈记录 + 改 orders.orderStatus='abnormal' + 发通知 + 写操作日志
   */
  async create(
    orderId: string,
    actor: Actor,
    dto: CreateAbnormalFeedbackDto,
  ): Promise<{ id: string }> {
    if (!actor?.userId) {
      throw new ForbiddenException('unauthenticated');
    }
    if (!dto.abnormalType || !ABNORMAL_TYPE_OPTIONS.includes(dto.abnormalType as AbnormalType)) {
      throw new BadRequestException('invalid abnormalType');
    }
    if (
      dto.expectedHelper != null
      && dto.expectedHelper !== ''
      && !EXPECTED_HELPER_OPTIONS.includes(dto.expectedHelper as ExpectedHelper)
    ) {
      throw new BadRequestException('invalid expectedHelper');
    }
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!this.canWrite(actor, order)) {
      throw new ForbiddenException('no permission to submit abnormal feedback');
    }

    const id = makeId();
    await this.feedbackRepository.save({
      id,
      orderId,
      leadId: order.leadId || null,
      reporterUserId: actor.userId,
      abnormalType: dto.abnormalType,
      description: dto.description ? String(dto.description).trim() : null,
      expectedHelper: dto.expectedHelper || null,
      status: 'open',
    } as Partial<OrderAbnormalFeedback>);

    // 状态机：进异常
    if (order.orderStatus !== 'abnormal') {
      await this.orderRepository.update({ id: orderId }, { orderStatus: 'abnormal' });
    }

    // 通知：异常 → 销售 + 主管
    try {
      const receivers = await this.collectNotifyReceivers(order, actor.userId);
      if (receivers.length > 0) {
        await this.notificationsService.create({
          receiverIds: receivers,
          senderId: actor.userId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
          title: '订单异常反馈',
          content: `订单 ${orderId} 提交异常：${this.mapAbnormalTypeLabel(dto.abnormalType)}`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[abnormal-feedback] notify create failed', err?.message || err);
    }

    // 操作日志（best-effort）
    try {
      await this.operationLogsService.log({
        userId: actor.userId,
        action: 'order_abnormal_feedback_create',
        targetType: 'order_abnormal_feedback',
        targetId: id,
        detail: `order=${orderId};type=${dto.abnormalType};helper=${dto.expectedHelper || ''}`,
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[abnormal-feedback] log create failed', err?.message || err);
    }

    return { id };
  }

  /**
   * 列出订单的全部异常反馈，按时间倒序。
   * 权限：
   * - admin/owner：全可见
   * - sales：仅自己经手的订单
   * - academic：自己已认领 + 池单可见
   */
  async findByOrder(
    orderId: string,
    actor: Actor,
  ): Promise<OrderAbnormalFeedback[]> {
    if (!actor?.userId) {
      throw new ForbiddenException('unauthenticated');
    }
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!this.canRead(actor, order)) {
      throw new NotFoundException('order not found');
    }
    const rows = await this.feedbackRepository.find({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    return rows;
  }

  /**
   * 关闭（处理完成）一条异常反馈：
   * - 仅创建人 / 主管 / 教务管理员 / 相关销售可关闭
   * - 关闭后回退 orders.orderStatus 到 in_progress（兜底 to_receive）
   * - 发通知 + 写操作日志
   */
  async close(
    orderId: string,
    feedbackId: string,
    actor: Actor,
    dto: CloseAbnormalFeedbackDto,
  ): Promise<void> {
    if (!actor?.userId) {
      throw new ForbiddenException('unauthenticated');
    }
    const feedback = await this.feedbackRepository.findOne({ where: { id: feedbackId } });
    if (!feedback || feedback.orderId !== orderId) {
      throw new NotFoundException('feedback not found');
    }
    if (feedback.status === 'closed') {
      throw new BadRequestException('feedback already closed');
    }
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!this.canClose(actor, order, feedback)) {
      throw new ForbiddenException('no permission to close this feedback');
    }
    const nextStatus: FeedbackStatus = dto.status === 'handling' ? 'handling' : 'closed';

    await this.feedbackRepository.update(
      { id: feedbackId },
      {
        status: nextStatus,
        closedAt: nextStatus === 'closed' ? new Date() : null,
        closedBy: nextStatus === 'closed' ? actor.userId : null,
        closeNote: dto.closeNote ? String(dto.closeNote).trim() : null,
      } as Partial<OrderAbnormalFeedback>,
    );

    // 关闭即视为"异常已处理"，把订单拉回 in_progress
    if (nextStatus === 'closed' && order.orderStatus === 'abnormal') {
      const fallback = order.academicUserId ? 'in_progress' : 'to_receive';
      await this.orderRepository.update(
        { id: orderId },
        { orderStatus: fallback },
      );
    }

    // 通知所有相关方
    try {
      const receivers = await this.collectNotifyReceivers(order, actor.userId, feedback.reporterUserId);
      if (receivers.length > 0) {
        await this.notificationsService.create({
          receiverIds: receivers,
          senderId: actor.userId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
          title: nextStatus === 'closed' ? '订单异常已关闭' : '订单异常处理中',
          content: `订单 ${orderId} 异常反馈${nextStatus === 'closed' ? '已关闭' : '进入处理中'}`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[abnormal-feedback] notify close failed', err?.message || err);
    }

    try {
      await this.operationLogsService.log({
        userId: actor.userId,
        action: nextStatus === 'closed' ? 'order_abnormal_feedback_close' : 'order_abnormal_feedback_handling',
        targetType: 'order_abnormal_feedback',
        targetId: feedbackId,
        detail: `order=${orderId};status=${nextStatus}`,
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[abnormal-feedback] log close failed', err?.message || err);
    }
  }

  // ─── helpers ────────────────────────────────────────────────────────────

  private canRead(actor: Actor, order: Order): boolean {
    const role = actor.role || '';
    const uid = actor.userId || '';
    if (role === 'admin' || role === 'owner') return true;
    if (role === 'sales') return order.salesUserId === uid;
    if (role === 'academic') return order.academicUserId === uid || order.academicUserId == null;
    return order.salesUserId === uid || order.academicUserId === uid;
  }

  private canWrite(actor: Actor, order: Order): boolean {
    const role = actor.role || '';
    const uid = actor.userId || '';
    if (role === 'admin' || role === 'owner' || role === 'academic') {
      // 教务：限自己已认领 + 池单（与 orders list 保持一致）
      if (role === 'academic') {
        return order.academicUserId === uid || order.academicUserId == null;
      }
      return true;
    }
    if (role === 'sales') return order.salesUserId === uid;
    return false;
  }

  private canClose(actor: Actor, order: Order, feedback: OrderAbnormalFeedback): boolean {
    const role = actor.role || '';
    const uid = actor.userId || '';
    if (role === 'admin' || role === 'owner') return true;
    if (role === 'academic' && (order.academicUserId === uid || order.academicUserId == null)) {
      // 教务：必须是该反馈的提交人
      return feedback.reporterUserId === uid;
    }
    if (role === 'sales' && order.salesUserId === uid) return true;
    return false;
  }

  private async collectNotifyReceivers(order: Order, excludeUserId: string, alsoInclude?: string): Promise<string[]> {
    const set = new Set<string>();
    if (alsoInclude && alsoInclude !== excludeUserId) set.add(alsoInclude);
    if (order.salesUserId && order.salesUserId !== excludeUserId) set.add(order.salesUserId);
    if (order.academicUserId && order.academicUserId !== excludeUserId) set.add(order.academicUserId);
    // 兜底：把主管 / 总后台加上
    try {
      const supervisors = await this.userRepository.find({
        where: { role: In(['admin', 'owner']) as any },
        select: { id: true },
      });
      supervisors.forEach((u) => {
        if (u.id && u.id !== excludeUserId) set.add(u.id);
      });
    } catch {
      // 忽略：兜底失败不影响主流程
    }
    return Array.from(set);
  }

  private mapAbnormalTypeLabel(value: string): string {
    const map: Record<string, string> = {
      client_uncooperative: '客户不配合',
      material_missing: '素材缺失',
      teacher_no_response: '老师未响应',
      cycle_risk: '周期风险',
      payment_issue: '款项问题',
      other: '其他',
    };
    return map[value] || value;
  }
}
