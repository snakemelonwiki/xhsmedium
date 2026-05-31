import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../entities/notification.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsGateway } from './notifications.gateway';

interface ListOpts {
  status?: 'unread' | 'all';
  type?: string;
  portType?: string;
  limit?: number;
  offset?: number;
}

interface CreateDto {
  receiverIds: string[];
  senderId?: string | null;
  portType: string;
  typeCode: string;
  title: string;
  content?: string | null;
  relatedId?: string | null;
  relatedType?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * List notifications for the given user. Unread first, then newest first.
   * Returns the page items, the total matched count (same where as the page)
   * and the user's unread count (independent of pagination / type filter,
   * used to drive the bell badge). Also echoes back the resolved limit/offset
   * so the frontend can drive "load more" without re-deriving the math.
   */
  async listForUser(
    userId: string,
    opts?: ListOpts,
  ): Promise<{ items: any[]; unreadCount: number; total: number; limit: number; offset: number }> {
    if (!userId) {
      return { items: [], unreadCount: 0, total: 0, limit: this.clampLimit(opts?.limit), offset: 0 };
    }

    const limit = this.clampLimit(opts?.limit);
    const offset = Math.max(Number(opts?.offset) || 0, 0);

    // 构建查询条件
    const where: any = { receiverId: userId };
    if (opts?.status === 'unread') {
      where.readStatus = 0;
    }
    if (opts?.type) {
      where.typeCode = opts.type;
    }
    if (opts?.portType) {
      where.portType = opts.portType;
    }

    console.log('[DEBUG] Query where:', where);

    // 分开查询：先查总数
    const total = await this.repo.count({ where });
    console.log('[DEBUG] Total count:', total);

    // 再查分页数据
    const rows = await this.repo.find({
      where,
      order: {
        readStatus: 'ASC',
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });
    console.log('[DEBUG] Rows count:', rows.length);

    // 查询未读数
    const unreadWhere: any = { receiverId: userId, readStatus: 0 };
    if (opts?.portType) {
      unreadWhere.portType = opts.portType;
    }
    const unreadCount = await this.repo.count({ where: unreadWhere });

    const items = rows.map((r) => this.map(r));
    console.log('[DEBUG] Final result:', { itemCount: items.length, unreadCount, total });

    return {
      items,
      unreadCount,
      total,
      limit,
      offset,
    };
  }

  private clampLimit(limit: number | undefined): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  /**
   * Mark a single notification as read. Only the receiver may mark it,
   * and only when it is currently unread. Returns true on state change.
   */
  async markRead(id: string, userId: string): Promise<boolean> {
    if (!id || !userId) return false;
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readStatus: 1 })
      .where('id = :id AND receiver_id = :uid AND read_status = 0', {
        id,
        uid: userId,
      })
      .execute();
    return (result.affected || 0) > 0;
  }

  /**
   * Mark every unread notification of the user as read. Returns affected count.
   */
  async markAllRead(userId: string): Promise<number> {
    if (!userId) return 0;
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readStatus: 1 })
      .where('receiver_id = :uid AND read_status = 0', { uid: userId })
      .execute();
    return result.affected || 0;
  }

  /**
   * Insert one notification per receiver. Safe to call with an empty list —
   * call sites can pass receiverIds straight from a DB query without
   * pre-filtering. Failures are swallowed and logged so notifications never
   * block the underlying business transaction.
   */
  async create(dto: CreateDto): Promise<void> {
    const receivers = (dto.receiverIds || [])
      .map((id) => (id == null ? '' : String(id).trim()))
      .filter((id) => id.length > 0);
    if (receivers.length === 0) return;
    if (!dto.portType || !dto.typeCode || !dto.title) return;

    const now = new Date();
    const rows = receivers.map((rid) => this.repo.create({
      id: makeId(),
      receiverId: rid,
      senderId: dto.senderId ?? null,
      portType: dto.portType,
      typeCode: dto.typeCode,
      title: dto.title,
      content: dto.content ?? null,
      relatedId: dto.relatedId ?? null,
      relatedType: dto.relatedType ?? null,
      readStatus: 0,
      createdAt: now,
      updatedAt: now,
    } as Partial<Notification>));

    try {
      await this.repo.save(rows);
      rows.forEach((row) => this.gateway.emitCreated(row.receiverId, this.map(row)));
    } catch (err: any) {
      // Notifications are best-effort; don't propagate.
      // eslint-disable-next-line no-console
      console.error('[notifications] create failed', err?.message || err);
    }
  }

  private map(row: Notification): any {
    return {
      id: row.id,
      receiverId: row.receiverId,
      senderId: row.senderId,
      portType: row.portType,
      typeCode: row.typeCode,
      // Keep `type` alias for back-compat with the legacy in-memory shape.
      type: row.typeCode,
      title: row.title,
      content: row.content,
      // Legacy field name still consumed by the frontend bell list.
      message: row.content,
      relatedId: row.relatedId,
      relatedType: row.relatedType,
      readStatus: row.readStatus,
      unread: !row.readStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
