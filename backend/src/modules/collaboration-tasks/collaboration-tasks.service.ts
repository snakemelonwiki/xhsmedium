import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CollaborationTask,
  CollaborationTaskType,
  CollaborationTaskStatus,
} from '../../entities/collaboration-task.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { sanitizeText, hasBrokenEncoding } from '../../shared/sanitize';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

const ALLOWED_TYPES: CollaborationTaskType[] = [
  'remind_customer',
  'supplement_info',
  'verify_identity',
  'second_touch',
];

const TYPE_ALIASES: Record<string, CollaborationTaskType> = {
  confirm_identity: 'verify_identity',
  second_contact: 'second_touch',
};

type CollaborationActor = {
  actorUserId?: string;
  actorEmployeeId?: string;
  actorRole?: string;
  legacyDirectHandler?: boolean;
};

interface CreateDto {
  leadId: string;
  type: CollaborationTaskType | string;
  reason?: string | null;
  requesterId: string;
}

interface ListQuery {
  scope?: 'mine' | 'inbox' | 'all' | string;
  status?: string;
  leadId?: string;
  userId?: string;
  employeeId?: string;
}

@Injectable()
export class CollaborationTasksService {
  constructor(
    @InjectRepository(CollaborationTask)
    private readonly repo: Repository<CollaborationTask>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateDto): Promise<CollaborationTask> {
    if (!dto.leadId) throw new Error('leadId required');
    if (!dto.requesterId) throw new Error('requesterId required');
    const normalizedType = this.normalizeType(dto.type);
    if (!normalizedType) {
      throw new Error('invalid type');
    }
    // 防御编码损坏（如客户端用错编码发送）
    if (hasBrokenEncoding(dto.reason)) {
      throw new Error('reason contains invalid characters; please ensure UTF-8 encoding');
    }
    const cleanReason = sanitizeText(dto.reason);
    const lead = await this.leadRepository.findOne({
      where: { id: dto.leadId },
      select: { id: true, employeeId: true, contactInfo: true },
    });
    if (!lead) throw new Error('lead not found');
    const sourceUserId = lead.employeeId
      ? await this.findUserIdByEmployeeId(lead.employeeId)
      : null;

    const entity = this.repo.create({
      id: makeId(),
      leadId: dto.leadId,
      requesterId: dto.requesterId,
      handlerId: sourceUserId,
      type: normalizedType,
      reason: cleanReason,
      status: 'pending',
      handledNote: null,
      requestedAt: new Date(),
      handledAt: null,
    } as Partial<CollaborationTask>);
    await this.repo.save(entity);
    await this.leadRepository.update(dto.leadId, {
      status: 'in_collaboration',
    });

    // §11.1 collab_requested: 通知客资来源运营。
    if (sourceUserId) {
      await this.notificationsService.create({
        receiverIds: [sourceUserId],
        senderId: dto.requesterId,
        portType: 'operations',
        typeCode: NOTIFICATION_TYPES.COLLAB_REQUESTED,
        title: '协同任务待处理',
        content: `客资 ${lead.contactInfo || ''} 有新的协同请求(${normalizedType})`,
        relatedId: (entity as CollaborationTask).id,
        relatedType: 'collaboration_task',
      });
    }

    return entity as CollaborationTask;
  }

  private normalizeType(type: string | CollaborationTaskType | undefined | null): CollaborationTaskType | null {
    const raw = String(type || '').trim();
    if (!raw) return null;
    const normalized = TYPE_ALIASES[raw] || raw;
    return ALLOWED_TYPES.includes(normalized as CollaborationTaskType)
      ? normalized as CollaborationTaskType
      : null;
  }

  /**
   * Resolve users.id given an employees.id by looking at users.employee_id.
   */
  private async findUserIdByEmployeeId(employeeId: string): Promise<string | null> {
    if (!employeeId) return null;
    const user = await this.userRepository.findOne({
      where: { employeeId },
      select: { id: true },
    });
    return user?.id || null;
  }

  async list(query: ListQuery): Promise<any[]> {
    const qb = this.repo.createQueryBuilder('t');

    const scope = this.normalizeScope(query.scope);
    if (scope === 'mine') {
      qb.andWhere('t.requester_id = :uid', { uid: query.userId || '' });
    } else if (scope === 'inbox') {
      qb.leftJoin(Lead, 'l', 'l.id = t.lead_id');
      qb.andWhere(
        '(t.handler_id = :uid OR (t.status = :pendingStatus AND l.employee_id = :employeeId))',
        {
          uid: query.userId || '',
          pendingStatus: 'pending',
          employeeId: query.employeeId || '',
        },
      );
    }

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.leadId) {
      qb.andWhere('t.lead_id = :leadId', { leadId: query.leadId });
    }

    qb.orderBy('t.requested_at', 'DESC');
    const rows = await qb.getMany();
    return rows.map(this.map);
  }

  // §9 / AC-10.2 协同任务列表分页
  // 控制器拿到 limit/offset 时改走 *Paged 版本，统一返回 { items, total, limit, offset }；
  // 无分页参数时仍走上面老接口（直接返回数组），保持前端兼容。
  async listPaged(
    query: ListQuery & { limit: number; offset: number },
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(query.limit);
    const safeOffset = Math.max(Number(query.offset) || 0, 0);

    const qb = this.repo.createQueryBuilder('t');

    const scope = this.normalizeScope(query.scope);
    if (scope === 'mine') {
      qb.andWhere('t.requester_id = :uid', { uid: query.userId || '' });
    } else if (scope === 'inbox') {
      qb.leftJoin(Lead, 'l', 'l.id = t.lead_id');
      qb.andWhere(
        '(t.handler_id = :uid OR (t.status = :pendingStatus AND l.employee_id = :employeeId))',
        {
          uid: query.userId || '',
          pendingStatus: 'pending',
          employeeId: query.employeeId || '',
        },
      );
    }

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.leadId) {
      qb.andWhere('t.lead_id = :leadId', { leadId: query.leadId });
    }

    qb.orderBy('t.requested_at', 'DESC').skip(safeOffset).take(safeLimit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(this.map), total, limit: safeLimit, offset: safeOffset };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  /**
   * 兼容旧前端 scope 命名，统一成后端权限语义。
   */
  private normalizeScope(scope?: string): 'mine' | 'inbox' | 'all' | string {
    if (scope === 'requester' || scope === 'sales') return 'mine';
    if (scope === 'handler' || scope === 'operations') return 'inbox';
    return scope || 'all';
  }

  async claim(id: string, handlerId: string): Promise<CollaborationTask | null> {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    if (!handlerId) throw new Error('handler required');
    if (task.status !== 'pending') {
      throw new Error(`cannot claim task in status ${task.status}`);
    }
    await this.repo.update(id, {
      handlerId,
      status: 'handling',
    });
    return this.repo.findOne({ where: { id } });
  }

  async handle(
    id: string,
    handledNote: string,
    actor: CollaborationActor | string = {},
  ): Promise<CollaborationTask | null> {
    const handlerActor = this.normalizeActor(actor);
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    if (task.status !== 'handling' && task.status !== 'pending') {
      throw new Error(`cannot handle task in status ${task.status}`);
    }
    if (hasBrokenEncoding(handledNote)) {
      throw new Error('handledNote contains invalid characters; please ensure UTF-8 encoding');
    }
    await this.assertCanHandle(task, handlerActor);
    const cleanNote = sanitizeText(handledNote);
    await this.repo.update(id, {
      status: 'handled',
      handlerId: task.handlerId || handlerActor.actorUserId || null,
      handledNote: cleanNote,
      handledAt: new Date(),
    });
    const updated = await this.repo.findOne({ where: { id } });
    await this.leadRepository.update(task.leadId, {
      status: 'operation_handled',
      addStatus: 'operation_reminded',
    });

    // §11.1 collab_handled: 协同任务被处理完结，回写给原发起人。
    if (task.requesterId) {
      await this.notificationsService.create({
        receiverIds: [task.requesterId],
        senderId: task.handlerId || handlerActor.actorUserId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.COLLAB_HANDLED,
        title: '协同任务已处理',
        content: cleanNote
          ? `您发起的协同任务已处理: ${cleanNote}`
          : '您发起的协同任务已处理',
        relatedId: task.leadId,
        relatedType: 'lead',
      });
    }

    return updated;
  }

  /**
   * 校验协同处理权限：已认领任务仅处理人可处理；待处理任务仅来源运营或管理员可处理。
   */
  private async assertCanHandle(
    task: CollaborationTask,
    actor: CollaborationActor,
  ): Promise<void> {
    if (actor.actorRole === 'admin' || actor.actorRole === 'owner') {
      return;
    }
    if (!actor.actorUserId) {
      throw new Error('handler required');
    }
    if (actor.legacyDirectHandler) {
      return;
    }
    if (task.handlerId) {
      if (task.handlerId !== actor.actorUserId) {
        throw new Error('no permission to handle task');
      }
      return;
    }
    const lead = await this.leadRepository.findOne({
      where: { id: task.leadId },
      select: { employeeId: true },
    });
    if (!lead || lead.employeeId !== actor.actorEmployeeId) {
      throw new Error('no permission to handle task');
    }
  }

  /**
   * 兼容旧 service 调用传 handlerId 字符串；控制器路径传完整 actor 做权限校验。
   */
  private normalizeActor(actor: CollaborationActor | string): CollaborationActor {
    if (typeof actor === 'string') {
      return { actorUserId: actor, legacyDirectHandler: true };
    }
    return actor;
  }

  async close(id: string): Promise<CollaborationTask | null> {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    await this.repo.update(id, { status: 'closed' as CollaborationTaskStatus });
    return this.repo.findOne({ where: { id } });
  }

  private map(row: CollaborationTask): any {
    return {
      id: row.id,
      leadId: row.leadId,
      requesterId: row.requesterId,
      handlerId: row.handlerId,
      type: row.type,
      reason: row.reason,
      status: row.status,
      handledNote: row.handledNote,
      requestedAt: row.requestedAt,
      handledAt: row.handledAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
