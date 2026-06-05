import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Lead } from '../../entities/lead.entity';
import { LeadFollowRecord } from '../../entities/lead-follow-record.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
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
  // v1.3 / SA-1 + CROSS-2：销售"写跟进"扩展字段，回写到 leads 自身
  clientDegree?: string | null;
  clientRequirement?: string | null;
  clientMajorResearch?: string | null;
  clientTimeRequirement?: string | null;
  objectionPoint?: string | null;
  followAction?: string | null;
  followActionAt?: string | Date | null;
  requirementNote?: string | null;
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
  // BUG-2: 新增筛选字段
  assignedSalesUserId?: string;
  postId?: string;
  dealStatus?: string;
}

const LEAD_STATUS_IN_COLLABORATION = 'in_collaboration';
const LEAD_STATUS_OPERATION_HANDLED = 'operation_handled';
const ADD_STATUS_OPERATION_REMINDED = 'operation_reminded';

const LEAD_STATUS_CODES = new Set(['new', 'assigned', 'in_followup', LEAD_STATUS_IN_COLLABORATION, LEAD_STATUS_OPERATION_HANDLED, 'added_success', 'deal_done', 'invalid']);
const ADD_STATUS_CODES = new Set(['not_added', 'applied', 'not_passed', ADD_STATUS_OPERATION_REMINDED, 'added']);
const PROCESS_STATUS_CODES = new Set(['not_contacted', 'waiting_pass', 'communicating', 'quoted', 'deal_pending', 'deal_done', 'invalid']);

// v1.3 / SA-3 销售"更新成交状态" + "更新意向程度" 端点合法值。
// 成交状态：not_deal 未成交 / deal_pending 待成交 / deal_done 已成交 / refunded 已退款 / invalid 无效
const DEAL_STATUS_CODES = new Set(['not_deal', 'deal_pending', 'deal_done', 'refunded', 'invalid']);
// 意向程度（与 leads.intention_level 对齐；前端选择 high/mid/low/invalid/pending）
const INTENTION_LEVEL_CODES = new Set(['high', 'mid', 'low', 'invalid', 'pending']);

const STATUS_ALIASES: Record<string, string> = {
  contact_added: 'added_success',
  added: 'added_success',
  rejected: 'invalid',
  in_collaboration: LEAD_STATUS_IN_COLLABORATION,
  operation_handled: LEAD_STATUS_OPERATION_HANDLED,
  '新客资': 'new',
  '已分配': 'assigned',
  '跟进中': 'in_followup',
  '协同中': LEAD_STATUS_IN_COLLABORATION,
  '运营已处理': LEAD_STATUS_OPERATION_HANDLED,
  '已添加通过': 'added_success',
  '无效客资': 'invalid',
};

const ADD_STATUS_ALIASES: Record<string, string> = {
  rejected: 'not_passed',
  waiting_pass: 'applied',
  operation_reminded: ADD_STATUS_OPERATION_REMINDED,
  '未添加': 'not_added',
  '已申请添加': 'applied',
  '客户未通过': 'not_passed',
  '运营已提醒': ADD_STATUS_OPERATION_REMINDED,
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
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
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

    // Step 1+2: 合并主查询与 count —— 用 COUNT(*) OVER() window function 一次拿 items + total
    // 使用纯 raw select 避免 Entity 映射问题
    const dataQb = this.leadRepository.createQueryBuilder('l')
      .leftJoin(Account, 'a', 'a.id = l.account_id')
      .leftJoin(Post, 'p', 'p.id = l.post_id')
      .leftJoin('employees', 'e', 'e.id = l.employee_id')
      .select([
        'l.id AS l_id',
        'l.employee_id AS l_employee_id',
        'l.account_id AS l_account_id',
        'l.post_id AS l_post_id',
        'l.platform AS l_platform',
        'l.contact_info AS l_contact_info',
        'l.nickname AS l_nickname',
        'l.budget AS l_budget',
        'l.major_content AS l_major_content',
        'l.ip AS l_ip',
        'l.status AS l_status',
        'l.deal_amount AS l_deal_amount',
        'l.note AS l_note',
        'l.capture_image_url AS l_capture_image_url',
        'l.sales_feedback AS l_sales_feedback',
        'l.sales_updated_at AS l_sales_updated_at',
        'l.sales_user_name AS l_sales_user_name',
        'l.assigned_sales_user_id AS l_assigned_sales_user_id',
        'l.assigned_sales_user_name AS l_assigned_sales_user_name',
        'l.process_status AS l_process_status',
        'l.add_status AS l_add_status',
        'l.intention AS l_intention',
        'l.lead_code AS l_lead_code',
        'l.intention_level AS l_intention_level',
        'l.add_method AS l_add_method',
        'l.next_follow_time AS l_next_follow_time',
        'l.matched_post_id AS l_matched_post_id',
        'l.source_unknown AS l_source_unknown',
        'l.created_at AS l_created_at',
        'l.updated_at AS l_updated_at',
        'l.deal_status AS l_deal_status',
        'l.requirement_note AS l_requirement_note',
        'l.supervisor_note AS l_supervisor_note',
        // v1.3 / CROSS-1 客资分流标志
        'l.is_dispatched AS l_is_dispatched',
        // v1.3 / CROSS-2 销售"写跟进"回写的客户画像字段
        'l.client_degree AS l_client_degree',
        'l.client_major_research AS l_client_major_research',
        'l.client_time_requirement AS l_client_time_requirement',
        'l.objection_point AS l_objection_point',
        'l.follow_action AS l_follow_action',
        'l.follow_action_at AS l_follow_action_at',
        'a.account_name AS account_name',
        'p.title AS post_title',
        'p.post_url AS post_url',
        'e.name AS employee_name',
        // 合并 count：window function 在 LIMIT/OFFSET 之前计算，返回全量行数
        'COUNT(*) OVER() AS total_count',
      ])
      .where('1=1');

    // 应用过滤条件
    this.applyLeadScope(dataQb, filters);
    this.applyLeadFilters(dataQb, filters);

    // 稳定排序 + 分页
    dataQb.orderBy('l.created_at', 'DESC')
      .addOrderBy('l.id', 'DESC')
      .limit(safeLimit)
      .offset(safeOffset);

    const rows: any[] = await dataQb.getRawMany();

    // 提取 total_count（所有行相同）
    const total = rows[0]?.total_count ? Number(rows[0].total_count) : 0;

    // 如果没有数据，直接返回
    if (!rows || rows.length === 0 || total === 0) {
      return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
    }

    const leadIds = rows.map(r => r.l_id);

    // Step 3: 并行查询 follow + collab 聚合
    const [followRows, collabRows] = await Promise.all([
      // follow: 取每个 lead 最新一条
      this.followRepository.manager.query(`
        SELECT f.*
        FROM lead_follow_records f
        INNER JOIN (
          SELECT lead_id, MAX(created_at) as max_created
          FROM lead_follow_records
          WHERE lead_id IN (${leadIds.map(() => '?').join(',')})
          GROUP BY lead_id
        ) latest ON f.lead_id = latest.lead_id AND f.created_at = latest.max_created
      `, leadIds) as Promise<any[]>,
      // collab: 取每个 lead 最新一条
      this.collaborationRepository.manager.query(`
        SELECT c.*
        FROM collaboration_tasks c
        INNER JOIN (
          SELECT lead_id, MAX(created_at) as max_created
          FROM collaboration_tasks
          WHERE lead_id IN (${leadIds.map(() => '?').join(',')})
          GROUP BY lead_id
        ) latest ON c.lead_id = latest.lead_id AND c.created_at = latest.max_created
      `, leadIds) as Promise<any[]>,
    ]);

    // Step 4: 内存中合并到 lead 对象
    const followMap = new Map(followRows.map(f => [f.lead_id, f]));
    const collabMap = new Map<string, any>();
    for (const c of collabRows) {
      if (!collabMap.has(c.lead_id)) {
        collabMap.set(c.lead_id, c);
      }
    }

    const items = rows.map(r => {
      const follow = followMap.get(r.l_id);
      const collab = collabMap.get(r.l_id);
      const collabStatus = collab?.status || 'none';

      return {
        id: r.l_id,
        employeeId: r.l_employee_id,
        employeeName: r.employee_name || null,
        operatorId: r.l_employee_id,
        operatorName: r.l_sales_user_name || r.l_assigned_sales_user_name || null,
        accountId: r.l_account_id,
        accountName: r.account_name || null,
        sourceAccountId: r.l_account_id,
        sourceAccountName: r.account_name || null,
        postId: r.l_post_id,
        postTitle: r.post_title || null,
        postUrl: r.post_url || null,
        sourcePostId: r.l_post_id,
        sourcePostTitle: r.post_title || null,
        sourcePostUrl: r.post_url || null,
        platform: r.l_platform,
        contactInfo: r.l_contact_info,
        nickname: r.l_nickname,
        budget: r.l_budget,
        majorContent: r.l_major_content,
        ip: r.l_ip,
        status: r.l_status,
        dealAmount: r.l_deal_amount,
        dealStatus: r.l_deal_status || null,
        note: r.l_note,
        requirementNote: r.l_requirement_note,
        supervisorNote: r.l_supervisor_note,
        captureImageUrl: r.l_capture_image_url,
        salesFeedback: r.l_sales_feedback,
        salesUpdatedAt: r.l_sales_updated_at,
        salesUserName: r.l_sales_user_name,
        assignedSalesUserId: r.l_assigned_sales_user_id,
        assignedSalesUserName: r.l_assigned_sales_user_name,
        processStatus: r.l_process_status,
        collaborationStatus: collabStatus,
        addStatus: r.l_add_status,
        intention: r.l_intention,
        leadCode: r.l_lead_code,
        intentionLevel: r.l_intention_level,
        addMethod: r.l_add_method,
        nextFollowTime: r.l_next_follow_time,
        nextFollowAt: r.l_next_follow_time,
        matchedPostId: r.l_matched_post_id,
        sourceUnknown: !!r.l_source_unknown,
        // v1.3 / CROSS-1 客资分流标志（销售端列表默认 is_dispatched=0）
        isDispatched: Number(r.l_is_dispatched) === 1,
        // v1.3 / SA-1 + CROSS-2 销售"写跟进"回写的客户画像字段
        clientDegree: r.l_client_degree || null,
        clientMajorResearch: r.l_client_major_research || null,
        clientTimeRequirement: r.l_client_time_requirement || null,
        objectionPoint: r.l_objection_point || null,
        followAction: r.l_follow_action || null,
        followActionAt: r.l_follow_action_at || null,
        latestFollowNote: follow?.content || r.l_sales_feedback || r.l_note || null,
        latestFollowAt: follow?.created_at || r.l_sales_updated_at || r.l_updated_at,
        createdAt: r.l_created_at,
        updatedAt: r.l_updated_at,
        // followSummary 兼容旧结构
        followSummary: follow ? {
          id: follow.id,
          content: follow.content,
          createdAt: follow.created_at,
          count: 1,
        } : null,
        // collabStatus 兼容旧结构（已有 collaborationStatus）
        collabStatus: collabStatus,
      };
    });

    return { items, total, limit: safeLimit, offset: safeOffset };
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
      // v1.3 / SA-11 P0 修复：已成交/已退款不进次日跟进提醒
      .andWhere("(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))")
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
      // v1.3 / SA-11 P0 修复：已成交/已退款不进次日跟进提醒
      .andWhere("(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))")
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
      // 标记 employeeId 已被 scope 层处理,避免 applyLeadFilters 重复 andWhere
      // 同名字段(TypeORM QueryBuilder 会报"duplicate parameter"或 AND 条件重复)。
      (filters as any)._employeeIdHandled = true;
    }
    // v1.3 / CROSS-1: 销售端任何列表/统计查询必须 WHERE is_dispatched = 0，
    // 主管端 admin/owner 不限制（与文档 §10 销售端约束一致）。
    if (role === 'sales' || (filters.actorUserId && !role)) {
      qb.andWhere('l.is_dispatched = 0');
      // v1.3 / SA-11 P0 修复: 「我的客资」= 未成交客资，deal_done / refunded 不应出现。
      //   - deal_done   → 已成交，已转到「我的成交」(orders 表)；
      //   - refunded    → 已退款，归属"已完成"侧，不属于待跟进的"我的客资"。
      //   由 scope 层硬编码，业务上不可被 query string 覆盖，保持与"我的成交"菜单的语义边界。
      //   admin/owner/supervisor 不加此约束（按运营/管理视角需看到全量）。
      // 注意: SQL 中 AND 优先级高于 OR，必须用括号把 (IS NULL OR NOT IN) 包成一个整体，
      //   否则 `is_dispatched=0 AND deal_status IS NULL OR deal_status NOT IN(...)`
      //   会被解析为 `(is_dispatched=0 AND deal_status IS NULL) OR deal_status NOT IN(...)`，
      //   后半段会"绕过"前面的 is_dispatched / scope 过滤，错误地放出全部非 deal_done 行。
      qb.andWhere("(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))");
    }
  }

  private applyLeadFilters(qb: any, filters: LeadFilterOptions): void {
    if (filters.accountId) qb.andWhere('l.account_id = :accountId', { accountId: filters.accountId });
    if (filters.platform) qb.andWhere('l.platform = :platform', { platform: filters.platform });
    if (filters.status) qb.andWhere('l.status = :status', { status: filters.status });
    if (filters.addStatus) qb.andWhere('l.add_status = :addStatus', { addStatus: filters.addStatus });
    if (filters.processStatus) qb.andWhere('l.process_status = :processStatus', { processStatus: filters.processStatus });
    // BUG-2: 新增筛选条件
    if (filters.assignedSalesUserId) qb.andWhere('l.assigned_sales_user_id = :assignedSalesUserId', { assignedSalesUserId: filters.assignedSalesUserId });
    if (filters.postId) qb.andWhere('l.post_id = :postId', { postId: filters.postId });
    if (filters.dealStatus) qb.andWhere('l.deal_status = :dealStatus', { dealStatus: filters.dealStatus });
    // BUG-SUPERVISOR-KANBAN 修复 (2026-06-04)：主管客资看板点击不同运营时数据应按
    //   该运营过滤。applyLeadScope 仅在 scope=employee 时使用 employeeId，scope=all
    //   时直接忽略，导致主管端(admin/owner)的"按运营"筛选完全失效（数据不变化）。
    //   修复：把 employeeId 作为通用筛选条件移到 applyLeadFilters，scope=all
    //   也会按运营过滤。scope=employee 已被 applyLeadScope 处理过,跳过避免重复。
    if (filters.employeeId && !(filters as any)._employeeIdHandled) {
      qb.andWhere('l.employee_id = :employeeId', { employeeId: filters.employeeId });
    }
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
    // 必填字段校验
    const errors: string[] = [];
    if (!dto.accountId) errors.push('accountId (来源账号)');
    if (!dto.platform) errors.push('platform (平台)');
    if (!dto.contactInfo) errors.push('contactInfo (联系方式)');
    if (errors.length > 0) {
      throw new BadRequestException(`缺少必填字段: ${errors.join(', ')}`);
    }

    // v1.3 / OP-5 / CROSS-1: isDispatched 字段语义
    //   0 = 未分流 → 必须分配销售（进入销售端统计/列表）
    //   1 = 已分流 → 销售字段置空（不进销售端看板）
    // 默认 0（未分流），与销售端既有逻辑保持一致。
    const rawIsDispatched = (dto as any).isDispatched;
    const isDispatched = rawIsDispatched === 1 || rawIsDispatched === '1' || rawIsDispatched === true ? 1 : 0;
    if (isDispatched === 0 && !dto.assignedSalesUserId) {
      throw new BadRequestException('未分流的客资必须选择销售（assignedSalesUserId 不能为空）');
    }
    if (isDispatched === 1 && dto.assignedSalesUserId) {
      // 已分流：销售字段强制清空，避免误传
      dto.assignedSalesUserId = null;
      dto.assignedSalesUserName = '';
    }

    const leadId = (dto as any).id || makeId();
    const lead = this.leadRepository.create({
      ...dto,
      id: leadId,
      leadCode: dto.leadCode || this.generateLeadCode(),
      nickname: dto.nickname || '',
      salesUserName: dto.salesUserName || '',
      processStatus: dto.processStatus || 'not_contacted',
      addStatus: dto.addStatus || 'not_added',
      isDispatched,
    } as any);

    try {
      await this.leadRepository.save(lead);
    } catch (err: any) {
      // 外键约束失败 (如 account_id 不存在)
      if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
        throw new BadRequestException(`关联数据不存在: ${err.message}`);
      }
      // 唯一约束冲突
      if (err.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`数据重复: ${err.message}`);
      }
      // 打印详细日志便于排查
      console.error('[leads.create] save failed:', {
        dto,
        error: err.message,
        code: err.code,
        errno: err.errno,
      });
      throw err;
    }

    // §11.1 lead_assigned: 客资被直接分配给销售时通知销售。
    if (dto.assignedSalesUserId) {
      const customerName = dto.nickname || dto.contactInfo || '未知客户';
      // 构造来源信息：优先用作品名，其次账号名
      const sourceInfo = [
        dto.postId ? `作品ID: ${dto.postId}` : null,
        dto.accountId ? `账号ID: ${dto.accountId}` : null,
        dto.platform ? `平台: ${dto.platform}` : null,
        dto.ip ? `IP: ${dto.ip}` : null,
      ].filter(Boolean).join(' | ');
      await this.notificationsService.create({
        receiverIds: [dto.assignedSalesUserId],
        senderId: null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.LEAD_ASSIGNED,
        title: `新分配客资: ${customerName}`,
        content: sourceInfo || `客资 ${customerName} 已分配给您，请尽快跟进`,
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

  async updateBoard(id: string, dto: BoardPatchDto, actorUserId: string, expectedUpdatedAt?: Date): Promise<void> {
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return;

    // 乐观锁校验: 校验 updatedAt 是否匹配
    if (expectedUpdatedAt) {
      const currentUpdatedAt = current.updatedAt ? new Date(current.updatedAt).getTime() : 0;
      const expectedUpdatedAtMs = new Date(expectedUpdatedAt).getTime();
      if (currentUpdatedAt !== expectedUpdatedAtMs) {
        throw new ConflictException('客资已被他人更新，请刷新后重试');
      }
    }

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

    const updateResult = await this.leadRepository.update(id, next);
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
    // v1.3 / SA-1 + CROSS-2: 销售"写跟进"把客户学历/需求/专业/时间要求/异议点/跟进措施回写到 leads。
    // 客户需求走 requirement_note（已存在字段，CR/兼容）；其他字段是新加的列。
    if (dto.clientDegree !== undefined) patch.clientDegree = dto.clientDegree || null;
    if (dto.clientMajorResearch !== undefined) patch.clientMajorResearch = dto.clientMajorResearch || null;
    if (dto.clientTimeRequirement !== undefined) patch.clientTimeRequirement = dto.clientTimeRequirement || null;
    if (dto.objectionPoint !== undefined) patch.objectionPoint = dto.objectionPoint || null;
    if (dto.followAction !== undefined) patch.followAction = dto.followAction || null;
    if (dto.followActionAt !== undefined) {
      patch.followActionAt = dto.followActionAt ? new Date(dto.followActionAt) : new Date();
    }
    if (dto.requirementNote !== undefined) patch.requirementNote = dto.requirementNote || null;
    this.applySalesStateTransition(current, patch, normalized);
    if (Object.keys(patch).length > 0) {
      await this.leadRepository.update(leadId, patch);
    }
  }

  // ============================================================
  // v1.3 / SA-3: 销售端"更新成交状态" / "更新意向程度"两个独立端点。
  // 与写跟进分开，只动 leads 自身一行 + 写操作日志，不写跟进记录。
  // ============================================================

  async updateDealStatus(
    id: string,
    actorUserId: string,
    dto: { dealStatus: string; dealAmount?: number | string | null },
  ): Promise<any | null> {
    const dealStatus = String(dto.dealStatus || '').trim();
    if (!DEAL_STATUS_CODES.has(dealStatus)) {
      throw new BadRequestException(
        `invalid dealStatus: ${dealStatus}（必须是 ${Array.from(DEAL_STATUS_CODES).join(' / ')}）`,
      );
    }
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return null;

    const patch: Partial<Lead> = { dealStatus };
    if (dto.dealAmount !== undefined) {
      patch.dealAmount = dto.dealAmount != null && dto.dealAmount !== '' ? String(dto.dealAmount) : null;
    }
    // deal_done 同步 processStatus=deal_done + status=in_followup（与 closeDeal 保持一致口径）
    if (dealStatus === 'deal_done') {
      patch.processStatus = 'deal_done';
      patch.status = 'in_followup';
    } else if (dealStatus === 'invalid') {
      patch.processStatus = 'invalid';
      patch.status = 'invalid';
    }
    await this.leadRepository.update(id, patch);
    try {
      await this.operationLogsService.log({
        userId: actorUserId || '',
        action: 'lead_status_update',
        targetType: 'lead',
        targetId: id,
        detail: JSON.stringify({
          from: { dealStatus: current.dealStatus, dealAmount: current.dealAmount },
          to: { dealStatus, dealAmount: patch.dealAmount ?? current.dealAmount },
          field: 'dealStatus',
        }),
      });
    } catch {
      // best-effort
    }
    const updated = await this.leadRepository.findOne({ where: { id } });
    if (!updated) return null;
    const latestCollaboration = await this.latestCollaborationByLeadIds([updated.id]);
    return this.mapLead(updated, undefined, latestCollaboration.get(updated.id));
  }

  async updateIntentionLevel(
    id: string,
    actorUserId: string,
    dto: { intentionLevel: string },
  ): Promise<any | null> {
    const intentionLevel = String(dto.intentionLevel || '').trim();
    if (!INTENTION_LEVEL_CODES.has(intentionLevel)) {
      throw new BadRequestException(
        `invalid intentionLevel: ${intentionLevel}（必须是 ${Array.from(INTENTION_LEVEL_CODES).join(' / ')}）`,
      );
    }
    const current = await this.leadRepository.findOne({ where: { id } });
    if (!current) return null;
    await this.leadRepository.update(id, { intentionLevel });
    try {
      await this.operationLogsService.log({
        userId: actorUserId || '',
        action: 'lead_status_update',
        targetType: 'lead',
        targetId: id,
        detail: JSON.stringify({
          from: { intentionLevel: current.intentionLevel },
          to: { intentionLevel },
          field: 'intentionLevel',
        }),
      });
    } catch {
      // best-effort
    }
    const updated = await this.leadRepository.findOne({ where: { id } });
    if (!updated) return null;
    const latestCollaboration = await this.latestCollaborationByLeadIds([updated.id]);
    return this.mapLead(updated, undefined, latestCollaboration.get(updated.id));
  }

  /**
   * v1.3 / SA-6 当天未添加的客资标识 + 当日待跟进。
   * 今日分配给我但 add_status=not_added 的客资，红标置顶。
   * 用于销售端首页"当日未添加"快捷入口与 /api/sales/leads/today-not-added。
   */
  async findTodayNotAdded(
    salesUserId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    if (!salesUserId) return { items: [], total: 0, limit: this.clampLimit(limit), offset: Math.max(Number(offset) || 0, 0) };
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    // v1.3 / CROSS-1 联动：销售端 is_dispatched = 0
    // v1.3 / SA-11 P0 修复：已成交/已退款客资不进「今日未添加」红标置顶。
    // 注意: 整个 deal_status 条件用括号包起来,避免 AND/OR 优先级导致"绕过"。
    const qb = this.leadRepository.createQueryBuilder('l')
      .where('l.assigned_sales_user_id = :uid', { uid: salesUserId })
      .andWhere('l.is_dispatched = 0')
      .andWhere('l.add_status = :addStatus', { addStatus: 'not_added' })
      .andWhere("(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))")
      // 当日 00:00 之后创建/分配；用 created_at 兜底（assigned_at 未在 schema 中）
      .andWhere('l.created_at >= :todayStart', {
        todayStart: this.todayStartDate(),
      })
      .orderBy('l.created_at', 'ASC')
      .take(safeLimit)
      .skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  /**
   * v1.3 / SA-11 当日待跟进列表：next_follow_time ≤ 今天 23:59:59 且未关闭（process_status != invalid / deal_done）。
   */
  async findTodayFollowupsForSales(
    salesUserId: string,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    if (!salesUserId) return { items: [], total: 0, limit: this.clampLimit(limit), offset: Math.max(Number(offset) || 0, 0) };
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const todayEnd = this.todayEndDate();
    // v1.3 / SA-11 P0 修复：已成交/已退款客资不进「当日待跟进」。
    //   原条件 process_status NOT IN ('invalid', 'deal_done') 仅兜底 process_status 字段；
    //   现叠加 deal_status 过滤，避免历史脏数据或回流场景下出现"已成交"在待跟进列表。
    //   注意: 整个 deal_status 条件用括号包起来,避免 AND/OR 优先级导致"绕过"。
    const qb = this.leadRepository.createQueryBuilder('l')
      .where('l.assigned_sales_user_id = :uid', { uid: salesUserId })
      .andWhere('l.is_dispatched = 0')
      .andWhere('l.next_follow_time IS NOT NULL')
      .andWhere('l.next_follow_time <= :todayEnd', { todayEnd })
      .andWhere("l.process_status NOT IN ('invalid', 'deal_done')")
      .andWhere("(l.deal_status IS NULL OR l.deal_status NOT IN ('deal_done', 'refunded'))")
      .orderBy('l.next_follow_time', 'ASC')
      .take(safeLimit)
      .skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.mapLeads(rows), total, limit: safeLimit, offset: safeOffset };
  }

  private todayStartDate(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00:00:00`;
  }

  private todayEndDate(): string {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return this.fmt(d);
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
    if (!next.status && hasFollowSignal && !this.isCollaborationStatus(current.status) && !this.isOperationHandledStatus(current.status)) {
      next.status = 'in_followup';
    }
  }

  private resolveLeadStatus(current: Lead, dto: BoardPatchDto): string | null {
    if (dto.status !== undefined) return dto.status || current.status;
    if (dto.processStatus === 'invalid') return 'invalid';
    if (dto.addStatus === 'added') return 'added_success';
    if (dto.processStatus === 'in_collaboration') return LEAD_STATUS_IN_COLLABORATION;
    if (dto.processStatus === 'operation_handled') return LEAD_STATUS_OPERATION_HANDLED;
    const hasSalesAction =
      dto.processStatus !== undefined ||
      dto.addStatus !== undefined ||
      Boolean(dto.followNote && dto.followNote.trim());
    if (hasSalesAction && !this.isCollaborationStatus(current.status)) {
      return 'in_followup';
    }
    return null;
  }

  /**
   * 判断客资是否处于协同中。
   */
  private isCollaborationStatus(status?: string | null): boolean {
    return status === LEAD_STATUS_IN_COLLABORATION;
  }

  /**
   * 判断客资是否已由运营处理。
   */
  private isOperationHandledStatus(status?: string | null): boolean {
    return status === LEAD_STATUS_OPERATION_HANDLED;
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
    //
    // BUG-SUPERVISOR-KANBAN 修复 (2026-06-04)：主管端(stats)点不同运营时顶部 8 个汇总卡
    //   也应只统计该运营的客资。applyLeadScope 只在 scope=employee 时加 employeeId，
    //   默认 scope=all 时忽略 → 顶部 total 永远等于全量 162，运营筛选完全失效。
    //   修复：把 employeeId 作为"业务筛选"显式叠加到 qbBase 与 qb，让汇总卡和列表
    //   同步按运营过滤。scope=employee 已被 applyLeadScope 用 _employeeIdHandled
    //   标记,这里仍叠加但 OR 语义不变(同条件不会重复加 by 字段)。
    const qbBase = this.leadRepository.createQueryBuilder('l');
    this.applyLeadScope(qbBase, scopeFilters);
    if (from) qbBase.andWhere('l.created_at >= :from', { from });
    if (to) qbBase.andWhere('l.created_at < :to', { to });
    if (opts.employeeId && scope !== 'employee') {
      qbBase.andWhere('l.employee_id = :employeeId', { employeeId: opts.employeeId });
    }

    const qb = qbBase.clone();
    this.applyLeadFilters(qb, {
      accountId: opts.accountId,
      platform: opts.platform,
      postType: opts.postType,
      status: opts.status,
      addStatus: opts.addStatus,
      processStatus: opts.processStatus,
      // BUG-SUPERVISOR-KANBAN 修复 (2026-06-04)：stats 也需要按运营过滤，
      // 与列表 applyLeadFilters 保持口径一致（AC-3.2）。
      employeeId: opts.employeeId,
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
    const accounts = rows.length <= 200
      ? await this.accountsByIds(rows.map((row) => row.accountId))
      : new Map<string, Account>();
    const posts = rows.length <= 200
      ? await this.postsByIds(rows.map((row) => row.postId || ''))
      : new Map<string, Post>();
    return rows.map((row) => this.mapLead(
      row,
      latest.get(row.id),
      latestCollaboration.get(row.id),
      accounts.get(row.accountId),
      row.postId ? posts.get(row.postId) : undefined,
    ));
  }

  private async accountsByIds(accountIds: string[]): Promise<Map<string, Account>> {
    const ids = Array.from(new Set(accountIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const rows = await this.accountRepository.find({ where: { id: In(ids) } });
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async postsByIds(postIds: string[]): Promise<Map<string, Post>> {
    const ids = Array.from(new Set(postIds.filter(Boolean)));
    if (ids.length === 0) return new Map();
    const rows = await this.postRepository.find({ where: { id: In(ids) } });
    return new Map(rows.map((row) => [row.id, row]));
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

  private mapLead(
    row: Lead,
    latestFollow?: LeadFollowRecord,
    latestCollaboration?: CollaborationTask,
    account?: Account,
    post?: Post,
  ): any {
    return {
      id: row.id,
      employeeId: row.employeeId,
      operatorId: row.employeeId,
      operatorName: row.salesUserName || row.assignedSalesUserName || null,
      accountId: row.accountId,
      accountName: account?.accountName || null,
      sourceAccountId: row.accountId,
      sourceAccountName: account?.accountName || null,
      postId: row.postId,
      postTitle: post?.title || null,
      postUrl: post?.postUrl || null,
      sourcePostId: row.postId,
      sourcePostTitle: post?.title || null,
      sourcePostUrl: post?.postUrl || null,
      platform: row.platform,
      contactInfo: row.contactInfo,
      nickname: row.nickname,
      budget: row.budget,
      majorContent: row.majorContent,
      ip: row.ip,
      status: row.status,
      dealAmount: row.dealAmount,
      dealStatus: row.dealStatus,
      note: row.note,
      requirementNote: row.requirementNote,
      supervisorNote: row.supervisorNote,
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
      // v1.3 / CROSS-1 客资分流：销售端只看到 is_dispatched=0 的行。
      isDispatched: row.isDispatched,
      // v1.3 / SA-1 + CROSS-2: 销售"写跟进"回写的客户画像字段。
      clientDegree: row.clientDegree,
      clientMajorResearch: row.clientMajorResearch,
      clientTimeRequirement: row.clientTimeRequirement,
      objectionPoint: row.objectionPoint,
      followAction: row.followAction,
      followActionAt: row.followActionAt,
      latestFollowNote: latestFollow?.content || row.salesFeedback || row.note || null,
      latestFollowAt: latestFollow?.createdAt || row.salesUpdatedAt || row.updatedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
