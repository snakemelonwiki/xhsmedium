import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { LeadFollowRecord } from '../../entities/lead-follow-record.entity';
import { Post } from '../../entities/post.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

interface BoardPatchDto {
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
}

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
    private readonly notificationsService: NotificationsService,
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
    return rows.map(this.mapLead);
  }

  async findByEmployee(employeeId: string): Promise<any[]> {
    const rows = await this.leadRepository.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(this.mapLead);
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
    return { items: rows.map(this.mapLead), total, limit: safeLimit, offset: safeOffset };
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
    return { items: rows.map(this.mapLead), total, limit: safeLimit, offset: safeOffset };
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
    return rows.map(this.mapLead);
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
    return { items: rows.map(this.mapLead), total, limit: safeLimit, offset: safeOffset };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async create(dto: Partial<Lead>): Promise<void> {
    const leadId = (dto as any).id || makeId();
    const lead = this.leadRepository.create({
      ...dto,
      id: leadId,
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

  async updateBoard(id: string, dto: BoardPatchDto, actorUserId: string): Promise<void> {
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return;

    const next: Partial<Lead> = {};
    if (dto.assignedSalesUserId !== undefined) next.assignedSalesUserId = dto.assignedSalesUserId || null;
    if (dto.assignedSalesUserName !== undefined) next.assignedSalesUserName = dto.assignedSalesUserName || '';
    if (dto.processStatus !== undefined) next.processStatus = dto.processStatus || 'not_contacted';
    if (dto.addStatus !== undefined) next.addStatus = dto.addStatus || 'not_added';
    if (dto.intention !== undefined) next.intention = dto.intention || null;
    if (dto.intentionLevel !== undefined) next.intentionLevel = dto.intentionLevel || 'pending';
    if (dto.nextFollowTime !== undefined) {
      next.nextFollowTime = dto.nextFollowTime ? new Date(dto.nextFollowTime) : null;
    }

    await this.leadRepository.update(id, next);

    // §11.1 customer_added / customer_not_passed: addStatus 关键变更回写来源运营。
    if (dto.addStatus !== undefined && dto.addStatus !== current.addStatus && current.employeeId) {
      // employeeId 在 leads 表里是 employees.id (来源运营对应的员工 ID)，但通知 receiver_id
      // 走 users 表。来源运营若关联了员工，他们 user 行的 employee_id == 员工 ID，
      // 因此用 raw query 由 employees.id 反查 users.id 兜底（找不到就跳过）。
      const sourceUserId = await this.findUserIdByEmployeeId(current.employeeId);
      if (sourceUserId) {
        if (dto.addStatus === 'added') {
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
        } else if (dto.addStatus === 'rejected') {
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
      (dto.processStatus !== undefined && dto.processStatus !== current.processStatus) ||
      (dto.nextFollowTime !== undefined) ||
      (dto.followNote && dto.followNote.trim());

    if (!keyFieldChanged) return;

    const noteParts: string[] = [];
    if (dto.intentionLevel !== undefined && dto.intentionLevel !== current.intentionLevel) {
      noteParts.push(`意向度: ${current.intentionLevel || '-'} → ${dto.intentionLevel}`);
    }
    if (dto.processStatus !== undefined && dto.processStatus !== current.processStatus) {
      noteParts.push(`处理状态: ${current.processStatus || '-'} → ${dto.processStatus}`);
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
    await this.followRepository.save({
      id: makeId(),
      leadId,
      userId: actorUserId,
      followType: dto.followType || '微信',
      content: dto.content.trim(),
      nextFollowTime: dto.nextFollowTime ? new Date(dto.nextFollowTime) : null,
    });
    if (dto.nextFollowTime !== undefined) {
      await this.leadRepository.update(leadId, {
        nextFollowTime: dto.nextFollowTime ? new Date(dto.nextFollowTime) : null,
      });
    }
  }

  async listFollowRecords(leadId: string, limit = 50, offset = 0): Promise<any[]> {
    const rows = await this.followRepository.find({
      where: { leadId },
      order: { createdAt: 'DESC' },
      take: this.clampLimit(limit),
      skip: Math.max(Number(offset) || 0, 0),
    });
    return rows.map((r) => this.mapFollowRecord(r));
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
    return {
      items: rows.map((r) => this.mapFollowRecord(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private mapFollowRecord(r: LeadFollowRecord): any {
    return {
      id: r.id,
      leadId: r.leadId,
      userId: r.userId,
      followType: r.followType,
      content: r.content,
      nextFollowTime: r.nextFollowTime,
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
    // T-L2/L3 看板五个筛选维度 —— 与列表筛选保持口径一致（AC-3.2）
    accountId?: string;
    platform?: string;
    postType?: string;
    status?: string;
    addStatus?: string;
  }): Promise<any> {
    const scope = opts.scope || 'all';
    const where: any = {};

    if (scope === 'self') {
      if (!opts.actorEmployeeId) {
        return this.emptyStats();
      }
      where.employeeId = opts.actorEmployeeId;
    } else if (scope === 'employee') {
      if (!opts.employeeId) {
        return this.emptyStats();
      }
      where.employeeId = opts.employeeId;
    }

    const { from, to } = this.resolvePeriod(opts.period, opts.from, opts.to);

    // qbBase: 只受 scope（employee_id）+ period（created_at）约束 → 用于 total（"本月/本周/今天 全量"）
    // qb: 在 qbBase 基础上叠加账号/平台/作品类型/status/addStatus 等列表筛选维度 → 用于 filteredTotal
    // §6 / AC-3.1 vs AC-3.2: total 与 filteredTotal 必须可拆开，分别给"汇总卡片"和"筛选条数"
    const qbBase = this.leadRepository.createQueryBuilder('l');
    if (where.employeeId) qbBase.andWhere('l.employee_id = :eid', { eid: where.employeeId });
    if (from) qbBase.andWhere('l.created_at >= :from', { from });
    if (to) qbBase.andWhere('l.created_at < :to', { to });

    const qb = qbBase.clone();
    if (opts.accountId) qb.andWhere('l.account_id = :accountId', { accountId: opts.accountId });
    if (opts.platform) qb.andWhere('l.platform = :platform', { platform: opts.platform });
    if (opts.status) qb.andWhere('l.status = :status', { status: opts.status });
    if (opts.addStatus) qb.andWhere('l.add_status = :addStatus', { addStatus: opts.addStatus });
    // postType 在 leads 表里不存，要 join posts；当前没建索引，简化为 IN 子查询
    if (opts.postType) {
      qb.andWhere(
        'l.post_id IN (SELECT p.id FROM posts p WHERE p.post_type = :postType)',
        { postType: opts.postType },
      );
    }

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

  private mapLead(row: Lead): any {
    return {
      id: row.id,
      employeeId: row.employeeId,
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
      addStatus: row.addStatus,
      intention: row.intention,
      leadCode: row.leadCode,
      intentionLevel: row.intentionLevel,
      addMethod: row.addMethod,
      nextFollowTime: row.nextFollowTime,
      matchedPostId: row.matchedPostId,
      sourceUnknown: !!row.sourceUnknown,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
