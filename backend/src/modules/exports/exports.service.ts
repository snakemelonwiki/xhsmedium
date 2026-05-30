import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ExportTask } from '../../entities/export-task.entity';
import { Lead } from '../../entities/lead.entity';
import { Order } from '../../entities/order.entity';
import { CollaborationTask } from '../../entities/collaboration-task.entity';
import { makeId } from '../../shared/utils/id-generator';
import { StorageService } from '../../shared/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

export type ExportType =
  | 'leads'
  | 'orders'
  | 'collaboration_records'
  | 'posts'
  | 'rankings';

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
  to_receive: '待接单',
  in_progress: '进行中',
  awaiting_client_info: '待客户资料',
  awaiting_teacher: '待安排老师',
  to_deliver: '待交付',
  completed: '已完成',
  abnormal: '异常',
};

const PAID_STATUS_LABEL: Record<string, string> = {
  unpaid: '未付款',
  partial: '部分付款',
  paid: '已付款',
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
  collaboration_records: '协同记录',
  posts: '作品',
  rankings: '榜单',
};

@Injectable()
export class ExportsService {
  constructor(
    @InjectRepository(ExportTask)
    private readonly exportRepo: Repository<ExportTask>,
    @InjectRepository(Lead)
    private readonly leadRepo: Repository<Lead>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(CollaborationTask)
    private readonly collabRepo: Repository<CollaborationTask>,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * 创建导出任务，状态置为 processing 并立刻在后台跑实际生成（不阻塞 HTTP 响应）。
   * §11.2 异步生成 + §12 写 exports 表追踪。
   */
  async create(dto: CreateDto): Promise<{ id: string; status: string }> {
    const id = makeId();
    await this.exportRepo.save(this.exportRepo.create({
      id,
      userId: dto.userId,
      exportType: dto.exportType,
      filterJson: JSON.stringify(dto.filterJson || {}),
      status: 'processing',
    } as Partial<ExportTask>));
    // 后台执行，失败时回写 failed
    setImmediate(() => {
      this.runExport(id).catch(async (err: any) => {
        // eslint-disable-next-line no-console
        console.error('[exports] runExport failed', err?.message || err);
        try {
          await this.exportRepo.update(id, {
            status: 'failed',
            finishedAt: new Date(),
          });
        } catch (_e) {
          // 忽略二次失败
        }
      });
    });
    return { id, status: 'processing' };
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

  private async runExport(exportId: string): Promise<void> {
    const task = await this.exportRepo.findOne({ where: { id: exportId } });
    if (!task) return;
    const filter = this.parseFilter(task.filterJson);
    const userRole = String(filter._userRole || 'staff');

    let csv = '';
    switch (task.exportType) {
      case 'leads':
        csv = await this.buildLeadsCsv(filter, userRole);
        break;
      case 'orders':
        csv = await this.buildOrdersCsv(filter);
        break;
      case 'collaboration_records':
        csv = await this.buildCollabCsv(filter);
        break;
      case 'posts':
      case 'rankings':
        // A 端导出待实现，先落一份占位文件，避免下载链接 404
        csv = 'A 端导出待实现\n';
        break;
      default:
        csv = '未知导出类型\n';
    }

    const fileUrl = await this.storage.putCsv('exports', `${exportId}.csv`, csv);
    await this.exportRepo.update(exportId, {
      status: 'completed',
      fileUrl,
      finishedAt: new Date(),
    });

    // §11.1 export_done: 通知发起人下载
    if (task.userId) {
      await this.notifications.create({
        receiverIds: [task.userId],
        senderId: null,
        portType: 'operations',
        typeCode: NOTIFICATION_TYPES.EXPORT_DONE,
        title: `${this.typeNameZh(task.exportType)}导出完成`,
        content: `点击下载：${fileUrl}`,
        relatedId: exportId,
        relatedType: 'export',
      });
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

  private async buildOrdersCsv(filter: Record<string, any>): Promise<string> {
    // 关联 leads 取客资编号，统一用 raw 查询
    const qb = this.orderRepo
      .createQueryBuilder('o')
      // leads 表 collation = utf8mb4_0900_ai_ci，orders 表 = utf8mb4_unicode_ci；JOIN 必须强制对齐
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
        'l.lead_code AS leadCode',
      ])
      .orderBy('o.created_at', 'DESC');

    if (filter.status) qb.andWhere('o.order_status = :status', { status: filter.status });
    if (filter.paidStatus) qb.andWhere('o.paid_status = :pd', { pd: filter.paidStatus });
    if (filter.salesUserId) qb.andWhere('o.sales_user_id = :su', { su: filter.salesUserId });
    if (filter.academicUserId) {
      qb.andWhere('o.academic_user_id = :au', { au: filter.academicUserId });
    }
    if (filter.role === 'academic' && filter.currentUserId && filter.scope !== 'all') {
      qb.andWhere('o.academic_user_id = :uid', { uid: filter.currentUserId });
    }
    if (filter.from) qb.andWhere('o.created_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('o.created_at < :to', { to: filter.to });

    const raws = await qb.getRawMany();

    const headers = [
      '创建时间',
      '订单ID',
      '客资编号',
      '销售',
      '教务',
      '服务类型',
      '金额',
      '付款状态',
      '订单状态',
      '备注',
    ];
    const data = raws.map((r: any) => [
      r.createdAt ? new Date(r.createdAt) : '',
      r.id || '',
      r.leadCode || '',
      r.salesUserId || '',
      r.academicUserId || '',
      r.serviceType || '',
      r.amount || '',
      PAID_STATUS_LABEL[r.paidStatus] || r.paidStatus || '',
      ORDER_STATUS_LABEL[r.orderStatus] || r.orderStatus || '',
      r.remark || '',
    ]);
    return this.toCsv(headers, data);
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
}
