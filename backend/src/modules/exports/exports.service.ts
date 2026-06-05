import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Queue } from 'bullmq';
import { ExportTask } from '../../entities/export-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { User } from '../../entities/user.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { Post } from '../../entities/post.entity';
import { Account } from '../../entities/account.entity';
import { Employee } from '../../entities/employee.entity';
import { makeId } from '../../shared/utils/id-generator';
import { StorageService } from '../../shared/storage/storage.service';
import { OperationLogsService } from '../operation-logs/operation-logs.service';

export type ExportType =
  | 'leads'
  | 'orders'
  | 'order_progress'
  | 'collaboration_records'
  | 'posts'
  | 'rankings'
  | 'accounts';

interface CreateDto {
  userId: string;
  userRole: string;
  exportType: ExportType;
  filterJson?: Record<string, any>;
}

const PROCESS_STATUS_LABEL: Record<string, string> = {
  not_contacted: '未联系',
  applied: '已申请',
  pending: '待联系',
  chatting: '沟通中',
  follow_up: '跟进中',
  closed: '已关闭',
};

const ADD_STATUS_LABEL: Record<string, string> = {
  not_added: '未添加',
  added: '已添加',
  rejected: '未通过',
  pending: '待添加',
};

const LEAD_STATUS_LABEL: Record<string, string> = {
  new: '新建',
  contact_added: '已加微',
  follow_up: '跟进中',
  deal_closed: '已成交',
  closed: '已关闭',
};

const INTENTION_LEVEL_LABEL: Record<string, string> = {
  high: '高意向',
  medium: '中意向',
  low: '低意向',
  pending: '待评估',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_accept: '待接单',
  to_receive: '待领取',
  in_progress: '进行中',
  awaiting_client_info: '待客户资料',
  awaiting_teacher: '待安排老师',
  to_deliver: '待交付',
  completed: '已完成',
  abnormal: '异常',
  closed: '已关闭',
};

const PAID_STATUS_LABEL: Record<string, string> = {
  unpaid: '未付款',
  partial: '部分付款',
  paid: '已付清',
  refunded: '已退款',
};

const COLLAB_TYPE_LABEL: Record<string, string> = {
  remind_customer: '催客户',
  supplement_info: '补充信息',
  verify_identity: '验证身份',
  second_touch: '二次触达',
};

const COLLAB_STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  handling: '处理中',
  handled: '已处理',
  closed: '已关闭',
};

const EXPORT_TYPE_LABEL: Record<ExportType, string> = {
  leads: '客资',
  orders: '订单',
  order_progress: '订单跟进',
  collaboration_records: '协同记录',
  posts: '作品',
  rankings: '榜单',
  accounts: '账号',
};

interface DownloadResult {
  ok: true;
  filePath?: string;       // 本地模式：物理路径（res.sendFile 用）
  redirectUrl?: string;    // OSS 模式：签名 URL
  fileSize: number;
  contentType: string;
  ext: string;
  exportType: string;
}

type DownloadError = { ok: false; status: number; message: string };

@Injectable()
export class ExportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExportsService.name);
  private exportQueue: Queue | null = null;
  private readonly redisUrl: string | null = (process.env.REDIS_URL || '').trim() || null;

  constructor(
    @InjectRepository(ExportTask)
    private readonly exportRepo: Repository<ExportTask>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(CollaborationTask)
    private readonly collabRepo: Repository<CollaborationTask>,
    @InjectRepository(Post)
    private readonly postRepo: Repository<Post>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(OrderFollowRecord)
    private readonly orderFollowRepo: Repository<OrderFollowRecord>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly storage: StorageService,
    private readonly operationLogs: OperationLogsService,
  ) {}

  /**
   * 启动时按需建 bullmq Queue。
   * - REDIS_URL 未配置 → 不建 Queue，导出走 in-process setImmediate（与 1.1 行为一致）
   * - REDIS_URL 已配置但连接失败 → 静默回退，记录 warn，不影响主流程
   * 队列名为 'exports'，与 exports.processor.ts 中的 Worker 配对。
   */
  async onModuleInit(): Promise<void> {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set, exports use in-process setImmediate (fallback)');
      return;
    }
    try {
      this.exportQueue = new Queue('exports', {
        connection: { url: this.redisUrl },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 200,
          attempts: 1,
        },
      });
      this.exportQueue.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.warn('[exports] queue error:', err?.message || err);
      });
      this.logger.log(`exports queue initialized (redis: ${this.redisUrl})`);
    } catch (err: any) {
      this.exportQueue = null;
      // eslint-disable-next-line no-console
      console.warn('[exports] failed to init bullmq queue, falling back to in-process:', err?.message || err);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.exportQueue) {
      try {
        await this.exportQueue.close();
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[exports] queue close failed:', err?.message || err);
      }
    }
  }

  /**
   * 创建导出任务，状态置为 processing 并立刻在后台跑实际生成（不阻塞 HTTP 响应）。
   * §11.2 异步生成 + §12 写 exports 表追踪。
   *
   * 调度策略（P-P1-02）：
   *   1) REDIS_URL 已配置且 Queue 初始化成功 → 走 bullmq 队列，
   *      由 ExportsProcessor 异步消费。失败由 processor 写 status='failed'。
   *   2) 否则 → 保留 setImmediate 兜底（与 v1.1 行为一致，本地/演示环境无 Redis 也可用）。
   *   3) queue.add() 抛错（连接抖动）→ 降级到 setImmediate，保证任务不丢。
   *
   * 1 分钟防抖（E/P1-03）：
   *   同 user_id + export_type 在 60 秒内已有未结束的任务时，
   *   返回已有任务 id 而非新建，避免前端"连续点导出"刷出 N 个重复任务。
   *   "未结束"指 status IN ('pending', 'processing')；completed/failed 视为窗口已释放。
   */
  async create(dto: CreateDto): Promise<{ id: string; status: string }> {
    if (dto.userId && dto.exportType) {
      const since = new Date(Date.now() - 60 * 1000);
      const recent = await this.exportRepo
        .createQueryBuilder('e')
        .where('e.user_id = :uid', { uid: dto.userId })
        .andWhere('e.export_type = :t', { t: dto.exportType })
        .andWhere('e.created_at > :since', { since })
        .andWhere("e.status IN ('pending','processing')")
        .orderBy('e.created_at', 'DESC')
        .getOne();
      if (recent) {
        return { id: recent.id, status: recent.status };
      }
    }
    const id = makeId();
    await this.exportRepo.save(this.exportRepo.create({
      id,
      userId: dto.userId,
      exportType: dto.exportType,
      filterJson: JSON.stringify(dto.filterJson || {}),
      status: 'processing',
    } as Partial<ExportTask>));

    if (this.exportQueue) {
      try {
        await this.exportQueue.add('export', {
          exportId: id,
          userId: dto.userId,
          userRole: dto.userRole,
        });
        return { id, status: 'processing' };
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.warn('[exports] queue.add failed, fallback to setImmediate:', err?.message || err);
        // 落到下方 setImmediate 兜底
      }
    }

    // 后台执行（fallback 路径），失败时回写 failed
    setImmediate(() => {
      this.runExport(id, dto.userId, dto.userRole).catch(async (err: any) => {
        // eslint-disable-next-line no-console
        console.error('[exports] runExport failed', err?.message || err);
        try {
          await this.markFailed(id, err?.message || String(err));
        } catch (_e) {
          // 忽略二次失败
        }
      });
    });
    return { id, status: 'processing' };
  }

  /**
   * Processor 调用入口：消费队列里的导出 job。
   * 与 create() 走 setImmediate 时的处理逻辑一致（都跑 runExport），
   * 失败由 BullMQ 走 attempts/retry 策略；最终失败时由 processor 主动调 markFailed。
   */
  async executeFromQueue(exportId: string): Promise<void> {
    await this.runExport(exportId);
  }

  /**
   * 显式标记任务失败（processor / setImmediate 兜底共用）。
   * 不抛错 — 已经是"次生错误"，吞掉避免污染调用方。
   */
  async markFailed(exportId: string, reason?: string): Promise<void> {
    try {
      await this.exportRepo.update(exportId, {
        status: 'failed',
        finishedAt: new Date(),
      });
      // reason 仅做日志（schema 上无 error_message 列，避免扩 schema）
      if (reason) {
        // eslint-disable-next-line no-console
        console.warn(`[exports] task ${exportId} failed: ${reason}`);
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[exports] markFailed update failed:', err?.message || err);
    }
  }

  async listForUser(userId: string, exportType?: string): Promise<any[]> {
    if (!userId) return [];
    const where: any = { userId };
    if (exportType) where.exportType = exportType;
    const rows = await this.exportRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.mapTask(r));
  }

  // ---- §9 / AC-10.2 导出任务列表分页 ----
  // 控制器有 limit/offset 时改走该方法，统一返回 { items, total, limit, offset }；
  // 老接口（listForUser）保留，前端无分页参数时直接返回数组以保持兼容。
  async listForUserPaged(
    userId: string,
    exportType: string | undefined,
    limit: number,
    offset: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    if (!userId) {
      return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
    }
    const where: any = { userId };
    if (exportType) where.exportType = exportType;
    const [rows, total] = await this.exportRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: safeLimit,
      skip: safeOffset,
    });
    return {
      items: rows.map((r) => this.mapTask(r)),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private clampLimit(limit: number): number {
    const n = Number(limit) || 20;
    if (n <= 0) return 20;
    return Math.min(n, 200);
  }

  async findOne(id: string): Promise<any | null> {
    if (!id) return null;
    const row = await this.exportRepo.findOne({ where: { id } });
    if (!row) return null;
    return this.mapTask(row);
  }

  // ---------- 实际生成 ----------

  private async runExport(exportId: string, actorUserId?: string, actorUserRole?: string): Promise<void> {
    const task = await this.exportRepo.findOne({ where: { id: exportId } });
    if (!task) return;
    const filter = this.parseFilter(task.filterJson);
    const userRole = String(filter._userRole || 'staff');

    let csv = '';
    let rowCount = 0;
    switch (task.exportType) {
      case 'leads':
        csv = await this.buildLeadsCsv(filter, userRole);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'orders':
        csv = await this.buildOrdersCsv(filter, userRole);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'order_progress':
        csv = await this.buildOrderProgressCsv(filter, userRole);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'collaboration_records':
        csv = await this.buildCollabCsv(filter);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'accounts':
        csv = await this.buildAccountsCsv(filter);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'posts':
        csv = await this.buildPostsCsv(filter);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      case 'rankings':
        csv = await this.buildRankingsCsv(filter);
        rowCount = csv ? csv.split('\r\n').filter(Boolean).length - 1 : 0;
        break;
      default:
        csv = '未知导出类型\n';
        rowCount = 0;
    }

    const fileUrl = await this.storage.putCsv('exports', `${exportId}.csv`, csv);
    await this.exportRepo.update(exportId, {
      status: 'completed',
      fileUrl,
      finishedAt: new Date(),
    });

    // 导出完成，文件可直接下载，无需发送通知

    // 写 export_create 操作日志（脱敏 filter 字段）
    try {
      const safeFilter: Record<string, any> = {};
      for (const [k, v] of Object.entries(filter || {})) {
        if (k === '_userRole' || k === 'role' || k === 'currentUserId') continue;
        safeFilter[k] = v;
      }
      await this.operationLogs.log({
        userId: actorUserId || task.userId,
        action: 'export_create',
        targetType: 'export_task',
        targetId: exportId,
        detail: JSON.stringify({
          exportType: task.exportType,
          filter: safeFilter,
          rowCount,
        }),
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[exports] log export_create failed:', err?.message || err);
    }
  }

  private parseFilter(raw: string | null): Record<string, any> {
    if (!raw) return {};
    try {
      const v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  private typeNameZh(t: string): string {
    return EXPORT_TYPE_LABEL[(t as ExportType)] || t;
  }

  // ---------- CSV 工具 ----------

  private escapeCsv(v: any): string {
    if (v == null) return '';
    const s = v instanceof Date ? this.fmtDate(v) : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private fmtDate(d: Date): string {
    if (!d) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private toCsv(headers: string[], rows: any[][]): string {
    const lines: string[] = [];
    lines.push(headers.map((h) => this.escapeCsv(h)).join(','));
    for (const row of rows) {
      lines.push(row.map((v) => this.escapeCsv(v)).join(','));
    }
    // CRLF 行分隔，配合 storage 里的 BOM
    return lines.join('\r\n') + '\r\n';
  }

  /**
   * §12 联系方式脱敏：admin / owner 直出，其它角色保留前 3 后 4，中间打 ***。
   */
  private maskContact(contact: string | null, userRole: string): string {
    const v = (contact || '').trim();
    if (!v) return '';
    if (userRole === 'admin' || userRole === 'owner') return v;
    if (v.length <= 7) return v.slice(0, 1) + '***';
    return `${v.slice(0, 3)}***${v.slice(-4)}`;
  }

  // ---------- leads CSV ----------

  private async buildLeadsCsv(filter: Record<string, any>, userRole: string): Promise<string> {
    const qb: SelectQueryBuilder<Lead> = this.leadRepo.createQueryBuilder('l');

    // 按 leads stats / 列表筛选口径（AC-3.2）
    if (filter.employeeId) qb.andWhere('l.employee_id = :eid', { eid: filter.employeeId });
    if (filter.accountId) qb.andWhere('l.account_id = :accountId', { accountId: filter.accountId });
    if (filter.platform) qb.andWhere('l.platform = :platform', { platform: filter.platform });
    if (filter.status) qb.andWhere('l.status = :status', { status: filter.status });
    if (filter.addStatus) qb.andWhere('l.add_status = :addStatus', { addStatus: filter.addStatus });
    if (filter.processStatus) qb.andWhere('l.process_status = :ps', { ps: filter.processStatus });
    if (filter.intentionLevel) qb.andWhere('l.intention_level = :il', { il: filter.intentionLevel });
    if (filter.assignedSalesUserId) {
      qb.andWhere('l.assigned_sales_user_id = :asu', { asu: filter.assignedSalesUserId });
    }
    if (filter.from) qb.andWhere('l.created_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('l.created_at < :to', { to: filter.to });

    qb.orderBy('l.created_at', 'DESC');
    const rows = await qb.getMany();

    const headers = [
      '创建时间',
      '客资编号',
      '平台',
      '来源账号',
      '来源作品',
      '所属运营',
      '销售',
      '联系方式',
      '状态',
      '处理状态',
      '添加状态',
      '意向度',
      '备注',
    ];
    const data = rows.map((r) => [
      r.createdAt,
      r.leadCode || '',
      r.platform || '',
      r.accountId || '',
      r.postId || '',
      r.employeeId || '',
      r.assignedSalesUserName || r.salesUserName || '',
      this.maskContact(r.contactInfo, userRole),
      LEAD_STATUS_LABEL[r.status] || r.status || '',
      PROCESS_STATUS_LABEL[r.processStatus] || r.processStatus || '',
      ADD_STATUS_LABEL[r.addStatus] || r.addStatus || '',
      INTENTION_LEVEL_LABEL[r.intentionLevel] || r.intentionLevel || '',
      r.note || '',
    ]);
    return this.toCsv(headers, data);
  }

  // ---------- orders CSV ----------

  private async buildOrdersCsv(filter: Record<string, any>, userRole: string): Promise<string> {
    // 关联 leads 取客资编号 / 客户名 / 联系方式；统一 raw 查询
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoin('leads', 'l', 'l.id COLLATE utf8mb4_unicode_ci = o.lead_id')
      .select([
        'o.id AS id',
        'o.lead_id AS leadId',
        'o.sales_user_id AS salesUserId',
        'o.academic_user_id AS academicUserId',
        'o.service_type AS serviceType',
        'o.amount AS amount',
        'o.paid_status AS paidStatus',
        'o.order_status AS orderStatus',
        'o.remark AS remark',
        'o.created_at AS createdAt',
        'o.updated_at AS updatedAt',
        'l.lead_code AS leadCode',
        'l.nickname AS clientNickname',
        'l.contact_info AS clientContact',
      ])
      .orderBy('o.created_at', 'DESC');

    if (filter.status) qb.andWhere('o.order_status = :status', { status: filter.status });
    if (filter.paidStatus) qb.andWhere('o.paid_status = :pd', { pd: filter.paidStatus });
    if (filter.salesUserId) qb.andWhere('o.sales_user_id = :su', { su: filter.salesUserId });
    if (filter.academicUserId) {
      qb.andWhere('o.academic_user_id = :au', { au: filter.academicUserId });
    }
    // 角色边界（与 orders.service.list 保持一致，避免 export 越权下载）：
    //   admin / owner + scope=all → 不加限制
    //   academic + scope=pool       → academic_user_id IS NULL
    //   academic + 其它/默认        → 池单 + 自己已认领
    //   sales / 其它非 admin        → 只看自己经手的销售/教务订单
    const role = String(filter.role || '');
    const uid = String(filter.currentUserId || '');
    const scope = String(filter.scope || '');
    const isAdminLike = role === 'admin' || role === 'owner';
    if (!(isAdminLike && (scope === 'all' || !scope))) {
      if (role === 'academic') {
        if (scope === 'pool') {
          qb.andWhere('o.academic_user_id IS NULL');
        } else if (uid) {
          qb.andWhere('(o.academic_user_id IS NULL OR o.academic_user_id = :auid)', { auid: uid });
        } else {
          qb.andWhere('o.academic_user_id IS NULL');
        }
      } else if (uid) {
        qb.andWhere('(o.sales_user_id = :suid OR o.academic_user_id = :suid)', { suid: uid });
      } else {
        // 没有 uid 又非 admin → 不返回任何行，避免泄露
        qb.andWhere('1 = 0');
      }
    }
    if (filter.from) qb.andWhere('o.created_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('o.created_at < :to', { to: filter.to });

    const raws = await qb.getRawMany();

    // 解析用户 ID → 名称（销售 / 教务）
    const userIds = new Set<string>();
    for (const r of raws) {
      if (r.salesUserId) userIds.add(String(r.salesUserId));
      if (r.academicUserId) userIds.add(String(r.academicUserId));
    }
    const userNameMap = await this.fetchUserNames([...userIds]);

    const headers = [
      '创建时间',
      '订单ID',
      '客资编号',
      '客户姓名',
      '联系方式',
      '产品类型',
      '成交金额',
      '付款状态',
      '订单状态',
      '销售姓名',
      '教务姓名',
      '更新时间',
      '交付要求',
    ];
    const data = raws.map((r: any) => [
      r.createdAt ? new Date(r.createdAt) : '',
      r.id || '',
      r.leadCode || '',
      r.clientNickname || '',
      this.maskContact(r.clientContact, userRole),
      r.serviceType || '',
      r.amount || '',
      PAID_STATUS_LABEL[r.paidStatus] || r.paidStatus || '',
      ORDER_STATUS_LABEL[r.orderStatus] || r.orderStatus || '',
      this.userNameOf(userNameMap, r.salesUserId, r.salesUserId),
      this.userNameOf(userNameMap, r.academicUserId, r.academicUserId),
      r.updatedAt ? new Date(r.updatedAt) : '',
      r.remark || '',
    ]);
    return this.toCsv(headers, data);
  }

  // ---------- order_progress CSV ----------
  // 导出订单跟进记录（order_follow_records），按 filter.orderId 或当前用户的可见订单。
  // - admin/owner + scope=all → 全量跟进记录
  // - academic / sales         → 自己经手订单的跟进记录
  // filter：orderId、orderStatus、from、to
  private async buildOrderProgressCsv(filter: Record<string, any>, userRole: string): Promise<string> {
    const role = String(filter.role || '');
    const uid = String(filter.currentUserId || '');
    const scope = String(filter.scope || '');
    const isAdminLike = role === 'admin' || role === 'owner';

    const qb = this.orderFollowRepo
      .createQueryBuilder('f')
      .leftJoin('orders', 'o', 'o.id = f.order_id')
      .leftJoin('leads', 'l', 'l.id COLLATE utf8mb4_unicode_ci = o.lead_id')
      .leftJoin('users', 'su', 'su.id = o.sales_user_id')
      .leftJoin('users', 'au', 'au.id = o.academic_user_id')
      .leftJoin('users', 'fu', 'fu.id = f.user_id')
      .select([
        'f.id AS id',
        'f.order_id AS orderId',
        'f.node_type AS nodeType',
        'f.content AS content',
        'f.next_remind_at AS nextRemindAt',
        'f.created_at AS createdAt',
        'o.order_status AS orderStatus',
        'o.paid_status AS paidStatus',
        'o.service_type AS serviceType',
        'o.amount AS amount',
        'l.lead_code AS leadCode',
        'l.nickname AS clientNickname',
        'l.contact_info AS clientContact',
        'su.username AS salesName',
        'au.username AS academicName',
        'fu.username AS followUserName',
      ])
      .orderBy('f.created_at', 'DESC');

    if (filter.orderId) qb.andWhere('f.order_id = :oid', { oid: filter.orderId });
    if (filter.orderStatus) qb.andWhere('o.order_status = :os', { os: filter.orderStatus });
    if (filter.from) qb.andWhere('f.created_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('f.created_at < :to', { to: filter.to });

    // 角色可见性边界：与 buildOrdersCsv 对齐
    if (!(isAdminLike && (scope === 'all' || !scope))) {
      if (!uid) {
        qb.andWhere('1 = 0');
      } else if (role === 'academic') {
        qb.andWhere('(o.academic_user_id IS NULL OR o.academic_user_id = :auid)', { auid: uid });
      } else {
        qb.andWhere('(o.sales_user_id = :suid OR o.academic_user_id = :suid)', { suid: uid });
      }
    }

    const raws = await qb.getRawMany();

    const headers = [
      '节点时间',
      '订单ID',
      '客资编号',
      '客户姓名',
      '联系方式',
      '产品类型',
      '成交金额',
      '付款状态',
      '订单状态',
      '销售',
      '教务',
      '跟进人',
      '节点类型',
      '节点内容',
      '下次提醒',
    ];
    const data = raws.map((r: any) => [
      r.createdAt ? new Date(r.createdAt) : '',
      r.orderId || '',
      r.leadCode || '',
      r.clientNickname || '',
      this.maskContact(r.clientContact, userRole),
      r.serviceType || '',
      r.amount || '',
      PAID_STATUS_LABEL[r.paidStatus] || r.paidStatus || '',
      ORDER_STATUS_LABEL[r.orderStatus] || r.orderStatus || '',
      r.salesName || '',
      r.academicName || '',
      r.followUserName || '',
      r.nodeType || '',
      r.content || '',
      r.nextRemindAt ? new Date(r.nextRemindAt) : '',
    ]);
    return this.toCsv(headers, data);
  }

  private async fetchUserNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniq = [...new Set(ids.filter(Boolean))];
    if (uniq.length === 0) return map;
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id AS id', 'u.username AS username', 'u.employee_id AS employeeId'])
      .where('u.id IN (:...ids)', { ids: uniq })
      .getRawMany();
    for (const row of users) {
      if (row.id) map.set(String(row.id), String(row.username || row.employeeId || row.id));
    }
    return map;
  }

  private userNameOf(map: Map<string, string>, name: string | null | undefined, fallback: string | null | undefined): string {
    const fallbackStr = String(fallback || '').trim();
    if (!fallbackStr) return '未分配';
    return map.get(fallbackStr) || name || fallbackStr;
  }

  // ---------- collaboration_records CSV ----------

  private async buildCollabCsv(filter: Record<string, any>): Promise<string> {
    const qb = this.collabRepo
      .createQueryBuilder('c')
      .leftJoin('leads', 'l', 'l.id COLLATE utf8mb4_unicode_ci = c.lead_id')
      .select([
        'c.id AS id',
        'c.lead_id AS leadId',
        'c.requester_id AS requesterId',
        'c.handler_id AS handlerId',
        'c.type AS type',
        'c.reason AS reason',
        'c.status AS status',
        'c.handled_note AS handledNote',
        'c.requested_at AS requestedAt',
        'c.handled_at AS handledAt',
        'l.lead_code AS leadCode',
      ])
      .orderBy('c.requested_at', 'DESC');

    if (filter.status) qb.andWhere('c.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('c.type = :type', { type: filter.type });
    if (filter.requesterId) qb.andWhere('c.requester_id = :rq', { rq: filter.requesterId });
    if (filter.handlerId) qb.andWhere('c.handler_id = :hd', { hd: filter.handlerId });
    if (filter.from) qb.andWhere('c.requested_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('c.requested_at < :to', { to: filter.to });

    const raws = await qb.getRawMany();
    const now = Date.now();

    const headers = [
      '申请时间',
      '客资编号',
      '协同类型',
      '申请人',
      '处理人',
      '状态',
      '申请原因',
      '处理备注',
      '处理时间',
      '是否超时',
    ];
    const data = raws.map((r: any) => {
      const requestedAt = r.requestedAt ? new Date(r.requestedAt) : null;
      const handledAt = r.handledAt ? new Date(r.handledAt) : null;
      const isOverdue = (!handledAt && requestedAt &&
        (now - requestedAt.getTime()) > 24 * 3600 * 1000) ? '是' : '否';
      return [
        requestedAt || '',
        r.leadCode || '',
        COLLAB_TYPE_LABEL[r.type] || r.type || '',
        r.requesterId || '',
        r.handlerId || '',
        COLLAB_STATUS_LABEL[r.status] || r.status || '',
        r.reason || '',
        r.handledNote || '',
        handledAt || '',
        isOverdue,
      ];
    });
    return this.toCsv(headers, data);
  }

  // ---------- A端 posts / rankings / accounts CSV ----------

  /**
   * 导出作品数据，普通运营默认只导出自己 employeeId 范围。
   */
  private async buildPostsCsv(filter: Record<string, any>): Promise<string> {
    const qb = this.postRepo
      .createQueryBuilder('p')
      .leftJoin('employees', 'e', 'e.id = p.employee_id')
      .leftJoin('accounts', 'a', 'a.id = p.account_id')
      .select([
        'p.created_at AS createdAt',
        'p.published_at AS publishedAt',
        'p.platform AS platform',
        'p.title AS title',
        'p.post_type AS postType',
        'p.post_url AS postUrl',
        'p.likes AS likes',
        'p.comments AS comments',
        'p.favorites AS favorites',
        'p.shares AS shares',
        'p.traffic AS traffic',
        'p.supervisor_suggestion AS supervisorSuggestion',
        'e.name AS employeeName',
        'a.account_name AS accountName',
      ])
      .orderBy('p.published_at', 'DESC')
      .addOrderBy('p.created_at', 'DESC');
    this.applyPostFilters(qb, filter);
    const rows = await qb.getRawMany();
    return this.toCsv(
      ['创建时间', '发布时间', '平台', '运营', '账号', '标题', '类型', '链接', '点赞', '评论', '收藏', '转发', '流量', '主管建议'],
      rows.map((r: any) => [
        r.createdAt ? new Date(r.createdAt) : '',
        r.publishedAt || '',
        r.platform || '',
        r.employeeName || '',
        r.accountName || '',
        r.title || '',
        r.postType || '',
        r.postUrl || '',
        r.likes || 0,
        r.comments || 0,
        r.favorites || 0,
        r.shares || 0,
        r.traffic || 0,
        r.supervisorSuggestion || '',
      ]),
    );
  }

  /**
   * 导出运营排行榜，口径与 A 端看板保持为 SQL 聚合。
   */
  private async buildRankingsCsv(filter: Record<string, any>): Promise<string> {
    const platformClause = filter.platform ? ' AND p.platform = ?' : '';
    const leadPlatformClause = filter.platform ? ' AND l.platform = ?' : '';
    const params = filter.platform
      ? [filter.platform, filter.platform, filter.platform]
      : [];
    const rows = await this.employeeRepo.query(
      `SELECT
         e.name AS employee_name,
         (SELECT COUNT(*) FROM posts p WHERE p.employee_id = e.id${platformClause}) AS post_count,
         (SELECT COUNT(*) FROM leads l WHERE l.employee_id = e.id${leadPlatformClause}) AS lead_count,
         (SELECT COALESCE(SUM(p.likes), 0) FROM posts p WHERE p.employee_id = e.id${platformClause}) AS likes
       FROM employees e
       ORDER BY lead_count DESC, likes DESC, post_count DESC`,
      params,
    );
    return this.toCsv(
      ['员工', '作品数', '客资数', '点赞数'],
      rows.map((r: any) => [
        r.employee_name || '',
        r.post_count || 0,
        r.lead_count || 0,
        r.likes || 0,
      ]),
    );
  }

  /**
   * 导出运营账号，主管/管理员可导出全量，运营仅导出自己负责账号。
   * 角色边界：admin / owner / supervisor 全量；staff 限本人 employeeId；其它角色不允许
   */
  private async buildAccountsCsv(filter: Record<string, any>): Promise<string> {
    const qb: SelectQueryBuilder<Account> = this.accountRepo.createQueryBuilder('a');

    if (filter.platform) qb.andWhere('a.platform = :platform', { platform: filter.platform });
    if (filter.employeeId) qb.andWhere('a.employee_id = :eid', { eid: filter.employeeId });
    if (filter.status) qb.andWhere('a.status = :status', { status: filter.status });
    if (filter.keyword) {
      const kw = `%${String(filter.keyword).trim()}%`;
      qb.andWhere(
        '(a.account_name LIKE :kw OR a.account_uid LIKE :kw OR a.persona LIKE :kw OR a.positioning LIKE :kw)',
        { kw },
      );
    }

    // 角色边界：admin / owner / supervisor 看全部；staff 默认看自己名下；其它角色不允许
    const role = String(filter.role || filter._userRole || '');
    const uid = String(filter.currentUserId || '');
    const scope = String(filter.scope || '');
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';
    if (!(isAdminLike && (scope === 'all' || !scope))) {
      if (role === 'staff' && uid) {
        qb.andWhere('a.employee_id = :auid', { auid: uid });
      } else {
        // 非 admin 也没指定 staff+uid → 不返回任何行
        qb.andWhere('1 = 0');
      }
    }

    qb.orderBy('a.created_at', 'DESC');
    const rows = await qb.getMany();

    // 收集 employeeId，批量解析为员工姓名（运营负责人列展示姓名，employeeId 仍可由前端筛选）
    const employeeIds = Array.from(
      new Set(rows.map((r) => String(r.employeeId || '').trim()).filter((id) => id.length > 0)),
    );
    const nameMap = new Map<string, string>();
    if (employeeIds.length > 0) {
      const placeholders = employeeIds.map(() => '?').join(',');
      const empRows: Array<{ id: string; name: string | null; employee_code: string | null }> =
        await this.employeeRepo.query(
          `SELECT id, name, employee_code FROM employees WHERE id IN (${placeholders})`,
          employeeIds,
        );
      for (const emp of empRows) {
        nameMap.set(emp.id, (emp.name || emp.employee_code || '').trim());
      }
    }

    const headers = [
      '创建时间',
      '账号ID',
      '运营负责人',
      '平台',
      '账号名称',
      '账号UID',
      '主页链接',
      '人设',
      '定位',
      '发布计划',
      '状态',
    ];
    const data = rows.map((r) => {
      const eid = String(r.employeeId || '').trim();
      const employeeName = eid ? (nameMap.get(eid) || eid) : '';
      return [
        r.createdAt,
        r.id || '',
        employeeName,
        r.platform || '',
        r.accountName || '',
        r.accountUid || '',
        r.profileUrl || '',
        r.persona || '',
        r.positioning || '',
        r.postingPlan || '',
        r.status || '',
      ];
    });
    return this.toCsv(headers, data);
  }

  private applyPostFilters(qb: SelectQueryBuilder<Post>, filter: Record<string, any>): void {
    if (filter.employeeId) qb.andWhere('p.employee_id = :employeeId', { employeeId: filter.employeeId });
    if (filter.accountId) qb.andWhere('p.account_id = :accountId', { accountId: filter.accountId });
    if (filter.platform) qb.andWhere('p.platform = :platform', { platform: filter.platform });
    if (filter.postType) qb.andWhere('p.post_type = :postType', { postType: filter.postType });
    if (filter.from) qb.andWhere('p.published_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('p.published_at <= :to', { to: filter.to });
    const role = String(filter.role || filter._userRole || '');
    if (!['admin', 'owner', 'supervisor'].includes(role)) {
      const employeeId = String(filter.employeeId || filter.currentEmployeeId || '');
      if (employeeId) qb.andWhere('p.employee_id = :selfEmployeeId', { selfEmployeeId: employeeId });
    }
  }

  // ---------- mapping ----------

  private mapTask(row: ExportTask): any {
    let filter: any = {};
    try {
      filter = row.filterJson ? JSON.parse(row.filterJson) : {};
    } catch {
      filter = {};
    }
    // 返回给前端时去掉 _userRole 这种内部字段
    if (filter && typeof filter === 'object') {
      delete filter._userRole;
    }
    return {
      id: row.id,
      userId: row.userId,
      exportType: row.exportType,
      filter,
      fileUrl: row.fileUrl,
      status: row.status,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      updatedAt: row.updatedAt,
    };
  }

  // ---------- 下载 ----------

  /**
   * 解析下载所需的物理文件 / 签名 URL。控制器拿到结果后再设置响应头。
   * - 权限：admin / owner 可下全部；其它角色只能下自己创建的
   * - 状态：仅 completed 可下；其它状态返回 409
   * - 文件：fileUrl 为空 / 文件不存在 → 410
   */
  async resolveDownload(
    id: string,
    userId: string,
    role: string,
  ): Promise<DownloadResult | DownloadError> {
    if (!id) {
      return { ok: false, status: 400, message: 'invalid id' };
    }
    const task = await this.exportRepo.findOne({ where: { id } });
    if (!task) {
      return { ok: false, status: 404, message: 'not found' };
    }
    // v1.3 BF-SUPERVISOR-EXPORT：supervisor 权限等同 admin/owner，可下载任意导出任务。
    // 非 admin/owner/supervisor 看不到别人的任务，统一 404 避免泄露任务存在性。
    const isAdminLike =
      role === 'admin' || role === 'owner' || role === 'supervisor';
    if (!isAdminLike && task.userId && task.userId !== userId) {
      return { ok: false, status: 404, message: 'not found' };
    }
    if (task.status !== 'completed') {
      return { ok: false, status: 409, message: `task not ready: ${task.status}` };
    }
    if (!task.fileUrl) {
      return { ok: false, status: 410, message: 'file gone' };
    }
    const { contentType, ext } = this.contentTypeOf(task.exportType);

    // OSS 模式：fileUrl 形如 /api/uploads/view/<bucket>/<key>
    //           → 调 storage.getReadableUrl 拿签名 URL，redirect 过去
    // 本地模式：fileUrl 形如 /uploads/<bucket>/<key>
    //           → storage.resolveLocalPath 转物理路径，res.sendFile
    if (this.storage.getDriver && this.storage.getDriver() === 'oss') {
      // 把 /api/uploads/view/... 转成 bucket/key 后取签名 URL
      const parsed = this.parseAppViewUrl(task.fileUrl);
      if (parsed) {
        const url = this.storage.getReadableUrl(parsed.bucket, parsed.key);
        // 用签名 URL 时拿不到 size，跳过 Content-Length
        return {
          ok: true,
          redirectUrl: url,
          fileSize: 0,
          contentType,
          ext,
          exportType: task.exportType,
        };
      }
    }

    const localPath = this.storage.resolveLocalPath(task.fileUrl);
    if (!localPath) {
      // fileUrl 不是 /uploads/ 开头 → 无法本地化
      return { ok: false, status: 410, message: 'file gone' };
    }
    let stat: import('fs').Stats;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      stat = require('fs').statSync(localPath);
    } catch (_e) {
      return { ok: false, status: 410, message: 'file gone' };
    }
    if (!stat.isFile()) {
      return { ok: false, status: 410, message: 'file gone' };
    }
    return {
      ok: true,
      filePath: localPath,
      fileSize: stat.size,
      contentType,
      ext,
      exportType: task.exportType,
    };
  }

  private contentTypeOf(exportType: string): { contentType: string; ext: string } {
    // 当前实现统一是 CSV；xlsx 走相同 ext/contentType 占位，等真实实现再切
    switch (exportType) {
      case 'posts':
      case 'rankings':
      case 'leads':
      case 'orders':
      case 'order_progress':
      case 'collaboration_records':
      case 'accounts':
      default:
        return { contentType: 'text/csv; charset=utf-8', ext: 'csv' };
    }
  }

  private parseAppViewUrl(url: string): { bucket: string; key: string } | null {
    // /api/uploads/view/<bucket>/<key>
    const prefix = '/api/uploads/view/';
    if (!url || !url.startsWith(prefix)) return null;
    const rest = decodeURIComponent(url.slice(prefix.length));
    const idx = rest.indexOf('/');
    if (idx < 0) return null;
    return { bucket: rest.slice(0, idx), key: rest.slice(idx + 1) };
  }

  /**
   * 写下载日志（service 层封装，controller 调）。
   * 不影响主流程：失败只 warn。
   */
  async logDownload(ctx: {
    taskId: string;
    userId: string;
    role: string;
    exportType: string;
    ip?: string;
  }): Promise<void> {
    try {
      await this.operationLogs.log({
        userId: ctx.userId,
        action: 'export_download',
        targetType: 'export_task',
        targetId: ctx.taskId,
        detail: JSON.stringify({ exportType: ctx.exportType, role: ctx.role }),
        ip: ctx.ip,
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn('[exports] log export_download failed:', err?.message || err);
    }
  }
}
