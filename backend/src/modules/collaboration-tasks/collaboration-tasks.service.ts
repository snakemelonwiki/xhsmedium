import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import {
  CollaborationTask,
  CollaborationTaskType,
  CollaborationTaskStatus,
} from '../../entities/collaboration-task.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { sanitizeText } from '../../shared/sanitize';
import { NotificationsService } from '../notifications/notifications.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

const COLLAB_TIMEOUT_HOURS = 24;
const COLLAB_SCAN_BATCH = 100;
const LEAD_STATUS_IN_COLLABORATION = 'in_collaboration';
const LEAD_STATUS_OPERATION_HANDLED = 'operation_handled';
const LEAD_ADD_STATUS_OPERATION_REMINDED = 'operation_reminded';
const TASK_LEAD_JOIN = 'l.id COLLATE utf8mb4_unicode_ci = t.lead_id COLLATE utf8mb4_unicode_ci';

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
  type?: string;
  leadId?: string;
  userId?: string;
  employeeId?: string;
  role?: string;
  // 1.2 搜索/筛选 — 模糊搜索（协同原因/客户昵称/联系方式）+ 时间范围
  keyword?: string;
  startAt?: string;
  endAt?: string;
}

@Injectable()
export class CollaborationTasksService {
  private readonly logger = new Logger(CollaborationTasksService.name);
  private running = false;

  constructor(
    @InjectRepository(CollaborationTask)
    private readonly repo: Repository<CollaborationTask>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notificationsService: NotificationsService,
    private readonly operationLogsService: OperationLogsService,
  ) {}

  async create(dto: CreateDto): Promise<CollaborationTask> {
    if (!dto.leadId) throw new Error('leadId required');
    if (!dto.requesterId) throw new Error('requesterId required');
    const normalizedType = this.normalizeType(dto.type);
    if (!normalizedType) {
      throw new Error('invalid type');
    }
    // PF-04 修复：去掉 hasBrokenEncoding 拦截。前端 fetch 默认 UTF-8，中文是合法输入。
    // 真正损坏的字符（U+FFFD）会由 sanitizeText 静默清理。
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
      status: LEAD_STATUS_IN_COLLABORATION,
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
    // 模糊搜索条件可能引用 leads.*,所以在 applyCollabScope 之前先 leftJoin;
    // applyCollabScope 内部若已 join 同一 alias 会复用 QueryBuilder 自身 join。
    this.applyCollabFilters(qb, query);
    this.applyCollabScope(qb, query);
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.leadId) {
      qb.andWhere('t.lead_id = :leadId', { leadId: query.leadId });
    }
    qb.orderBy('t.requested_at', 'DESC');
    const rows = await qb.getMany();
    return this.mapTasks(rows);
  }

  /**
   * 1.2 协同任务筛选：type / 模糊搜索（reason / 客户昵称/联系方式）/ 时间范围。
   * 注意：inbox 分支在 applyCollabScope 内会再 leftJoin leads，使用同样 alias 'l' 不会冲突。
   */
  private applyCollabFilters(qb: any, query: ListQuery): void {
    if (query.type && ALLOWED_TYPES.includes(query.type as CollaborationTaskType)) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    const kw = query.keyword && query.keyword.trim();
    if (kw) {
      const like = `%${kw}%`;
      qb.leftJoin(Lead, 'l', TASK_LEAD_JOIN);
      qb.andWhere(
        '(t.reason LIKE :kw OR l.nickname LIKE :kw OR l.contact_info LIKE :kw)',
        { kw: like },
      );
    }
    if (query.startAt) {
      qb.andWhere('t.requested_at >= :startAt', { startAt: query.startAt });
    }
    if (query.endAt) {
      qb.andWhere('t.requested_at <= :endAt', { endAt: query.endAt });
    }
  }

  /**
   * 协同任务可见性过滤，list/listPaged 共用：
   * - admin/owner + scope=all → 不过滤
   * - 其它角色 scope=all → 强制降级 mine（避免越权读全表）
   * - scope=mine：自己发起的
   * - scope=inbox：自己被指派 或 来源运营负责池中待处理
   * - 默认（无 scope / 未知 scope）→ mine
   */
  private applyCollabScope(qb: any, query: ListQuery): void {
    const rawScope = this.normalizeScope(query.scope);
    const role = query.role || '';
    const isAdminLike = role === 'admin' || role === 'owner';
    const effectiveScope = rawScope === 'all' && !isAdminLike ? 'mine' : rawScope;
    if (effectiveScope === 'all') return;
    if (effectiveScope === 'inbox') {
      qb.leftJoin(Lead, 'l', TASK_LEAD_JOIN);
      qb.andWhere(
        '(t.handler_id = :uid OR (t.status = :pendingStatus AND l.employee_id = :employeeId))',
        {
          uid: query.userId || '',
          pendingStatus: 'pending',
          employeeId: query.employeeId || '',
        },
      );
      return;
    }
    // 默认 mine
    qb.andWhere('t.requester_id = :uid', { uid: query.userId || '' });
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

    this.applyCollabFilters(qb, query);
    this.applyCollabScope(qb, query);
    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }
    if (query.leadId) {
      qb.andWhere('t.lead_id = :leadId', { leadId: query.leadId });
    }

    qb.orderBy('t.requested_at', 'DESC').skip(safeOffset).take(safeLimit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: await this.mapTasks(rows), total, limit: safeLimit, offset: safeOffset };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  /**
   * 兼容旧前端 scope 命名，统一成后端权限语义。
   * 重要：未识别的 scope（含空、outgoing/incoming 旧字段）一律落到 mine，避免越权回退到 all。
   * admin/owner 想看全表必须显式传 scope=all（applyCollabScope 才会放行）。
   */
  private normalizeScope(scope?: string): 'mine' | 'inbox' | 'all' {
    const raw = String(scope || '').trim().toLowerCase();
    if (raw === 'all') return 'all';
    if (raw === 'inbox' || raw === 'handler' || raw === 'operations' || raw === 'incoming') return 'inbox';
    // mine / requester / sales / outgoing / 空 / 未知 → mine
    return 'mine';
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
    // S-P1-02 修复：handledNote 必填校验。
    // 旧实现只 sanitize 不校验长度，空字符串 / 全空白 / null 都会被落库为
    // `handled_note=''`，导致：
    //   - 销售/主管回看时不知道运营具体处理结果（notice 标题/内容空）
    //   - 状态机用例 TC-SM-041 / R-2 风险（fixture 中 handled_note 全 NULL）
    //   - 通知正文 `您发起的协同任务已处理: ${cleanNote}` 退化成 `您发起的协同任务已处理: `，对销售无信息量
    // 修复策略：trim 后长度必须 > 0，否则抛 BadRequestException。
    // 由 controller 层 catch 后翻译为 400，行为与 status 校验一致。
    const trimmedNote = (handledNote || '').trim();
    if (!trimmedNote) {
      throw new BadRequestException('handledNote is required');
    }
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    if (task.status !== 'handling' && task.status !== 'pending') {
      throw new Error(`cannot handle task in status ${task.status}`);
    }
    // PF-04 修复：去掉 hasBrokenEncoding 拦截
    await this.assertCanHandle(task, handlerActor);
    const cleanNote = sanitizeText(trimmedNote);
    await this.repo.update(id, {
      status: 'handled',
      handlerId: task.handlerId || handlerActor.actorUserId || null,
      handledNote: cleanNote,
      handledAt: new Date(),
    });
    const updated = await this.repo.findOne({ where: { id } });
    await this.leadRepository.update(task.leadId, {
      status: LEAD_STATUS_OPERATION_HANDLED,
      addStatus: LEAD_ADD_STATUS_OPERATION_REMINDED,
    });

    // §11.1 collab_handled: 协同任务被处理完结，回写给原发起人。
    // N-P1-06 修复：relatedId 统一指向 task.id（与 COLLAB_REQUESTED 同语义），
    // 使 buildRouteHint 拼出的 URL `/sales/collaboration?taskId=<id>` 能正确定位任务。
    // 旧实现 relatedId=task.leadId + relatedType='lead'，会让前端跳到客资详情而
    // 看不到 task 状态，造成"协同处理完结通知"无法溯源。
    // metadata 字段因约束"不改 DB schema"无法新增；leadId 留痕通过 content 嵌入
    // 「关联客资: <id>」文本承载，前端展示但不影响路由跳转。
    if (task.requesterId) {
      const leadRef = task.leadId ? `\n关联客资: ${task.leadId}` : '';
      const baseContent = cleanNote
        ? `您发起的协同任务已处理: ${cleanNote}`
        : '您发起的协同任务已处理';
      await this.notificationsService.create({
        receiverIds: [task.requesterId],
        senderId: task.handlerId || handlerActor.actorUserId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.COLLAB_HANDLED,
        title: '协同任务已处理',
        content: `${baseContent}${leadRef}`,
        relatedId: task.id,
        relatedType: 'collaboration_task',
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

  async close(
    id: string,
    actor: CollaborationActor = {},
  ): Promise<CollaborationTask | null> {
    const closeActor = this.normalizeActor(actor);
    const task = await this.repo.findOne({ where: { id } });
    if (!task) return null;
    // 幂等：已关闭的任务直接返回当前记录，避免重复写入与误报权限错误。
    if (task.status === 'closed') {
      return task;
    }
    // TC-PERM-037 P0 修复：仅任务发起人（requester）或 admin/owner 可关闭。
    // 销售员之间不能互关协同任务，运营也不能关闭（非处理权限）。
    await this.assertCanClose(task, closeActor);
    await this.repo.update(id, { status: 'closed' as CollaborationTaskStatus });
    // S-P1-04 修复：协同 close 成功后回退关联 lead.status。
    // 旧实现 close 后 lead 仍卡在 in_collaboration（由 create() 写入），导致：
    //   - 销售端 GET /api/leads?status=in_collaboration 永远看到这条 lead
    //   - 状态机卡死，create 协同时若 lead 已经是 in_collaboration，create() 会无脑覆盖
    //   - 销售端看不到 lead 已回到可继续跟进的状态
    // 修复：close 成功后查 lead 当前 status；如果是协同中 → 改为 in_followup
    //   其它情况（in_followup / new / assigned / operation_handled / added_success / invalid）
    //   不动，避免覆盖更下游的状态。
    // 失败仅记日志，不阻断 close 主流程（lead 状态可后续由 updateBoard / addFollowRecord 修复）。
    try {
      const lead = await this.leadRepository.findOne({
        where: { id: task.leadId },
        select: { id: true, status: true },
      });
      if (lead && lead.status === LEAD_STATUS_IN_COLLABORATION) {
        await this.leadRepository.update(task.leadId, { status: 'in_followup' });
      }
    } catch (err: any) {
      this.logger.warn(
        `collab close: lead status rollback failed (lead=${task.leadId}, task=${task.id}): ${err?.message || err}`,
      );
    }
    return this.repo.findOne({ where: { id } });
  }

  /**
   * 校验协同关闭权限：
   * - admin / owner 可关闭任意任务（主管兜底）
   * - 其它角色：仅任务发起人（requester_id === actorUserId）可关闭
   * 失败抛 Error，controller 渲染 403。
   */
  private assertCanClose(
    task: CollaborationTask,
    actor: CollaborationActor,
  ): void {
    if (actor.actorRole === 'admin' || actor.actorRole === 'owner') {
      return;
    }
    if (!actor.actorUserId) {
      throw new Error('close requires user');
    }
    if (task.requesterId !== actor.actorUserId) {
      throw new Error('no permission to close task');
    }
  }

  /**
   * 协同任务超时扫描器：每 30 分钟跑一次。
   * 规则：created_at 距今超过 24 小时且 status ∈ {pending, handling} 的任务 → 标 timeout。
   * 给 来源运营（reporter=user） + 主管（role=admin） 发 COLLABORATION_TIMEOUT 通知，
   * 并写 operation_logs (action='status_change')，便于事后追溯。
   * 幂等：timeout 状态的任务不会被再扫回去。
   */
  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'collabTimeoutScan' })
  async handleTimeoutScan(): Promise<void> {
    if (this.running) {
      // 上一轮还没跑完（或卡死），跳过避免堆积
      return;
    }
    this.running = true;
    try {
      await this.runOnce();
    } catch (err: any) {
      this.logger.error(`collab timeout scan failed: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * 单轮扫描（暴露 public 给 controller 手动 trigger）。
   * 限 COLLAB_SCAN_BATCH=100 条/轮：单次跑过久会卡主调度循环。
   */
  async runOnce(): Promise<{ scanned: number; marked: number; notified: number; failed: number }> {
    return this.scanTimeouts();
  }

  async scanTimeouts(): Promise<{ scanned: number; marked: number; notified: number; failed: number }> {
    const threshold = new Date(Date.now() - COLLAB_TIMEOUT_HOURS * 3600 * 1000);
    const dueList = await this.repo.find({
      where: {
        status: In(['pending', 'handling'] as CollaborationTaskStatus[]),
        createdAt: LessThanOrEqual(threshold),
      },
      order: { createdAt: 'ASC' },
      take: COLLAB_SCAN_BATCH,
    });
    if (!dueList.length) {
      return { scanned: 0, marked: 0, notified: 0, failed: 0 };
    }

    let marked = 0;
    let notified = 0;
    let failed = 0;

    for (const task of dueList) {
      try {
        // 幂等保护：再次查一遍，避免中途被改完又回退成非 timeout
        const fresh = await this.repo.findOne({ where: { id: task.id } });
        if (!fresh) continue;
        if (fresh.status === 'timeout' || fresh.status === 'handled' || fresh.status === 'closed') {
          continue;
        }
        if (fresh.status !== 'pending' && fresh.status !== 'handling') {
          continue;
        }

        const updateResult = await this.repo
          .createQueryBuilder()
          .update(CollaborationTask)
          .set({ status: 'timeout' as CollaborationTaskStatus })
          .where('id = :id AND status IN (:...active)', {
            id: fresh.id,
            active: ['pending', 'handling'],
          })
          .execute();
        if ((updateResult.affected || 0) === 0) {
          // 已被其他 worker 抢先改完，跳过
          continue;
        }
        marked += 1;

        // lead.status 保持 'in_collaboration'，不强制改（按需求）。

        // 接收者：来源运营（handlerId） + 主管（role=admin）
        const receivers = new Set<string>();
        if (fresh.handlerId) receivers.add(fresh.handlerId);
        if (fresh.requesterId) receivers.add(fresh.requesterId);
        const admins = await this.userRepository.find({
          where: { role: 'admin' },
          select: { id: true },
        });
        admins.forEach((a) => receivers.add(a.id));

        if (receivers.size > 0) {
          await this.notificationsService.create({
            receiverIds: Array.from(receivers),
            senderId: null,
            portType: 'operations',
            typeCode: NOTIFICATION_TYPES.COLLABORATION_TIMEOUT,
            title: '协同任务超时',
            content: `协同任务 #${fresh.id} 已超过 ${COLLAB_TIMEOUT_HOURS} 小时未处理`,
            relatedId: fresh.id,
            relatedType: 'collaboration_task',
          });
          notified += 1;
        }

        // 写 operation_logs（system 触发，使用固定的 system 标识作为 userId）
        try {
          await this.operationLogsService.log({
            userId: 'system',
            action: 'status_change',
            targetType: 'collaboration_task',
            targetId: fresh.id,
            detail: `pending/handling → timeout (>= ${COLLAB_TIMEOUT_HOURS}h)`,
          });
        } catch (logErr: any) {
          // log 失败不影响主流程
          this.logger.warn(
            `collab timeout log failed (task=${fresh.id}): ${logErr?.message || logErr}`,
          );
        }
      } catch (err: any) {
        failed += 1;
        this.logger.error(
          `collab timeout process failed (task=${task.id}): ${err?.message || err}`,
        );
      }
    }

    if (marked > 0 || failed > 0) {
      this.logger.log(
        `collab timeout scan: scanned=${dueList.length} marked=${marked} notified=${notified} failed=${failed}`,
      );
    }
    return { scanned: dueList.length, marked, notified, failed };
  }

  /**
   * 列出当前所有 timeout 状态的协同任务（admin/owner 用）。
   * 复用 list() 的可见性过滤 → admin/owner 传 scope=all 才能看到全表。
   */
  async listTimeouts(query: { limit?: number; offset?: number; userId?: string; role?: string }) {
    const safeLimit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
    const safeOffset = Math.max(Number(query.offset) || 0, 0);
    const isAdminLike = query.role === 'admin' || query.role === 'owner';

    const qb = this.repo.createQueryBuilder('t').where('t.status = :status', { status: 'timeout' });
    if (!isAdminLike) {
      // 非 admin/owner 仅看自己相关（自己发起的 / 自己被指派的）
      qb.andWhere('(t.requester_id = :uid OR t.handler_id = :uid)', { uid: query.userId || '' });
    }
    qb.orderBy('t.created_at', 'ASC').take(safeLimit).skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    const items = await this.mapTasks(rows);
    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  private async mapTasks(rows: CollaborationTask[]): Promise<any[]> {
    const leadIds = Array.from(new Set(rows.map((row) => row.leadId).filter(Boolean)));
    const leads = leadIds.length
      ? await this.leadRepository.find({ where: { id: In(leadIds) } })
      : [];
    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    return rows.map((row) => this.map(row, leadById.get(row.leadId)));
  }

  private map(row: CollaborationTask, lead?: Lead): any {
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
      customerName: lead?.nickname || lead?.contactInfo || null,
      contactInfo: lead?.contactInfo || null,
      sourceAccountId: lead?.accountId || null,
      sourcePostId: lead?.postId || null,
      salesRemark: lead?.salesFeedback || lead?.note || null,
      assignedSalesUserId: lead?.assignedSalesUserId || null,
      assignedSalesUserName: lead?.assignedSalesUserName || lead?.salesUserName || null,
    };
  }
}
