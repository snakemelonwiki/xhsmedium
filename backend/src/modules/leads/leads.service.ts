import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { LeadFollowRecord } from '../../entities/lead-follow-record.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import { OperationLogsService } from '../operation-logs/operation-logs.service';

interface BoardPatchDto {
  status?: string;
  assignedSalesUserId?: string | null;
  assignedSalesUserName?: string;
  processStatus?: string;
  addStatus?: string;
  intention?: string | null;
  intentionLevel?: string;
  nextFollowTime?: string | Date | null;
  followNote?: string;
  followType?: string;
}

interface FollowRecordDto {
  followType?: string;
  content: string;
  nextFollowTime?: string | Date | null;
  processStatus?: string;
  intention?: string | null;
  intentionLevel?: string;
}

interface LeadFilterOptions {
  scope?: 'self' | 'employee' | 'all';
  employeeId?: string;
  actorEmployeeId?: string;
  actorUserId?: string;
  actorRole?: string;
  accountId?: string;
  platform?: string;
  postType?: string;
  status?: string;
  addStatus?: string;
  processStatus?: string;
  search?: string;
  from?: string;
  to?: string;
}

const LEAD_STATUS_CODES = new Set(['new', 'assigned', 'in_followup', 'in_collaboration', 'operation_handled', 'added_success', 'invalid']);
const ADD_STATUS_CODES = new Set(['not_added', 'applied', 'not_passed', 'operation_reminded', 'added']);
const PROCESS_STATUS_CODES = new Set(['not_contacted', 'waiting_pass', 'communicating', 'quoted', 'deal_pending', 'deal_done', 'invalid']);

const STATUS_ALIASES: Record<string, string> = {
  contact_added: 'added_success',
  added: 'added_success',
  rejected: 'invalid',
  '新客资': 'new',
  '已分配': 'assigned',
  '跟进中': 'in_followup',
  '协同中': 'in_collaboration',
  '运营已处理': 'operation_handled',
  '已添加通过': 'added_success',
  '无效客资': 'invalid',
};

const ADD_STATUS_ALIASES: Record<string, string> = {
  rejected: 'not_passed',
  waiting_pass: 'applied',
  '未添加': 'not_added',
  '已申请添加': 'applied',
  '客户未通过': 'not_passed',
  '运营已提醒': 'operation_reminded',
  '已添加通过': 'added',
};

const PROCESS_STATUS_ALIASES: Record<string, string> = {
  applied: 'waiting_pass',
  pending: 'not_contacted',
  '未接': 'not_contacted',
  '未联系': 'not_contacted',
  '待通过': 'waiting_pass',
  '沟通中': 'communicating',
  '已报价': 'quoted',
  '待成交': 'deal_pending',
  '已成交': 'deal_done',
  '无效': 'invalid',
};

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(LeadFollowRecord)
    private readonly followRepository: Repository<LeadFollowRecord>,
    @InjectRepository(Post)
    private readonly postRepository: Repository<Post>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CollaborationTask)
    private readonly collaborationRepository: Repository<CollaborationTask>,
    private readonly notificationsService: NotificationsService,
    private readonly operationLogsService: OperationLogsService,
  ) {}

  /**
   * Resolve users.id given an employees.id by looking at users.employee_id.
   * Used to route notifications addressed at "the source operations user"
   * since leads only store the employee_id.
   */
  private async findUserIdByEmployeeId(employeeId: string): Promise<string | null> {
    if (!employeeId) return null;
    const user = await this.userRepository.findOne({
      where: { employeeId },
      select: { id: true },
    });
    return user?.id || null;
  }

  async findAll(): Promise<any[]> {
    const rows = await this.leadRepository.find({ order: { createdAt: 'DESC' } });
    return this.mapLeads(rows);
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.leadRepository.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
    return this.mapLeads(rows);
  }

  // ---- §9 / AC-10.2 客资列表分页 ----
  // 控制器拿到 limit/offset 时改走 *Paged 版本，统一返回 { items, total, limit, offset }；
  // 无分页参数时仍走上面两个老接口（直接返回数组），保持前端 `await api('/api/leads')` 的兼容。
  async findAllPaged(limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.leadRepository.findAndCount({
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  async findByEmployeePaged(employeeId: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.leadRepository.findAndCount({
      where: { employeeId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  async findFiltered(filters: LeadFilterOptions): Promise<any[]> {
    const qb = this.buildLeadFilterQuery(filters);
    const rows = await qb
      .orderBy('l.created_at', 'DESC')
      .getMany();
    return this.mapLeads(rows);
  }

  async findFilteredPaged(filters: LeadFilterOptions, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const qb = this.buildLeadFilterQuery(filters)
      .orderBy('l.created_at', 'DESC')
      .take(safeLimit)
      .skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  async findTomorrowFollowups(salesUserId: string): Promise<any[]> {
    if (!salesUserId) return [];
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfterTomorrow = new Date(todayEnd.getTime() + 86400000);
    const rows = await this.leadRepository
      .createQueryBuilder('l')
      .where('l.next_follow_time >= :from', { from: todayEnd })
      .andWhere('l.next_follow_time < :to', { to: dayAfterTomorrow })
      .andWhere('l.assigned_sales_user_id = :uid', { uid: salesUserId })
      .orderBy('l.next_follow_time', 'ASC')
      .getMany();
    return this.mapLeads(rows);
  }

  async findTomorrowFollowupsPaged(salesUserId: string, limit: number, offset: number): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    if (!salesUserId) return { items: [], total: 0, limit: this.clampLimit(limit), offset: Math.max(Number(offset) || 0, 0) };
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dayAfterTomorrow = new Date(todayEnd.getTime() + 86400000);
    const qb = this.leadRepository
      .createQueryBuilder('l')
      .where('l.next_follow_time >= :from', { from: todayEnd })
      .andWhere('l.next_follow_time < :to', { to: dayAfterTomorrow })
      .andWhere('l.assigned_sales_user_id = :uid', { uid: salesUserId })
      .orderBy('l.next_follow_time', 'ASC')
      .take(safeLimit)
      .skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  private buildLeadFilterQuery(filters: LeadFilterOptions) {
    const qb = this.leadRepository.createQueryBuilder('l');
    this.applyLeadScope(qb, filters);
    this.applyLeadFilters(qb, filters);
    return qb;
  }

  private applyLeadScope(qb: any, filters: LeadFilterOptions): void {
    const scope = filters.scope || 'all';
    const role = filters.actorRole || '';
    if (scope === 'self') {
      if (role === 'sales') {
        qb.andWhere('l.assigned_sales_user_id = :actorUserId', { actorUserId: filters.actorUserId || '' });
      } else {
        qb.andWhere('l.employee_id = :actorEmployeeId', { actorEmployeeId: filters.actorEmployeeId || '' });
      }
    } else if (scope === 'employee') {
      qb.andWhere('l.employee_id = :employeeId', { employeeId: filters.employeeId || '' });
    }
  }

  private applyLeadFilters(qb: any, filters: LeadFilterOptions): void {
    if (filters.accountId) qb.andWhere('l.account_id = :accountId', { accountId: filters.accountId });
    if (filters.platform) qb.andWhere('l.platform = :platform', { platform: filters.platform });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.addStatus) qb.andWhere('l.add_status = :addStatus', { addStatus: filters.addStatus });
    if (filters.processStatus) qb.andWhere('l.process_status = :processStatus', { processStatus: filters.processStatus });
    if (filters.search && filters.search.trim()) {
      qb.andWhere(
        '(l.contact_info LIKE :search OR l.nickname LIKE :search OR l.lead_code LIKE :search OR l.note LIKE :search)',
        { search: `%${filters.search.trim()}%` },
      );
    }
    if (filters.from) qb.andWhere('l.created_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('l.created_at < :to', { to: filters.to });
    if (filters.postType) {
      qb.andWhere(
        'l.post_id IN (SELECT p.id FROM posts p WHERE p.post_type = :postType)',
        { postType: filters.postType },
      );
    }
  }

  private generateLeadCode(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `L${ymd}-${random}`;
  }

  async create(dto: Partial<Lead>): Promise<void> {
    const leadId = (dto as any).id || makeId();
    const lead = this.leadRepository.create({
      ...dto,
      id: leadId,
      leadCode: dto.leadCode || this.generateLeadCode(),
      nickname: dto.nickname || '',
      salesUserName: dto.salesUserName || '',
      processStatus: dto.processStatus || 'not_contacted',
      addStatus: dto.addStatus || 'not_added',
    } as any);
    await this.leadRepository.save(lead);

    // §11.1 lead_assigned: 客资被直接分配给销售时通知销售。
    if (dto.assignedSalesUserId) {
      await this.notificationsService.create({
        receiverIds: [dto.assignedSalesUserId],
        senderId: null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: '新客资已分配',
        content: `客资 ${dto.contactInfo || ''} 已分配给您，请尽快跟进`,
        relatedId: leadId,
        relatedType: 'lead',
      });
    }
  }

  async update(id: string, dto: Partial<Lead>): Promise<void> {
    await this.leadRepository.update(id, dto);
  }

  async findOne(id: string, actor?: { actorUserId?: string; actorEmployeeId?: string; actorRole?: string }): Promise<any | null> {
    const row = await this.leadRepository.findOne({ where: { id } });
    if (!row) return null;
    const role = actor?.actorRole || '';
    const isAdminLike = role === 'admin' || role === 'owner';
    if (!isAdminLike && role === 'sales' && actor?.actorUserId && row.assignedSalesUserId !== actor.actorUserId) {
      return null;
    }
    if (!isAdminLike && role !== 'sales' && actor?.actorEmployeeId && row.employeeId !== actor.actorEmployeeId) {
      return null;
    }
    const latestCollaboration = await this.latestCollaborationByLeadIds([row.id]);
    return this.mapLead(row, undefined, latestCollaboration.get(row.id));
  }

  async updateBoard(id: string, dto: BoardPatchDto, actorUserId: string): Promise<void> {
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return;

    const next: Partial<Lead> = {};
    const normalized = this.normalizeBoardPatch(dto);
    if (normalized.status !== undefined) next.status = normalized.status || current.status;
    if (dto.assignedSalesUserId !== undefined) next.assignedSalesUserId = dto.assignedSalesUserId || null;
    if (dto.assignedSalesUserName !== undefined) next.assignedSalesUserName = dto.assignedSalesUserName || '';
    if (normalized.processStatus !== undefined) next.processStatus = normalized.processStatus || 'not_contacted';
    if (normalized.addStatus !== undefined) next.addStatus = normalized.addStatus || 'not_added';
    if (dto.intention !== undefined) next.intention = dto.intention || null;
    if (dto.intentionLevel !== undefined) next.intentionLevel = dto.intentionLevel || 'pending';
    if (dto.nextFollowTime !== undefined) {
      next.nextFollowTime = dto.nextFollowTime ? new Date(dto.nextFollowTime) : null;
    }
    this.applySalesStateTransition(current, next, normalized);
    const nextLeadStatus = this.resolveLeadStatus(current, normalized);
    if (nextLeadStatus) {
      next.status = nextLeadStatus;
    }

    const updateResult = await this.leadRepository.update(
      { id, updatedAt: current.updatedAt } as any,
      next,
    );
    if (!updateResult.affected) {
      throw new ConflictException('客资状态已被其他人更新，请刷新后重试');
    }

    // §11.1 customer_added / customer_not_passed: addStatus 关键变更回写来源运营。
    if (normalized.addStatus !== undefined && normalized.addStatus !== current.addStatus && current.employeeId) {
      // employeeId 在 leads 表里是 employees.id (来源运营对应的员工 ID)，但通知 receiver_id
      // 走 users 表。来源运营若关联了员工，他们 user 行的 employee_id == 员工 ID，
      // 因此用 raw query 由 employees.id 反查 users.id 兜底（找不到就跳过）。
      const sourceUserId = await this.findUserIdByEmployeeId(current.employeeId);
      if (sourceUserId) {
        if (normalized.addStatus === 'added') {
          await this.notificationsService.create({
            receiverIds: [sourceUserId],
            senderId: actorUserId || null,
            portType: 'operations',
            typeCode: NOTIFICATION_TYPES.CUSTOMER_ADDED,
            title: '客资已添加',
            content: `您来源的客资 ${current.contactInfo || ''} 已被销售添加`,
            relatedId: id,
            relatedType: 'lead',
          });
        } else if (normalized.addStatus === 'not_passed') {
          await this.notificationsService.create({
            receiverIds: [sourceUserId],
            senderId: actorUserId || null,
            portType: 'operations',
            typeCode: NOTIFICATION_TYPES.CUSTOMER_NOT_PASSED,
            title: '客户未通过',
            content: `您来源的客资 ${current.contactInfo || ''} 添加未通过`,
            relatedId: id,
            relatedType: 'lead',
          });
        }
      }
    }

    const keyFieldChanged =
      (dto.intentionLevel !== undefined && dto.intentionLevel !== current.intentionLevel) ||
      (normalized.processStatus !== undefined && normalized.processStatus !== current.processStatus) ||
      (dto.nextFollowTime !== undefined) ||
      (dto.followNote && dto.followNote.trim());

    if (!keyFieldChanged) return;

    const noteParts: string[] = [];
    if (dto.intentionLevel !== undefined && dto.intentionLevel !== current.intentionLevel) {
      noteParts.push(`意向度: ${current.intentionLevel || '-'} → ${dto.intentionLevel}`);
    }
    if (normalized.processStatus !== undefined && normalized.processStatus !== current.processStatus) {
      noteParts.push(`处理状态: ${current.processStatus || '-'} → ${normalized.processStatus}`);
    }
    if (dto.followNote && dto.followNote.trim()) {
      noteParts.push(dto.followNote.trim());
    }

    await this.followRepository.save({
      id: makeId(),
      leadId: id,
      userId: actorUserId,
      followType: dto.followType || '微信',
      content: noteParts.join(' | ') || '(状态变更)',
      nextFollowTime: dto.nextFollowTime ? new Date(dto.nextFollowTime) : null,
    });
  }

  async addFollowRecord(leadId: string, actorUserId: string, dto: FollowRecordDto): Promise<void> {
    if (!dto.content || !dto.content.trim()) {
      throw new Error('content required');
    }
    const current = await this.leadRepository.findOne({ where: { id: leadId } });
    if (!current) throw new Error('lead not found');
    const normalized = this.normalizeFollowRecord(dto);

    await this.followRepository.save({
      id: makeId(),
      leadId,
      userId: actorUserId,
      followType: dto.followType || '微信',
      content: dto.content.trim(),
      nextFollowTime: dto.nextFollowTime ? new Date(dto.nextFollowTime) : null,
    });
    const patch: Partial<Lead> = {};
    if (dto.nextFollowTime !== undefined) {
      patch.nextFollowTime = dto.nextFollowTime ? new Date(dto.nextFollowTime) : null;
    }
    if (normalized.processStatus !== undefined) patch.processStatus = normalized.processStatus || 'not_contacted';
    if (dto.intention !== undefined) patch.intention = dto.intention || null;
    if (dto.intentionLevel !== undefined) patch.intentionLevel = dto.intentionLevel || 'pending';
    this.applySalesStateTransition(current, patch, normalized);
    if (Object.keys(patch).length > 0) {
      await this.leadRepository.update(leadId, patch);
    }
  }

  async updateSalesStatus(id: string, dto: BoardPatchDto, actorUserId: string): Promise<any | null> {
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return null;

    await this.updateBoard(id, dto, actorUserId);
    const updated = await this.leadRepository.findOne({ where: { id } });
    if (updated) {
      await this.operationLogsService.log({
        userId: actorUserId || '',
        action: 'lead_status_update',
        targetType: 'lead',
        targetId: id,
        detail: JSON.stringify({
          from: {
            status: current.status,
            processStatus: current.processStatus,
            addStatus: current.addStatus,
            intentionLevel: current.intentionLevel,
          },
          to: {
            status: updated.status,
            processStatus: updated.processStatus,
            addStatus: updated.addStatus,
            intentionLevel: updated.intentionLevel,
          },
        }),
      });
    }
    if (!updated) return null;
    const latestCollaboration = await this.latestCollaborationByLeadIds([updated.id]);
    return this.mapLead(updated, undefined, latestCollaboration.get(updated.id));
  }

  private applySalesStateTransition(current: Lead, next: Partial<Lead>, dto: BoardPatchDto | FollowRecordDto): void {
    const nextAddStatus = next.addStatus ?? current.addStatus;
    const nextProcessStatus = next.processStatus ?? current.processStatus;
    const hasText =
      ('followNote' in dto && Boolean(dto.followNote?.trim())) ||
      ('content' in dto && Boolean(dto.content?.trim()));
    const hasFollowSignal =
      hasText ||
      dto.nextFollowTime !== undefined ||
      nextProcessStatus !== current.processStatus ||
      nextAddStatus !== current.addStatus;

    if (nextAddStatus === 'added') {
      next.status = 'added_success';
      return;
    }
    if (nextAddStatus === 'not_passed' || nextAddStatus === 'rejected' || nextProcessStatus === 'invalid') {
      next.status = 'invalid';
      if (nextAddStatus === 'rejected') next.addStatus = 'not_passed';
      return;
    }
    if (!next.status && hasFollowSignal && current.status !== 'in_collaboration' && current.status !== 'operation_handled') {
      next.status = 'in_followup';
    }
  }

  private resolveLeadStatus(current: Lead, dto: BoardPatchDto): string | null {
    if (dto.status !== undefined) return dto.status || current.status;
    if (dto.processStatus === 'invalid') return 'invalid';
    if (dto.addStatus === 'added') return 'added_success';
    if (dto.processStatus === 'in_collaboration') return 'in_collaboration';
    if (dto.processStatus === 'operation_handled') return 'operation_handled';
    const hasSalesAction =
      dto.processStatus !== undefined ||
      dto.addStatus !== undefined ||
      Boolean(dto.followNote && dto.followNote.trim());
    if (hasSalesAction && current.status !== 'in_collaboration') {
      return 'in_followup';
    }
    return null;
  }

  private normalizeBoardPatch(dto: BoardPatchDto): BoardPatchDto {
    return {
      ...dto,
      status: this.normalizeStatusValue('status', dto.status),
      addStatus: this.normalizeStatusValue('addStatus', dto.addStatus),
      processStatus: this.normalizeStatusValue('processStatus', dto.processStatus),
    };
  }

  private normalizeFollowRecord(dto: FollowRecordDto): FollowRecordDto {
    return {
      ...dto,
      processStatus: this.normalizeStatusValue('processStatus', dto.processStatus),
    };
  }

  private normalizeStatusValue(kind: 'status' | 'addStatus' | 'processStatus', value?: string): string | undefined {
    if (value === undefined || value === '') return value;
    const trimmed = String(value).trim();
    const aliases = kind === 'status' ? STATUS_ALIASES : kind === 'addStatus' ? ADD_STATUS_ALIASES : PROCESS_STATUS_ALIASES;
    const normalized = aliases[trimmed] || trimmed;
    const allowed = kind === 'status' ? LEAD_STATUS_CODES : kind === 'addStatus' ? ADD_STATUS_CODES : PROCESS_STATUS_CODES;
    if (!allowed.has(normalized)) {
      throw new BadRequestException(`invalid ${kind}: ${trimmed}`);
    }
    return normalized;
  }

  async canAccessLead(leadId: string, actor?: { actorUserId?: string; actorEmployeeId?: string; actorRole?: string }): Promise<boolean> {
    if (!leadId) return false;
    const row = await this.leadRepository.findOne({ where: { id: leadId } });
    if (!row) return false;
    const role = actor?.actorRole || '';
    if (role === 'admin' || role === 'owner') return true;
    if (role === 'sales') return Boolean(actor?.actorUserId && row.assignedSalesUserId === actor.actorUserId);
    return Boolean(actor?.actorEmployeeId && row.employeeId === actor.actorEmployeeId);
  }

  async listFollowRecords(leadId: string, limit = 50, offset = 0): Promise<any[]> {
    const lead = await this.leadRepository.findOne({ where: { id: leadId } });
    const rows = await this.followRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      take: this.clampLimit(limit),
      skip: Math.max(Number(offset) || 0, 0),
    });
    return rows.map((r) => this.mapFollowRecord(r, lead || undefined));
  }

  /**
   * Paged variant: same query as listFollowRecords but also returns total count
   * so the frontend can drive "load more" / total badges. Controllers call this
   * when the request actually carries limit/offset; the array-returning version
   * stays around so existing callers that `await api(...)` and treat the result
   * as an array don't break.
   */
  async listFollowRecordsPaged(
    leadId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.followRepository.findAndCount({
      where: { leadId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    const lead = await this.leadRepository.findOne({ where: { id: leadId } });
    return {
      items: rows.map((r) => this.mapFollowRecord(r, lead || undefined)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private mapFollowRecord(r: LeadFollowRecord, lead?: Lead): any {
    return {
      id: r.id,
      leadId: r.leadId,
      userId: r.userId,
      followType: r.followType,
      content: r.content,
      nextFollowTime: r.nextFollowTime,
      nextFollowAt: r.nextFollowTime,
      processStatus: lead?.processStatus,
      intentionLevel: lead?.intentionLevel,
      leadStatus: lead?.status,
      createdAt: r.createdAt,
    };
  }

  async remove(id: string): Promise<void> {
    await this.leadRepository.delete(id);
  }

  // ---------- 被动添加客资识别（passive） ----------

  /**
   * §4.3 加权打分的候选客资匹配，返回 Top 5。
   * - phone 精确 +50
   * - wechat 精确 +50
   * - nickname 模糊 +20
   * - 创建时间在 7 天内 +15
   * - 来源运营 = 当前操作人对应的员工 ID +10
   */
  async findPassiveCandidates(params: {
    phone?: string;
    wechat?: string;
    nickname?: string;
    actorEmployeeId?: string;
  }): Promise<any[]> {
    const phone = (params.phone || '').trim();
    const wechat = (params.wechat || '').trim();
    const nickname = (params.nickname || '').trim();
    const actorEmployeeId = (params.actorEmployeeId || '').trim();

    if (!phone && !wechat && !nickname) {
      return [];
    }

    const qb = this.leadRepository.createQueryBuilder('l');

    const scoreExpr =
      `(CASE WHEN :phone <> '' AND l.contact_info = :phone THEN 50 ELSE 0 END)` +
      ` + (CASE WHEN :wechat <> '' AND l.contact_info = :wechat THEN 50 ELSE 0 END)` +
      ` + (CASE WHEN :nicknameRaw <> '' AND l.nickname LIKE :nicknameLike THEN 20 ELSE 0 END)` +
      ` + (CASE WHEN l.created_at >= (NOW() - INTERVAL 7 DAY) THEN 15 ELSE 0 END)` +
      ` + (CASE WHEN :actorEmployeeId <> '' AND l.employee_id = :actorEmployeeId THEN 10 ELSE 0 END)`;

    qb.addSelect(scoreExpr, 'score');
    qb.setParameters({
      phone,
      wechat,
      nicknameRaw: nickname,
      nicknameLike: `%${nickname}%`,
      actorEmployeeId,
    });

    // 任一字段命中再进入排序，避免全表扫描
    const whereParts: string[] = [];
    if (phone) whereParts.push('l.contact_info = :phone');
    if (wechat) whereParts.push('l.contact_info = :wechat');
    if (nickname) whereParts.push('l.nickname LIKE :nicknameLike');
    if (whereParts.length > 0) {
      qb.where(`(${whereParts.join(' OR ')})`);
    }

    qb.orderBy('score', 'DESC')
      .addOrderBy('l.created_at', 'DESC')
      .limit(5);

    const raw = await qb.getRawAndEntities();
    return raw.entities.map((row, idx) => {
      const mapped = this.mapLead(row);
      const scoreVal = Number(raw.raw[idx]?.score) || 0;
      return { ...mapped, score: scoreVal };
    });
  }

  async findPassiveCandidatesPaged(params: {
    phone?: string;
    wechat?: string;
    nickname?: string;
    actorEmployeeId?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const phone = (params.phone || '').trim();
    const wechat = (params.wechat || '').trim();
    const nickname = (params.nickname || '').trim();
    const actorEmployeeId = (params.actorEmployeeId || '').trim();

    if (!phone && !wechat && !nickname) {
      return { items: [], total: 0, limit: params.limit, offset: params.offset };
    }

    const safeLimit = this.clampLimit(params.limit);
    const safeOffset = Math.max(Number(params.offset) || 0, 0);

    const qb = this.leadRepository.createQueryBuilder('l');

    const scoreExpr =
      `(CASE WHEN :phone <> '' AND l.contact_info = :phone THEN 50 ELSE 0 END)` +
      ` + (CASE WHEN :wechat <> '' AND l.contact_info = :wechat THEN 50 ELSE 0 END)` +
      ` + (CASE WHEN :nicknameRaw <> '' AND l.nickname LIKE :nicknameLike THEN 20 ELSE 0 END)` +
      ` + (CASE WHEN l.created_at >= (NOW() - INTERVAL 7 DAY) THEN 15 ELSE 0 END)` +
      ` + (CASE WHEN :actorEmployeeId <> '' AND l.employee_id = :actorEmployeeId THEN 10 ELSE 0 END)`;

    qb.addSelect(scoreExpr, 'score');
    qb.setParameters({
      phone,
      wechat,
      nicknameRaw: nickname,
      nicknameLike: `%${nickname}%`,
      actorEmployeeId,
    });

    const whereParts: string[] = [];
    if (phone) whereParts.push('l.contact_info = :phone');
    if (wechat) whereParts.push('l.contact_info = :wechat');
    if (nickname) whereParts.push('l.nickname LIKE :nicknameLike');
    if (whereParts.length > 0) {
      qb.where(`(${whereParts.join(' OR ')})`);
    }

    qb.orderBy('score', 'DESC')
      .addOrderBy('l.created_at', 'DESC')
      .limit(safeLimit)
      .offset(safeOffset);

    const raw = await qb.getRawAndEntities();
    const items = raw.entities.map((row, idx) => {
      const mapped = this.mapLead(row);
      const scoreVal = Number(raw.raw[idx]?.score) || 0;
      return { ...mapped, score: scoreVal };
    });

    const countQb = this.leadRepository.createQueryBuilder('l');
    countQb.setParameters({
      phone,
      wechat,
      nicknameRaw: nickname,
      nicknameLike: `%${nickname}%`,
      actorEmployeeId,
    });
    if (whereParts.length > 0) {
      countQb.where(`(${whereParts.join(' OR ')})`);
    }
    const total = await countQb.getCount();

    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  /**
   * §4.3 销售选定候选客资 → 绑定为被动添加。
   */
  async bindPassive(params: {
    leadId: string;
    contact: string;
    salesFeedback?: string;
    actorUserId: string;
    actorUserName: string;
  }): Promise<{ ok: boolean; leadId: string; lead_code: string | null }> {
    const { leadId, contact, salesFeedback, actorUserId, actorUserName } = params;
    if (!leadId) throw new Error('leadId required');

    const current = await this.leadRepository.findOne({ where: { id: leadId } });
    if (!current) {
      throw new Error('lead not found');
    }

    const patch: Partial<Lead> = {
      addMethod: 'passive',
      addStatus: 'added',
      assignedSalesUserId: actorUserId || null,
      assignedSalesUserName: actorUserName || '',
    };
    const trimmedContact = (contact || '').trim();
    if (trimmedContact && trimmedContact !== current.contactInfo) {
      patch.contactInfo = trimmedContact;
    }

    await this.leadRepository.update(leadId, patch);

    await this.followRepository.save({
      id: makeId(),
      leadId,
      userId: actorUserId || '',
      followType: '微信',
      content: `[被动添加绑定] ${salesFeedback || '客户主动加销售并已通过'}`,
      nextFollowTime: null,
    });

    return { ok: true, leadId, lead_code: current.leadCode || null };
  }

  /**
   * §4.3 匹配不到候选 → 新建被动客资（source_unknown=1，待运营确认来源）。
   */
  async createPassive(params: {
    contact: string;
    nickname?: string;
    platform?: string;
    salesFeedback?: string;
    actorUserId: string;
    actorUserName: string;
  }): Promise<{ ok: boolean; leadId: string; lead_code: string | null }> {
    const { contact, nickname, platform, salesFeedback, actorUserId, actorUserName } = params;
    const trimmedContact = (contact || '').trim();
    if (!trimmedContact) throw new Error('contact required');

    const leadId = makeId();
    const lead = this.leadRepository.create({
      id: leadId,
      leadCode: this.generateLeadCode(),
      employeeId: '',
      accountId: '',
      contactInfo: trimmedContact,
      nickname: (nickname || '').trim(),
      platform: (platform || 'unknown').trim() || 'unknown',
      addMethod: 'passive',
      addStatus: 'added',
      sourceUnknown: 1,
      status: 'contact_added',
      assignedSalesUserId: actorUserId || null,
      assignedSalesUserName: actorUserName || '',
      processStatus: 'chatting',
      intentionLevel: 'pending',
      note: `[被动添加新建] ${salesFeedback || ''}`,
    } as Partial<Lead>);

    await this.leadRepository.save(lead);

    await this.followRepository.save({
      id: makeId(),
      leadId,
      userId: actorUserId || '',
      followType: '微信',
      content: `[被动添加新建] ${salesFeedback || '客户主动加销售并已通过'}`,
      nextFollowTime: null,
    });

    const saved = await this.leadRepository.findOne({ where: { id: leadId } });
    return { ok: true, leadId, lead_code: saved?.leadCode || null };
  }

  /**
   * §4.3 运营在看板确认被动客资来源 → 绑定 matched_post_id / 来源运营。
   * 同时回填 account_id（按作品 → 账号），并触发 lead_source_confirmed 通知销售。
   */
  async confirmSource(params: {
    id: string;
    matchedPostId: string;
    sourceOperatorId: string;
    actorUserId?: string;
  }): Promise<{ ok: boolean }> {
    const { id, matchedPostId, sourceOperatorId, actorUserId } = params;
    if (!id) throw new Error('id required');
    if (!matchedPostId) throw new Error('matchedPostId required');
    if (!sourceOperatorId) throw new Error('sourceOperatorId required');

    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) throw new Error('lead not found');

    const patch: Partial<Lead> = {
      matchedPostId,
      employeeId: sourceOperatorId,
      sourceUnknown: 0,
    };

    // 回填 account_id（如能根据作品查到）
    const post = await this.postRepository.findOne({ where: { id: matchedPostId } });
    if (post && post.accountId) {
      patch.accountId = post.accountId;
    }

    await this.leadRepository.update(id, patch);

    // §11.1 lead_source_confirmed: 运营确认来源后通知销售
    if (current.assignedSalesUserId) {
      await this.notificationsService.create({
        receiverIds: [current.assignedSalesUserId],
        senderId: actorUserId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.LEAD_SOURCE_CONFIRMED,
        title: '客资来源已确认',
        content: `客资 ${current.contactInfo || ''} 的来源已被运营确认`,
        relatedId: id,
        relatedType: 'lead',
      });
    }

    return { ok: true };
  }

  async stats(opts: {
    scope?: 'self' | 'employee' | 'all';
    employeeId?: string;
    period?: 'today' | 'week' | 'month' | 'custom';
    from?: string;
    to?: string;
    actorEmployeeId?: string;
    actorUserId?: string;
    actorRole?: string;
    // T-L2/L3 看板五个筛选维度 —— 与列表筛选保持口径一致（AC-3.2）
    accountId?: string;
    platform?: string;
    postType?: string;
    status?: string;
    addStatus?: string;
    processStatus?: string;
  }): Promise<any> {
    const scope = opts.scope || 'all';
    const scopeFilters: LeadFilterOptions = {
      scope,
      employeeId: opts.employeeId,
      actorEmployeeId: opts.actorEmployeeId,
      actorUserId: opts.actorUserId,
      actorRole: opts.actorRole,
    };

    if (scope === 'self') {
      if (opts.actorRole === 'sales' && !opts.actorUserId) {
        return this.emptyStats();
      }
      if (opts.actorRole !== 'sales' && !opts.actorEmployeeId) {
        return this.emptyStats();
      }
    } else if (scope === 'employee') {
      if (!opts.employeeId) {
        return this.emptyStats();
      }
    }

    const { from, to } = this.resolvePeriod(opts.period, opts.from, opts.to);

    // qbBase: 只受 scope（employee_id）+ period（created_at）约束 → 用于 total（"本月/本周/今天 全量"）
    // qb: 在 qbBase 基础上叠加账号/平台/作品类型/status/addStatus 等列表筛选维度 → 用于 filteredTotal
    // §6 / AC-3.1 vs AC-3.2: total 与 filteredTotal 必须可拆开，分别给"汇总卡片"和"筛选条数"
    const qbBase = this.leadRepository.createQueryBuilder('l');
    this.applyLeadScope(qbBase, scopeFilters);
    if (from) qbBase.andWhere('l.created_at >= :from', { from });
    if (to) qbBase.andWhere('l.created_at < :to', { to });

    const qb = qbBase.clone();
    this.applyLeadFilters(qb, {
      accountId: opts.accountId,
      platform: opts.platform,
      postType: opts.postType,
      status: opts.status,
      addStatus: opts.addStatus,
      processStatus: opts.processStatus,
    });

    const total = await qbBase.getCount();
    const filteredTotal = await qb.getCount();

    const byStatus = await qb.clone()
      .select('l.status', 'k')
      .addSelect('COUNT(*)', 'n')
      .groupBy('l.status')
      .getRawMany();

    const byIntention = await qb.clone()
      .select('l.intention_level', 'k')
      .addSelect('COUNT(*)', 'n')
      .groupBy('l.intention_level')
      .getRawMany();

    const byProcess = await qb.clone()
      .select('l.process_status', 'k')
      .addSelect('COUNT(*)', 'n')
      .groupBy('l.process_status')
      .getRawMany();

    // T-L1/L4 byAddStatus 给"未添加/已添加"统计卡片做后端口径
    const byAddStatus = await qb.clone()
      .select('l.add_status', 'k')
      .addSelect('COUNT(*)', 'n')
      .groupBy('l.add_status')
      .getRawMany();

    const assigned = await qb.clone()
      .andWhere('l.assigned_sales_user_id IS NOT NULL AND l.assigned_sales_user_id != \'\'')
      .getCount();

    const pending = await qb.clone()
      .andWhere('l.process_status IN (:...codes)', { codes: ['not_contacted', 'applied', 'pending'] })
      .getCount();

    return {
      total,
      filteredTotal,
      assigned,
      pending,
      byStatus: this.toCountMap(byStatus),
      byIntention: this.toCountMap(byIntention),
      byProcess: this.toCountMap(byProcess),
      byAddStatus: this.toCountMap(byAddStatus),
      scope,
      period: opts.period || 'all',
      from: from ?? null,
      to: to ?? null,
      // 回显筛选条件方便前端校验
      filters: {
        employeeId: opts.employeeId || null,
        accountId: opts.accountId || null,
        platform: opts.platform || null,
        postType: opts.postType || null,
        status: opts.status || null,
        addStatus: opts.addStatus || null,
        processStatus: opts.processStatus || null,
      },
    };
  }

  private emptyStats() {
    return {
      total: 0, filteredTotal: 0, assigned: 0, pending: 0,
      byStatus: {}, byIntention: {}, byProcess: {}, byAddStatus: {},
      filters: {},
    };
  }

  private toCountMap(rows: Array<{ k: string | null; n: any }>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) {
      const key = r.k == null ? '_null' : String(r.k);
      out[key] = Number(r.n) || 0;
    }
    return out;
  }

  private resolvePeriod(
    period?: string,
    from?: string,
    to?: string,
  ): { from: string | null; to: string | null } {
    if (period === 'custom') return { from: from || null, to: to || null };
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'today') {
      const end = new Date(startOfDay.getTime() + 86400 * 1000);
      return { from: this.fmt(startOfDay), to: this.fmt(end) };
    }
    if (period === 'week') {
      const day = startOfDay.getDay() || 7;
      const monday = new Date(startOfDay.getTime() - (day - 1) * 86400 * 1000);
      const next = new Date(monday.getTime() + 7 * 86400 * 1000);
      return { from: this.fmt(monday), to: this.fmt(next) };
    }
    if (period === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: this.fmt(first), to: this.fmt(next) };
    }
    return { from: null, to: null };
  }

  private fmt(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private async mapLeads(rows: Lead[]): Promise<any[]> {
    if (rows.length === 0) return [];
    const latest = rows.length <= 200
      ? await this.latestFollowByLeadIds(rows.map((row) => row.id))
      : new Map<string, LeadFollowRecord>();
    const latestCollaboration = rows.length <= 200
      ? await this.latestCollaborationByLeadIds(rows.map((row) => row.id))
      : new Map<string, CollaborationTask>();
    return rows.map((row) => this.mapLead(row, latest.get(row.id), latestCollaboration.get(row.id)));
  }

  private async latestFollowByLeadIds(leadIds: string[]): Promise<Map<string, LeadFollowRecord>> {
    const ids = Array.from(new Set(leadIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const rows = await this.followRepository.find({
      where: { leadId: In(ids) },
      order: { createdAt: 'DESC' },
    });
    const latest = new Map<string, LeadFollowRecord>();
    for (const row of rows) {
      if (!latest.has(row.leadId)) {
        latest.set(row.leadId, row);
      }
    }
    return latest;
  }

  private async latestCollaborationByLeadIds(leadIds: string[]): Promise<Map<string, CollaborationTask>> {
    const ids = Array.from(new Set(leadIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const rows = await this.collaborationRepository.find({
      where: { leadId: In(ids) },
      order: { requestedAt: 'DESC' },
    });
    const latest = new Map<string, CollaborationTask>();
    for (const row of rows) {
      if (!latest.has(row.leadId)) {
        latest.set(row.leadId, row);
      }
    }
    return latest;
  }

  private mapLead(row: Lead, latestFollow?: LeadFollowRecord, latestCollaboration?: CollaborationTask): any {
    return {
      id: row.id,
      employeeId: row.employeeId,
      operatorId: row.employeeId,
      operatorName: row.salesUserName || row.assignedSalesUserName || null,
      accountId: row.accountId,
      postId: row.postId,
      platform: row.platform,
      contactInfo: row.contactInfo,
      nickname: row.nickname,
      budget: row.budget,
      majorContent: row.majorContent,
      ip: row.ip,
      status: row.status,
      dealAmount: row.dealAmount,
      note: row.note,
      captureImageUrl: row.captureImageUrl,
      salesFeedback: row.salesFeedback,
      salesUpdatedAt: row.salesUpdatedAt,
      salesUserName: row.salesUserName,
      assignedSalesUserId: row.assignedSalesUserId,
      assignedSalesUserName: row.assignedSalesUserName,
      processStatus: row.processStatus,
      collaborationStatus: latestCollaboration?.status || 'none',
      addStatus: row.addStatus,
      intention: row.intention,
      leadCode: row.leadCode,
      intentionLevel: row.intentionLevel,
      addMethod: row.addMethod,
      nextFollowTime: row.nextFollowTime,
      nextFollowAt: row.nextFollowTime,
      matchedPostId: row.matchedPostId,
      sourceUnknown: !!row.sourceUnknown,
      latestFollowNote: latestFollow?.content || row.salesFeedback || row.note || null,
      latestFollowAt: latestFollow?.createdAt || row.salesUpdatedAt || row.updatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
