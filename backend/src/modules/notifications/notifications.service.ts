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

    const total = await this.repo.count({ where });

    const rows = await this.repo.find({
      where,
      order: {
        readStatus: 'ASC',
        createdAt: 'DESC',
      },
      take: limit,
      skip: offset,
    });

    const unreadWhere: any = { receiverId: userId, readStatus: 0 };
    if (opts?.portType) {
      unreadWhere.portType = opts.portType;
    }
    const unreadCount = await this.repo.count({ where: unreadWhere });

    const items = rows.map((r) => this.map(r));

    return {
      items,
      unreadCount,
      total,
      limit,
      offset,
    };
  }

  async countUnread(userId: string, portType?: string): Promise<number> {
    if (!userId) return 0;
    const where: any = { receiverId: userId, readStatus: 0 };
    if (portType) {
      where.portType = portType;
    }
    return this.repo.count({ where });
  }

  /**
   * v1.3 / OP-6 拆分未读消息：按 typeCode 维度返回未读条数。
   * 典型用法：今日任务页同时拉「主管建议」与「未读系统消息」两条卡片。
   *
   * 主管建议走 supervisor_suggestions 表（不再走 notifications 的 typeCode='supervisor_suggestion'，
   * 见 supervisor-suggestions.service），所以本方法对 supervisor_suggestion 会返回 0；
   * 调用方应自行用 supervisor-suggestions 模块的 unread-count 接口。
   */
  async getUnreadCountByType(typeCode: string, userId: string): Promise<number> {
    if (!typeCode || !userId) return 0;
    return this.repo.count({
      where: { receiverId: userId, readStatus: 0, typeCode },
    });
  }

  /**
   * v1.3 SUP-3: 当前用户未读提醒（type_code = 'reminder'）按 sender_id 分组聚合。
   * 每组返回发送者 ID、显示名（来自 users.username，缺省回退到 ID）、未读条数、
   * 最新一条的 content / createdAt。
   */
  async listUnreadBySender(
    userId: string,
    portType?: string,
  ): Promise<{ total: number; senders: Array<{ senderId: string; senderName: string; count: number; latestContent: string | null; latestAt: string | null }> }> {
    if (!userId) return { total: 0, senders: [] };
    const params: any[] = [userId];
    const whereParts = ['n.receiver_id = ?', "n.type_code = 'reminder'", 'n.read_status = 0'];
    if (portType) {
      whereParts.push('n.port_type = ?');
      params.push(portType);
    }
    const sql = `
      SELECT
        COALESCE(n.sender_id, '') AS sender_id,
        u.username AS sender_name,
        COUNT(*) AS cnt
      FROM notifications n
      LEFT JOIN users u ON u.id = n.sender_id
      WHERE ${whereParts.join(' AND ')}
      GROUP BY n.sender_id, u.username
      ORDER BY cnt DESC, n.sender_id ASC
    `;
    const grouped = (await this.repo.query(sql, params)) as Array<{
      sender_id: string;
      sender_name: string | null;
      cnt: string | number;
    }>;

    const senders: Array<{
      senderId: string;
      senderName: string;
      count: number;
      latestContent: string | null;
      latestAt: string | null;
    }> = [];

    let total = 0;
    for (const row of grouped) {
      const senderId = String(row.sender_id || '').trim();
      const count = Number(row.cnt || 0);
      total += count;
      let latestContent: string | null = null;
      let latestAt: string | null = null;
      if (senderId) {
        const latestParams: any[] = [userId, senderId];
        const latestWhere = "n.receiver_id = ? AND n.type_code = 'reminder' AND n.read_status = 0 AND n.sender_id = ?";
        if (portType) {
          latestParams.push(portType);
        }
        const latestSql = `
          SELECT n.content, n.created_at
          FROM notifications n
          WHERE ${latestWhere}${portType ? ' AND n.port_type = ?' : ''}
          ORDER BY n.created_at DESC
          LIMIT 1
        `;
        const latest = (await this.repo.query(latestSql, latestParams)) as Array<{ content: string | null; created_at: Date | string }>;
        if (latest[0]) {
          latestContent = latest[0].content ?? null;
          latestAt = latest[0].created_at instanceof Date
            ? latest[0].created_at.toISOString()
            : String(latest[0].created_at || '');
        }
      }
      senders.push({
        senderId,
        senderName: String(row.sender_name || senderId || '未知发送者'),
        count,
        latestContent,
        latestAt,
      });
    }
    return { total, senders };
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
   * Find notification by id.
   */
  async findById(id: string): Promise<Notification | null> {
    return this.repo.findOne({ where: { id } });
  }

  /**
   * Mark every unread notification of the user as read. Returns affected count.
   * When typeCode is provided, the update is scoped to that notification type.
   */
  async markAllRead(userId: string, typeCode?: string): Promise<number> {
    if (!userId) return 0;
    const qb = this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readStatus: 1 });
    if (typeCode) {
      qb.where('receiver_id = :uid AND read_status = 0 AND type_code = :typeCode', {
        uid: userId,
        typeCode,
      });
    } else {
      qb.where('receiver_id = :uid AND read_status = 0', { uid: userId });
    }
    const result = await qb.execute();
    return result.affected || 0;
  }

  /**
   * Mark a batch of notifications (by id) as read. Only notifications owned
   * by the current user and currently unread are flipped to read. The
   * id list is deduplicated and any empty entries are dropped. Returns the
   * number of rows actually updated.
   */
  async markReadMany(userId: string, ids: string[]): Promise<number> {
    if (!userId) return 0;
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const uniqueIds = Array.from(
      new Set(
        ids
          .map((id) => (id == null ? '' : String(id).trim()))
          .filter((id) => id.length > 0),
      ),
    );
    if (uniqueIds.length === 0) return 0;
    const result = await this.repo
      .createQueryBuilder()
      .update(Notification)
      .set({ readStatus: 1 })
      .where('receiver_id = :uid AND read_status = 0 AND id IN (:...ids)', {
        uid: userId,
        ids: uniqueIds,
      })
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
    const targetType = row.relatedType || null;
    const targetId = row.relatedId || null;
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
      targetType,
      targetId,
      routeHint: this.buildRouteHint(row.portType, targetType, targetId),
      readStatus: row.readStatus,
      unread: !row.readStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private buildRouteHint(portType: string, targetType: string | null, targetId: string | null): string | null {
    if (!targetType || !targetId) return null;
    if (targetType === 'lead') {
      return portType === 'operations' ? `/operation/leads?leadId=${targetId}` : `/sales/leads/${targetId}`;
    }
    if (targetType === 'collaboration_task') {
      return portType === 'operations'
        ? `/operation/collaboration?taskId=${targetId}`
        : `/sales/collaboration?taskId=${targetId}`;
    }
    if (targetType === 'order') {
      return portType === 'academic' ? `/academic/orders/${targetId}` : `/sales/orders/${targetId}`;
    }
    // N-P1-08 修复：导出/导入通知此前无 routeHint 分支，用户点击只 markRead 不跳转。
    // 导出：当前实现只有 /academic/exports 页面可消费（前端不存在 /operation/exports
    //       /sales/exports /admin/exports），因此无论 portType 都跳到 academic 页。
    //       未来新增其它端口的导出页时，再按 portType 分支细化。
    // 导入：admin 与 operation 两个页面均可消费，admin 优先。
    if (targetType === 'export') {
      return `/academic/exports?taskId=${targetId}`;
    }
    if (targetType === 'import_task' || targetType === 'import') {
      return portType === 'admin'
        ? `/admin/imports?taskId=${targetId}`
        : `/operation/imports?taskId=${targetId}`;
    }
    return null;
  }
}
