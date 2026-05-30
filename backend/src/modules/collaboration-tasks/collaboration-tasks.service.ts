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
    if (!dto.type || !ALLOWED_TYPES.includes(dto.type as CollaborationTaskType)) {
      throw new Error('invalid type');
    }
    // 防御编码损坏（如客户端用错编码发送）
    if (hasBrokenEncoding(dto.reason)) {
      throw new Error('reason contains invalid characters; please ensure UTF-8 encoding');
    }
    const cleanReason = sanitizeText(dto.reason);

    const entity = this.repo.create({
      id: makeId(),
      leadId: dto.leadId,
      requesterId: dto.requesterId,
      handlerId: null,
      type: dto.type as CollaborationTaskType,
      reason: cleanReason,
      status: 'pending',
      handledNote: null,
      requestedAt: new Date(),
      handledAt: null,
    } as Partial<CollaborationTask>);
    await this.repo.save(entity);

    // §11.1 collab_requested: 通知客资来源运营。
    const lead = await this.leadRepository.findOne({
      where: { id: dto.leadId },
      select: { id: true, employeeId: true, contactInfo: true },
    });
    if (lead?.employeeId) {
      const sourceUserId = await this.findUserIdByEmployeeId(lead.employeeId);
      if (sourceUserId) {
        await this.notificationsService.create({
          receiverIds: [sourceUserId],
          senderId: dto.requesterId,
          portType: 'operations',
          typeCode: NOTIFICATION_TYPES.COLLAB_REQUESTED,
          title: '协同任务待处理',
          content: `客资 ${lead.contactInfo || ''} 有新的协同请求(${dto.type})`,
          relatedId: (entity as CollaborationTask).id,
          relatedType: 'collaboration_task',
        });
      }
    }

    return entity as CollaborationTask;
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

    if (query.scope === 'mine') {
      qb.andWhere('t.requester_id = :uid', { uid: query.userId || '' });
    } else if (query.scope === 'inbox') {
      qb.andWhere('t.handler_id = :uid', { uid: query.userId || '' });
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

    if (query.scope === 'mine') {
      qb.andWhere('t.requester_id = :uid', { uid: query.userId || '' });
    } else if (query.scope === 'inbox') {
      qb.andWhere('t.handler_id = :uid', { uid: query.userId || '' });
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

  async handle(id: string, handledNote: string): Promise<CollaborationTask | null> {
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    if (task.status !== 'handling' && task.status !== 'pending') {
      throw new Error(`cannot handle task in status ${task.status}`);
    }
    if (hasBrokenEncoding(handledNote)) {
      throw new Error('handledNote contains invalid characters; please ensure UTF-8 encoding');
    }
    const cleanNote = sanitizeText(handledNote);
    await this.repo.update(id, {
      status: 'handled',
      handledNote: cleanNote,
      handledAt: new Date(),
    });
    const updated = await this.repo.findOne({ where: { id } });

    // §11.1 collab_handled: 协同任务被处理完结，回写给原发起人。
    if (task.requesterId) {
      await this.notificationsService.create({
        receiverIds: [task.requesterId],
        senderId: task.handlerId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.COLLAB_HANDLED,
        title: '协同任务已处理',
        content: cleanNote
          ? `您发起的协同任务已处理: ${cleanNote}`
          : '您发起的协同任务已处理',
        relatedId: id,
        relatedType: 'collaboration_task',
      });
    }

    return updated;
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
