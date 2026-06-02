import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupervisorSuggestion } from '../../entities/supervisor-suggestion.entity';
import { makeId } from '../../shared/utils/id-generator';
import { sanitizeText } from '../../shared/sanitize';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import {
  SUPERVISOR_SUGGESTION_CONTENT_MAX,
  CreateSupervisorSuggestionDto,
} from './dto/create-supervisor-suggestion.dto';

export interface ListSupervisorSuggestionFilter {
  operatorId?: string;
  supervisorId?: string;
  isRead?: 0 | 1 | boolean;
  limit?: number;
  offset?: number;
}

@Injectable()
export class SupervisorSuggestionsService {
  private readonly logger = new Logger(SupervisorSuggestionsService.name);

  constructor(
    @InjectRepository(SupervisorSuggestion)
    private readonly repo: Repository<SupervisorSuggestion>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 创建一条主管建议，并触发 supervisor_suggestion 通知给目标运营。
   * supervisorId 取自 session 注入的当前登录主管；operatorId 由调用方提供。
   */
  async create(
    supervisorId: string,
    dto: CreateSupervisorSuggestionDto,
  ): Promise<SupervisorSuggestion> {
    if (!supervisorId) {
      throw new BadRequestException('supervisorId required');
    }
    if (!dto.operatorId) {
      throw new BadRequestException('operatorId required');
    }
    if (!dto.content || !dto.content.trim()) {
      throw new BadRequestException('content required');
    }
    const cleanContent = sanitizeText(dto.content.trim());
    if (cleanContent.length > SUPERVISOR_SUGGESTION_CONTENT_MAX) {
      throw new BadRequestException(
        `content too long (max ${SUPERVISOR_SUGGESTION_CONTENT_MAX})`,
      );
    }

    const entity = this.repo.create({
      id: makeId(),
      supervisorId,
      operatorId: dto.operatorId,
      postId: dto.postId || null,
      accountId: dto.accountId || null,
      content: cleanContent,
      isRead: 0,
    } as Partial<SupervisorSuggestion>);
    const saved = await this.repo.save(entity);

    // 通知目标运营（portType=operations，前端运营端收）
    try {
      await this.notificationsService.create({
        receiverIds: [dto.operatorId],
        senderId: supervisorId,
        portType: 'operations',
        typeCode: NOTIFICATION_TYPES.SUPERVISOR_SUGGESTION,
        title: '主管建议',
        content: cleanContent.length > 80 ? `${cleanContent.slice(0, 80)}…` : cleanContent,
        relatedId: saved.id,
        relatedType: 'supervisor_suggestion',
      });
    } catch (notifErr) {
      // 通知失败不阻断主流程
      this.logger.warn(
        `supervisor_suggestion notify failed (id=${saved.id}): ${(notifErr as any)?.message || notifErr}`,
      );
    }

    return saved;
  }

  /**
   * 列表查询 + 可见性过滤：
   *   - admin / owner / supervisor 可看全表（默认 scope=all）
   *   - operation / staff 只能看 operatorId = actorUserId 的建议
   */
  async listPaged(
    filter: ListSupervisorSuggestionFilter & { actorUserId?: string; actorRole?: string },
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(filter.limit);
    const safeOffset = Math.max(Number(filter.offset) || 0, 0);

    const role = (filter.actorRole || '').toLowerCase();
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';

    const where: any = {};
    if (!isAdminLike) {
      // 非主管视角：只看发给自己
      where.operatorId = filter.actorUserId || '';
    } else if (filter.operatorId) {
      where.operatorId = filter.operatorId;
    }
    if (filter.supervisorId) {
      where.supervisorId = filter.supervisorId;
    }
    if (filter.isRead !== undefined && filter.isRead !== null) {
      where.isRead = filter.isRead ? 1 : 0;
    }

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });

    return {
      items: rows.map((r) => this.map(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async markRead(id: string, actorUserId: string, actorRole: string): Promise<boolean> {
    if (!id) return false;
    const role = (actorRole || '').toLowerCase();
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';
    const qb = this.repo
      .createQueryBuilder()
      .update(SupervisorSuggestion)
      .set({ isRead: 1 });
    if (isAdminLike) {
      qb.where('id = :id', { id });
    } else {
      qb.where('id = :id AND operator_id = :uid', {
        id,
        uid: actorUserId || '',
      });
    }
    const result = await qb.execute();
    return (result.affected || 0) > 0;
  }

  private clampLimit(limit?: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  private map(row: SupervisorSuggestion): any {
    return {
      id: row.id,
      supervisorId: row.supervisorId,
      operatorId: row.operatorId,
      postId: row.postId,
      accountId: row.accountId,
      content: row.content,
      isRead: row.isRead,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
