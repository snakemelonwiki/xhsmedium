import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification } from '../../entities/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import { getSessionRole, getSessionUserId } from '../../common/session.utils';
import {
  REMINDER_PRIORITIES,
  REMINDER_RECIPIENT_ROLES,
  REMINDER_RELATED_TYPES,
  type CreateReminderDto,
} from './dto/create-reminder.dto';

/**
 * v1.3 CROSS-3 通用提醒服务。
 *
 * 复用现有 notifications 表 + NotificationsService 写入；
 * Socket.IO 推送走 notifications.gateway.ts（自动 emit notification.created
 *   + reminder.created 两个事件，因为 reminder 已在 TYPE_TO_BUSINESS_EVENT 映射中）。
 */
@Injectable()
export class RemindersService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 角色 → portType 映射。
   *   sales       → 'sales'
   *   operation   → 'operations'（与 staff/operation 角色端口一致）
   *   supervisor  → 'operations'（与 admin/supervisor/owner 一致，主管端复用 operations 列表）
   */
  private static readonly ROLE_TO_PORT_TYPE: Record<string, string> = {
    sales: 'sales',
    operation: 'operations',
    supervisor: 'operations',
  };

  /**
   * 通用提醒：参数校验 + 角色权限校验 + 写入 notifications 表 + 触发 Socket.IO 推送。
   *
   * 权限：CROSS-3 限定销售/运营/主管三角色可调用；其他角色（owner/admin/academic 等）直接 403。
   */
  async createReminder(req: any, dto: CreateReminderDto): Promise<{
    ok: true;
    notification: { id: string; receiverId: string; typeCode: string; title: string };
  }> {
    // 1. 角色校验
    const role = this.normalizeRole(getSessionRole(req));
    if (!role) {
      throw new ForbiddenException('未登录或角色缺失');
    }
    if (!RemindersService.ALLOWED_SENDER_ROLES.has(role)) {
      throw new ForbiddenException('仅销售/运营/主管可发送提醒');
    }

    // 2. 参数校验
    const errors: string[] = [];
    const recipientId = String(dto?.recipientId || '').trim();
    const recipientRole = String(dto?.recipientRole || '').trim();
    const content = String(dto?.content || '').trim();
    const relatedType = dto?.relatedType ? String(dto.relatedType).trim() : '';
    const relatedId = dto?.relatedId ? String(dto.relatedId).trim() : '';
    const priority = dto?.priority ? String(dto.priority).trim() : 'normal';

    if (!recipientId) errors.push('recipientId 不能为空');
    if (!REMINDER_RECIPIENT_ROLES.includes(recipientRole as any)) {
      errors.push(`recipientRole 必须是 ${REMINDER_RECIPIENT_ROLES.join(' / ')}`);
    }
    if (!content) errors.push('content 不能为空');
    if (content.length > 500) errors.push('content 最多 500 字');
    if (relatedType && !REMINDER_RELATED_TYPES.includes(relatedType as any)) {
      errors.push(`relatedType 必须是 ${REMINDER_RELATED_TYPES.join(' / ')}`);
    }
    if (relatedType && !relatedId) errors.push('relatedType 与 relatedId 必须同时存在');
    if (!REMINDER_PRIORITIES.includes(priority as any)) {
      errors.push(`priority 必须是 ${REMINDER_PRIORITIES.join(' / ')}`);
    }
    if (errors.length) {
      throw new BadRequestException(errors.join('；'));
    }

    const portType = RemindersService.ROLE_TO_PORT_TYPE[recipientRole];
    const senderId = getSessionUserId(req);

    // 3. 标题：按 priority 加紧急前缀，正文保留原文
    const titlePrefix = priority === 'urgent' ? '【紧急】' : '';
    const title = `${titlePrefix}新提醒`;

    // 4. 复用 NotificationsService.create 写入 + Socket.IO 推送
    await this.notificationsService.create({
      receiverIds: [recipientId],
      senderId: senderId || null,
      portType,
      typeCode: NOTIFICATION_TYPES.REMINDER, // 'reminder'
      title,
      content,
      relatedId: relatedId || null,
      relatedType: relatedType || null,
    });

    // 5. 反查回新写入的 id（用于前端拿到 notification id 后做"标记已读"）
    // NotificationsService.create 不返回 id，这里走一次查询；为减少首屏延迟可改成 service 返回
    const inserted = await this.notificationRepo.findOne({
      where: {
        receiverId: recipientId,
        senderId: senderId || null,
        typeCode: NOTIFICATION_TYPES.REMINDER,
      },
      order: { createdAt: 'DESC' },
    });

    return {
      ok: true,
      notification: {
        id: inserted?.id || '',
        receiverId: recipientId,
        typeCode: NOTIFICATION_TYPES.REMINDER,
        title,
      },
    };
  }

  /**
   * 返回当前用户未读"提醒"条数（typeCode = 'reminder'）。
   * 区别于 GET /api/notifications/unread-count（全量未读），仅供"提醒红点"用。
   */
  async getUnreadCount(req: any): Promise<{ unreadCount: number }> {
    const userId = getSessionUserId(req);
    if (!userId) {
      return { unreadCount: 0 };
    }
    const count = await this.notificationRepo.count({
      where: {
        receiverId: userId,
        readStatus: 0,
        typeCode: NOTIFICATION_TYPES.REMINDER,
      },
    });
    return { unreadCount: count };
  }

  /**
   * 回复提醒：对指定提醒发送一条回复。
   * 回复会创建一条新的提醒通知，发送给原提醒的发送者（recipient 回复 sender）。
   * 同时更新原提醒的回复数（附加在原提醒关联数据上）。
   */
  async reply(
    req: any,
    reminderId: string,
    dto: { content: string },
  ): Promise<{ ok: true; notification: { id: string } }> {
    const userId = getSessionUserId(req);
    if (!userId) throw new NotFoundException('未登录');

    // 查找原提醒
    const original = await this.notificationRepo.findOne({ where: { id: reminderId } });
    if (!original) throw new NotFoundException('提醒不存在');
    if (original.typeCode !== NOTIFICATION_TYPES.REMINDER) {
      throw new BadRequestException('只能回复提醒类型通知');
    }

    const content = String(dto?.content || '').trim();
    if (!content) throw new BadRequestException('回复内容不能为空');
    if (content.length > 500) throw new BadRequestException('回复内容最多 500 字');

    // 回复发给原提醒的发送者
    const replyRecipientId = original.senderId;
    if (!replyRecipientId) throw new BadRequestException('原提醒无发送者，无法回复');

    // 确定收件人端口类型：根据当前用户角色映射
    const role = getSessionRole(req);
    const portType = RemindersService.ROLE_TO_PORT_TYPE[role] || 'operations';

    const replyTitle = `回复：${original.title || '提醒'}`;
    const replyContent = `回复：${content}`;

    await this.notificationsService.create({
      receiverIds: [replyRecipientId],
      senderId: userId,
      portType,
      typeCode: NOTIFICATION_TYPES.REMINDER,
      title: replyTitle,
      content: replyContent,
      relatedId: original.relatedId,
      relatedType: original.relatedType,
    });

    // 反查新记录 id
    const inserted = await this.notificationRepo.findOne({
      where: {
        receiverId: replyRecipientId,
        senderId: userId,
        typeCode: NOTIFICATION_TYPES.REMINDER,
      },
      order: { createdAt: 'DESC' },
    });

    return { ok: true, notification: { id: inserted?.id || '' } };
  }

  /**
   * 转发提醒：将指定提醒转发给另一个角色/用户。
   * 创建一条新提醒，收件人为转发目标，内容为原提醒正文 + 转发附言。
   */
  async forward(
    req: any,
    reminderId: string,
    dto: { recipientId: string; recipientRole: string; content?: string },
  ): Promise<{ ok: true; notification: { id: string; receiverId: string; typeCode: string; title: string } }> {
    const userId = getSessionUserId(req);
    if (!userId) throw new NotFoundException('未登录');

    // 查找原提醒
    const original = await this.notificationRepo.findOne({ where: { id: reminderId } });
    if (!original) throw new NotFoundException('提醒不存在');
    if (original.typeCode !== NOTIFICATION_TYPES.REMINDER) {
      throw new BadRequestException('只能转发提醒类型通知');
    }

    const recipientId = String(dto?.recipientId || '').trim();
    const recipientRole = String(dto?.recipientRole || '').trim();
    const extraContent = String(dto?.content || '').trim();

    if (!recipientId) throw new BadRequestException('recipientId 不能为空');
    if (!REMINDER_RECIPIENT_ROLES.includes(recipientRole as any)) {
      throw new BadRequestException(`recipientRole 必须是 ${REMINDER_RECIPIENT_ROLES.join(' / ')}`);
    }

    const portType = RemindersService.ROLE_TO_PORT_TYPE[recipientRole] || 'operations';
    const forwardSuffix = extraContent ? `\n\n转发附言：${extraContent}` : '';

    // 构造转发标题——保留原标题 + 前缀
    const forwardTitle = `【转发】${original.title || '提醒'}`;
    const forwardSnippet = original.content
      ? `原消息：${String(original.content).slice(0, 200)}${forwardSuffix}`
      : `转发的提醒${forwardSuffix}`;
    const forwardContent = `${forwardTitle}\n${forwardSnippet}`;

    await this.notificationsService.create({
      receiverIds: [recipientId],
      senderId: userId,
      portType,
      typeCode: NOTIFICATION_TYPES.REMINDER,
      title: forwardTitle,
      content: forwardContent.slice(0, 500),
      relatedId: original.relatedId,
      relatedType: original.relatedType,
    });

    const inserted = await this.notificationRepo.findOne({
      where: {
        receiverId: recipientId,
        senderId: userId,
        typeCode: NOTIFICATION_TYPES.REMINDER,
      },
      order: { createdAt: 'DESC' },
    });

    return {
      ok: true,
      notification: {
        id: inserted?.id || '',
        receiverId: recipientId,
        typeCode: NOTIFICATION_TYPES.REMINDER,
        title: forwardTitle,
      },
    };
  }

  /**
   * 标记单条提醒为已读。
   * 与现有 PATCH /api/notifications/:id/read 行为一致：仅收件人本人可标记。
   * 通知不存在或不是自己的 → 404；已读重复标记返回 ok:false。
   */
  async markRead(req: any, id: string): Promise<{ ok: boolean; changed: boolean }> {
    const userId = getSessionUserId(req);
    if (!userId || !id) {
      throw new NotFoundException('通知不存在');
    }
    const row = await this.notificationRepo.findOne({ where: { id } });
    if (!row || row.receiverId !== userId) {
      throw new NotFoundException('通知不存在');
    }
    // 仅允许对 reminder 类型做"标记已读"——避免被滥用覆盖其他类型通知
    if (row.typeCode !== NOTIFICATION_TYPES.REMINDER) {
      throw new NotFoundException('通知不存在');
    }
    const changed = await this.notificationsService.markRead(id, userId);
    return { ok: true, changed };
  }

  private normalizeRole(role: string | undefined | null): string {
    const r = String(role || '').trim().toLowerCase();
    if (!r) return '';
    return r;
  }

  /**
   * 仅销售 / 运营 / 主管可调用 POST /api/reminders。
   * 历史别名：staff 与 operation 等价；admin/supervisor/owner 在 UserRole 里并存。
   */
  private static readonly ALLOWED_SENDER_ROLES: ReadonlySet<string> = new Set([
    'sales',
    'operation',
    'staff', // 历史运营员工别名（M20 之后推荐 operation）
    'supervisor',
    'admin', // 主管端账号（运营管理），与 supervisor 等价
  ]);
}
