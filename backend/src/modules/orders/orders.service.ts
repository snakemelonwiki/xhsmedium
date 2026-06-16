import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { Order, HANDOVER_STATUS_CODES, HandoverStatusCode } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { OrderFinance } from '../../entities/order-finance.entity';
import { OrderAuthor } from '../../entities/order-author.entity';
import { OrderSubmission } from '../../entities/order-submission.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';
import { RemindersService as OrderRemindersService } from './reminders.service';

type PaidStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';
type OrderStatus =
  | 'pending_accept'
  | 'to_receive'
  | 'in_progress'
  | 'awaiting_client_info'
  | 'awaiting_teacher'
  | 'to_deliver'
  | 'completed'
  | 'abnormal'
  | 'closed';

type BackupTeacherRow = {
  teacherId?: string | null;
  teacherName?: string | null;
  teacherPhone?: string | null;
  teacherStability?: string | null;
};

const ALLOWED_PAID: PaidStatus[] = ['unpaid', 'partial', 'paid', 'refunded'];
const ALLOWED_ORDER_STATUS: OrderStatus[] = [
  'pending_accept',
  'to_receive',
  'in_progress',
  'awaiting_client_info',
  'awaiting_teacher',
  'to_deliver',
  'completed',
  'abnormal',
  'closed',
];
const ACADEMIC_DELIVERY_ROLES = ['admin', 'owner', 'supervisor', 'academic', 'academic_supervisor'];
const ALLOWED_HANDOVER_STATUS: HandoverStatusCode[] = [...HANDOVER_STATUS_CODES];
const ACADEMIC_STAGE_TO_STATUS: Record<string, OrderStatus> = {
  待补客户资料: 'awaiting_client_info',
  待补资料: 'awaiting_client_info',
  awaiting_client_info: 'awaiting_client_info',
  待分配老师: 'awaiting_teacher',
  awaiting_teacher: 'awaiting_teacher',
};

// N-P1-02: ORDER_UPDATED 通知去重窗口。
// 同一 (orderId, 变化字段组合) 在窗口内只发一次，避免客户端 PATCH 重试
// 或前端多次保存产生刷屏。30s 与典型用户的"再次点保存"操作间隔吻合。
const ORDER_UPDATED_DEDUP_MS = 30_000;

const ORDER_UPDATED_FIELD_LABELS: Record<string, string> = {
  orderStatus: '订单状态',
  paidStatus: '付款状态',
  academicUserId: '教务归属',
  serviceType: '服务类型',
  amount: '订单金额',
  paymentStage: '付款阶段',
  clientPaid: '付款金额',
  remark: '备注',
};

interface CloseDealDto {
  serviceType?: string | null;
  amount?: number | string | null;
  clientPaid?: number | string | null;
  remark?: string | null;
  // v1.3 / SA-8 销售成交录入扩展字段
  productType?: string | null;
  guaranteeType?: string | null;
  paymentStage?: string | null;
  clientRequirementNote?: string | null;
  contractStatus?: string | null;
  paidStatus?: string | null;
  deliveryRequirement?: string | null;
  expectedHandleTime?: string | Date | null;
}

interface ListOrdersOptions {
  role?: string;
  status?: string;
  handoverStatus?: string;
  scope?: string;
  currentUserId?: string;
  sessionRole?: string;
  // 1.2 搜索/筛选 — 模糊搜索 + 条件搜索
  keyword?: string;
  paidStatus?: string;
  salesId?: string;
  academicAdminId?: string;
  serviceType?: string;
  startDate?: string;
  endDate?: string;
  abnormal?: boolean;
}

interface OrderPatchDto {
  order_status?: OrderStatus;
  paid_status?: PaidStatus;
  academic_user_id?: string | null;
  service_type?: string | null;
  amount?: number | string | null;
  payment_stage?: string | null;
  client_paid?: number | string | null;
  remark?: string | null;
}

interface OrderFollowDto {
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | Date | null;
  remindStage?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

interface OrderDeliveryDto {
  order?: Record<string, any>;
  authors?: Array<Record<string, any>>;
  submissions?: Array<Record<string, any>>;
  backupSubmissions?: Array<Record<string, any>>;
  finance?: Record<string, any>;
}

interface OrderActor {
  userId?: string;
  role?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderFollowRecord)
    private readonly orderFollowRepository: Repository<OrderFollowRecord>,
    @InjectRepository(OrderFinance)
    private readonly orderFinanceRepository: Repository<OrderFinance>,
    @InjectRepository(OrderAuthor)
    private readonly orderAuthorRepository: Repository<OrderAuthor>,
    @InjectRepository(OrderSubmission)
    private readonly orderSubmissionRepository: Repository<OrderSubmission>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * N-P1-02: ORDER_UPDATED 通知去重缓存。key = `orderId:changedFieldsSorted`，
   * value = 上次发送时间戳。仅进程内有效，进程重启后清空。
   * 用 Map 而非外部存储是为了避免引入新依赖 + 失败时宁可重复发也不漏发。
   */
  private readonly orderUpdatedDedup = new Map<string, number>();

  /**
   * Sales marks a lead as deal-closed and spawns a new order in a single transaction.
   */
  async closeDeal(
    leadId: string,
    salesUserId: string,
    dto: CloseDealDto,
  ): Promise<{ orderId: string; orderCode: string | null; orderFinanceId: string }> {
    if (!salesUserId) {
      throw new BadRequestException('sales user required');
    }
    // v1.3 / BF-09 close-deal-amount: 订单金额必填且 > 0。
    // 老接口允许 amount 为 null / 0，导致成交订单无金额（财务对账、补单均受影响）。
    // 强校验：缺失、null、空字符串、0、负数 一律拒绝。
    const rawAmount = dto.amount;
    let amountNum: number | null = null;
    if (rawAmount !== undefined && rawAmount !== null && rawAmount !== '') {
      const parsed = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
      if (Number.isFinite(parsed) && parsed > 0) {
        amountNum = parsed;
      }
    }
    if (amountNum === null) {
      throw new BadRequestException('订单金额必填且必须大于0');
    }
    const paidStatus = this.normalizeRequiredPaidStatus(dto.paidStatus);
    const paymentStage = this.normalizeRequiredPaymentStage(dto.paymentStage);
    const clientPaid = this.normalizePositiveMoney(dto.clientPaid);
    if (clientPaid === null) {
      throw new BadRequestException('付款金额必填且必须大于0');
    }
    const orderId = makeId();
    const orderFinanceId = makeId();
    let leadContact = '';
    let orderCode: string | null = null;
    let generatedOrderCode: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      const lead = await manager.findOne(Lead, { where: { id: leadId } });
      if (!lead) {
        throw new NotFoundException('lead not found');
      }
      leadContact = lead.contactInfo || '';
      const pricing = await this.resolveLeadOrderPricing(manager, lead, amountNum);
      // 在同一事务内生成订单编号，沿用既有顺序号来源与行锁机制，只调整展示规则。
      // 必须在 INSERT Order 之前完成，避免并发时序号重复。
      generatedOrderCode = await this.generateOrderCode(manager, {
        productType: dto.productType,
        serviceType: dto.serviceType,
        major: lead.clientMajorResearch || lead.majorContent || null,
      });
      orderCode = generatedOrderCode;
      // v1.3 / SA-8: 销售成交的 serviceType 字段可以同时承载"产品类型"语义,
      // 但前端会把产品类型/服务类型分开传。后端保持 serviceType 字段为原"服务类型",
      // 新加的"产品类型/保障类型/付款阶段"等放到 remark / order_finance 阶段备注中。
      const mergedServiceType = dto.serviceType
        || (dto.productType ? String(dto.productType) : null)
        || null;
      // BF-09b 修复 (2026-06-04) — 改用 raw SQL 替代 manager.insert() / manager.update():
      //   TypeORM 1.0 在 InsertQueryBuilder/UpdateQueryBuilder 的 `addFrom` 路径里会
      //   把 entity class 当作 entityTarget 传入 `entityOrProperty(this.subQuery())`。
      //   entityTarget 是 ES6 class 时,无 new 调用抛 "Class constructor X cannot be
      //   invoked without 'new'"。本补丁虽在 main.ts 加了 addFrom monkey-patch 绕开
      //   hasMetadata 检查,但 entity class 与 metadata 注册顺序在 NestJS 异步初始化
      //   下不稳定,仍可能漏判。raw SQL 100% 绕开 TypeORM 1.0 这条 bug 路径,且语义
      //   与 insert/update 等价（带参数化,无 SQL 注入风险）。
      const remark = this.composeRemark(dto, pricing);
      // 上面已经校验 amountNum > 0；统一以 string 形式落库。
      const amountStr = pricing.finalAmount;
      const clientPending = this.computePending(amountStr, clientPaid) || '0.00';
      const customerName = lead.nickname || lead.contactInfo || null;
      const educationLevel = lead.clientDegree || null;
      const major = lead.clientMajorResearch || lead.majorContent || null;
      const area = lead.ip || null;
      const articlePurpose = lead.intention || null;
      await manager.query(
        `UPDATE leads
         SET process_status = ?, deal_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        ['deal_done', 'deal_done', 'in_followup', leadId],
      );
      await manager.query(
        `INSERT INTO orders
         (id, lead_id, sales_user_id, academic_user_id, service_type, amount,
          paid_status, order_status, handover_status, remark, order_code,
          product_type, guarantee_type, payment_stage, customer_name,
          education_level, major, area, article_purpose, sales_contact,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          orderId,
          leadId,
          salesUserId,
          null,
          mergedServiceType,
          amountStr,
          paidStatus,
          'to_receive',
          'handed_over',
          remark,
          orderCode,
          dto.productType || null,
          dto.guaranteeType || null,
          paymentStage,
          customerName,
          educationLevel,
          major,
          area,
          articlePurpose,
          lead.contactInfo || null,
        ],
      );

      // v1.3 / SA-9: 创建 order_finance(订单额/已付/待付 = 订单额 - 已付 = 订单额)。
      await manager.query(
        `INSERT INTO order_finance
         (id, order_id, order_amount, client_paid, client_pending,
          teacher_price, teacher_paid, teacher_pending, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          orderFinanceId,
          orderId,
          amountStr,
          clientPaid,
          clientPending,
          null,
          null,
          null,
        ],
      );

      // v1.3 / SA-9: 落首条 order_follow_records(销售成交记录)。
      const followContent = this.composeFollowContent(dto, generatedOrderCode, pricing);
      const followId = makeId();
      await manager.query(
        `INSERT INTO order_follow_records
         (id, order_id, user_id, node_type, content, next_remind_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          followId,
          orderId,
          salesUserId,
          '销售成交',
          followContent,
          dto.expectedHandleTime ? new Date(dto.expectedHandleTime) : null,
        ],
      );
    });

    // §11.1 deal_closed: 通知教务 / 主管。
    // 简化版：通知所有 academic / admin / owner 角色的用户。
    //
    // BF-09b 修复 (2026-06-04) — 避免 TypeORM 1.0 `this.subQuery is not a function`：
    //   原写法 `.where('user.role IN (:...roles)', { roles: [...] })` 在 TypeORM 1.0 下
    //   会被当成子查询构造器并调用 `this.subQuery()`，新版本该方法签名变更而抛错。
    //   即便改成 `In([...])`，`createQueryBuilder().where({...}).getMany()` 仍会在
    //   `addFrom` 解析时触发 `entityTarget(this.subQuery())`(QueryBuilder.js:440)，
    //   报错依旧。最稳的绕过方式：走 `Repository.find({ where })` 不创建 QueryBuilder，
    //   完全避开 subQuery 解析路径。
    try {
      // 走原始 SQL 绕开 TypeORM 1.0 `this.subQuery is not a function`（Repository.find
      // 内部 createQueryBuilder + applyFindOptions 仍会触发 subQuery 解析路径）。
      const rawReceivers: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM users WHERE role IN (?, ?, ?)`,
        ['academic', 'admin', 'owner'],
      );
      const ids = rawReceivers.map((u) => u.id).filter((id) => id && id !== salesUserId);
      if (ids.length > 0) {
        await this.notificationsService.create({
          receiverIds: ids,
          senderId: salesUserId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '新订单已成交',
          content: `客资 ${leadContact} 已成交（订单号 ${orderCode || orderId}），请尽快接单`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[orders] notify deal closed failed', err?.message || err);
    }

    return { orderId, orderCode, orderFinanceId };
  }

  /**
   * v1.3 / SA-8: 合成 orders.remark 字段，把客户要求/产品类型/服务类型/保障类型/付款阶段
   * 拼成结构化文本（用「||」分隔），便于教务端拆开解析。
   * 例：`客户要求: 12周见刊 || 产品: 期刊论文 || 服务: 全流程 || 保障: 保录 || 付款: 定金 / 中期 / 尾款`
   */
  private composeRemark(
    dto: CloseDealDto,
    pricing?: { discountApplied: boolean; originalAmount: string; finalAmount: string },
  ): string | null {
    const parts: string[] = [];
    if (dto.clientRequirementNote) parts.push(`客户要求: ${dto.clientRequirementNote}`);
    if (dto.productType) parts.push(`产品: ${dto.productType}`);
    if (dto.serviceType && dto.serviceType !== dto.productType) parts.push(`服务: ${dto.serviceType}`);
    if (dto.guaranteeType) parts.push(`保障: ${dto.guaranteeType}`);
    if (dto.paymentStage) parts.push(`付款: ${dto.paymentStage}`);
    if (dto.deliveryRequirement) parts.push(`交付要求: ${dto.deliveryRequirement}`);
    if (pricing?.discountApplied) {
      parts.push(`不合格作品半价: 原金额 ${pricing.originalAmount} -> 入单金额 ${pricing.finalAmount}`);
    }
    if (parts.length === 0) return dto.remark || null;
    return parts.join(' || ');
  }

  /**
   * v1.3 / SA-9: 销售成交首条 order_follow_records 的 content 文本。
   */
  private composeFollowContent(
    dto: CloseDealDto,
    orderCode: string | null,
    pricing?: { discountApplied: boolean; originalAmount: string; finalAmount: string },
  ): string {
    const codeLine = orderCode ? `订单编号 ${orderCode}` : '';
    const amountLine = pricing?.discountApplied
      ? `原金额 ¥${pricing.originalAmount} | 不合格作品半价入单金额 ¥${pricing.finalAmount}`
      : dto.amount != null && dto.amount !== '' ? `金额 ¥${dto.amount}` : '';
    const stageLine = dto.paymentStage ? `付款阶段 ${dto.paymentStage}` : '';
    const paidLine = dto.clientPaid != null && dto.clientPaid !== '' ? `已付 ¥${dto.clientPaid}` : '';
    const lines = [codeLine, amountLine, stageLine, paidLine].filter(Boolean);
    return lines.join(' | ') || '销售成交';
  }

  /**
   * 计算客资成单金额。
   * 来源作品被主管标记为不合格时，销售输入金额按 50% 写入订单与财务表。
   */
  private async resolveLeadOrderPricing(
    manager: EntityManager,
    lead: Lead,
    amountNum: number,
  ): Promise<{ discountApplied: boolean; originalAmount: string; finalAmount: string }> {
    const originalAmount = amountNum.toFixed(2);
    const postId = lead.postId || lead.matchedPostId || '';
    if (!postId) {
      return { discountApplied: false, originalAmount, finalAmount: originalAmount };
    }
    const rows: Array<{ supervisor_quality_status?: string }> = await manager.query(
      `SELECT supervisor_quality_status FROM posts WHERE id = ? LIMIT 1`,
      [postId],
    );
    const isUnqualified = String(rows[0]?.supervisor_quality_status || '').toLowerCase() === 'unqualified';
    if (!isUnqualified) {
      return { discountApplied: false, originalAmount, finalAmount: originalAmount };
    }
    return {
      discountApplied: true,
      originalAmount,
      finalAmount: (Math.round(amountNum * 50) / 100).toFixed(2),
    };
  }

  /**
   * 生成成交订单编号，沿用既有当日顺序号表与事务行锁，仅调整编号模板。
   */
  private async generateOrderCode(
    manager: EntityManager,
    options: { productType?: string | null; serviceType?: string | null; major?: string | null },
  ): Promise<string> {
    // 校验并锁定当日顺序号，确保并发成交时递增顺序稳定。
    const { dateKey, compactDate } = this.getOrderCodeDateParts();
    const rawSequence = await this.getNextOrderCodeSequence(manager, dateKey);

    // 按文档模板拼接订单编号：YL + 顺序编号（190开始） + 产品类型 + 服务类型 + 日期 + 专业。
    const displaySequence = rawSequence + 189;
    const productType = this.normalizeOrderCodeSegment(options.productType);
    const serviceType = this.normalizeOrderCodeSegment(options.serviceType);
    const major = this.normalizeOrderCodeSegment(options.major);
    return `YL${displaySequence}${productType}${serviceType}${compactDate}${major}`;
  }

  /**
   * 计算订单编号使用的北京时间日期片段。
   */
  private getOrderCodeDateParts(): { dateKey: string; compactDate: string } {
    const now = new Date();
    const utc8Ms = now.getTime() + 8 * 3600 * 1000;
    const utc8 = new Date(utc8Ms);
    const yyyy = utc8.getUTCFullYear();
    const mm = String(utc8.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(utc8.getUTCDate()).padStart(2, '0');
    return {
      dateKey: `${yyyy}-${mm}-${dd}`,
      compactDate: `${yyyy}${mm}${dd}`,
    };
  }

  /**
   * 获取下一个订单顺序号，沿用 orders_order_code_seq 的按日递增来源。
   */
  private async getNextOrderCodeSequence(manager: EntityManager, dateKey: string): Promise<number> {
    await manager.query(
      `INSERT INTO orders_order_code_seq (seq_date, current_seq)
       VALUES (?, 0)
       ON DUPLICATE KEY UPDATE seq_date = seq_date`,
      [dateKey],
    );
    const rows: Array<{ current_seq: number | string }> = await manager.query(
      `SELECT current_seq FROM orders_order_code_seq WHERE seq_date = ? FOR UPDATE`,
      [dateKey],
    );
    const raw = rows[0]?.current_seq;
    const currentSeq = Number(raw ?? 0) || 0;
    const nextSeq = currentSeq + 1;
    await manager.query(
      `UPDATE orders_order_code_seq SET current_seq = ? WHERE seq_date = ?`,
      [nextSeq, dateKey],
    );
    return nextSeq;
  }

  /**
   * 标准化订单编号片段，去掉空白与分隔符，缺失时返回空串避免拼出 null/undefined。
   */
  private normalizeOrderCodeSegment(value?: string | null): string {
    if (value === undefined || value === null) return '';
    return String(value).trim().replace(/[\s\-_/]+/g, '');
  }

  private async getActorContext(
    actorUserId: string,
  ): Promise<{ role: string; employeeId: string | null }> {
    // P0-NEW-03: 给 handover 4 路由的 owner 校验提供 role / employeeId 上下文。
    // 一次轻量查询（仅取 role / employee_id），替代在 controller 透传 session。
    // 返回 { role, employeeId }；role 用于 admin/owner 旁路，employeeId 用于学术 ownership 校验
    // （orders.academic_user_id 存的是 employees.id，不是 users.id）。
    if (!actorUserId) return { role: '', employeeId: null };
    try {
      const user = await this.userRepository.findOne({
        where: { id: actorUserId },
        select: { id: true, role: true, employeeId: true },
      });
      return {
        role: user?.role || '',
        employeeId: user?.employeeId ?? null,
      };
    } catch {
      return { role: '', employeeId: null };
    }
  }

  async list(options: ListOrdersOptions): Promise<any[]> {
    const qb = this.orderRepository.createQueryBuilder('o').orderBy('o.created_at', 'DESC');
    this.applyOrderFilters(qb, options);

    this.applyOrdersScope(qb, options);
    if ((qb as any)._earlyReturnEmpty) return [];

    const rows = await qb.getMany();
    const [namesById, leadSnapshots] = await Promise.all([
      this.lookupDisplayNamesForIds(rows.flatMap((r) => [r.salesUserId, r.academicUserId])),
      this.lookupLeadSnapshotsForIds(rows.map((r) => r.leadId)),
    ]);
    return rows.map((r) => {
      const mapped = this.mapOrder(r, {
        salesUserName: r.salesUserId ? namesById.get(r.salesUserId) || null : null,
        academicUserName: r.academicUserId ? namesById.get(r.academicUserId) || null : null,
      });
      // A-6：教务角色隐藏订单金额（教务主管 `academic_supervisor` 可见）
      if (options.sessionRole === 'academic') {
        mapped.amount = null;
      }
      return {
        ...mapped,
        ...(leadSnapshots.get(r.leadId) || {}),
      };
    });
  }

  /**
   * 1.2 订单搜索/筛选：模糊搜索（订单号/客资联系方式）+ 条件搜索（付款/销售/教务/服务类型/时间）。
   * 注意：实体列名是 snake_case（o.sales_user_id / o.academic_user_id / o.paid_status 等），
   * 与 camelCase 属性不同；QueryBuilder 引用必须用数据库列名。
   *
   * BF-09b 修复 (2026-06-04) — 避免 TypeORM 1.0 `this.subQuery is not a function`：
   *   旧实现用 `qb.andWhere('... EXISTS (SELECT 1 FROM leads l ...)', { kw: like })`，
   *   TypeORM 1.0 在解析 `andWhere` 第二个参数时会把内部的 `SELECT 1` 识别为子查询并
   *   调用 `this.subQuery(...)`，新版本下该方法签名变更而抛错。改用 QueryBuilder 的
   *   `leftJoin + andWhere` 写法走主查询别名（参数对象用 QueryExpressionMap 内支持的
   *   形式），避开字符串里嵌子查询的解析路径。
   */
  private applyOrderFilters(qb: any, options: ListOrdersOptions): void {
    if (options.status) {
      qb.andWhere('o.order_status = :status', { status: options.status });
    }

    if (
      options.handoverStatus &&
      ALLOWED_HANDOVER_STATUS.includes(options.handoverStatus as HandoverStatusCode)
    ) {
      qb.andWhere('o.handover_status = :handoverStatus', {
        handoverStatus: options.handoverStatus,
      });
    }

    if (options.paidStatus && ALLOWED_PAID.includes(options.paidStatus as PaidStatus)) {
      qb.andWhere('o.paid_status = :paidStatus', { paidStatus: options.paidStatus });
    }

    if (options.salesId) {
      qb.andWhere('o.sales_user_id = :salesId', { salesId: options.salesId });
    }

    if (options.academicAdminId) {
      qb.andWhere('o.academic_user_id = :academicAdminId', {
        academicAdminId: options.academicAdminId,
      });
    }

    if (options.serviceType) {
      qb.andWhere('o.service_type = :serviceType', { serviceType: options.serviceType });
    }

    if (options.startDate) {
      qb.andWhere('o.created_at >= :startDate', { startDate: options.startDate });
    }

    if (options.endDate) {
      qb.andWhere('o.created_at <= :endDate', { endDate: options.endDate });
    }

    // 模糊搜索：订单号（o.id）+ 关联客资的联系方式/昵称。
    // BF-09b 修复 (2026-06-04)：TypeORM 1.0 在 `andWhere(sql, params)` 第二参数是对象时
    //   会把 sql 字符串里以 `(` 开头 `)` 结尾的 entity target 当作子查询构造器并
    //   调用 `this.subQuery()`，新版本下抛 `this.subQuery is not a function`。
    //   规避方式：只用字符串单参数 + setParameter 显式注入占位符，TypeORM 不会进入
    //   subQuery 解析路径。子查询用 `IN (SELECT ...)` 形式（不走 EXISTS），TypeORM 把
    //   整个 IN 子句作为字面量拼入。
    // collation fix：leads 表 id 与 orders.id 的 collation 不一致（utf8mb4_unicode_ci
    //   vs utf8mb4_0900_ai_ci），IN 子句里用 `CONVERT(l.id USING utf8mb4) COLLATE
    //   utf8mb4_0900_ai_ci` 显式对齐 orders.id 的排序规则，避免 ER_CANT_AGGREGATE_2COLLATIONS。
    const kw = options.keyword && options.keyword.trim();
    if (kw) {
      const like = `%${kw}%`;
      qb.andWhere(
        `(o.id LIKE :kw OR o.lead_id IN (` +
          `SELECT CONVERT(l.id USING utf8mb4) COLLATE utf8mb4_0900_ai_ci ` +
          `FROM leads l WHERE ` +
          `(l.contact_info LIKE :kw OR l.nickname LIKE :kw)` +
        `))`,
      );
      qb.setParameter('kw', like);
    }

    // 异常筛选：关联 order_abnormal_feedbacks 表，过滤存在未关闭异常的订单。
    // 同样只用字符串 + setParameter 形式，避开 subQuery 解析路径。
    // collation fix：order_abnormal_feedbacks.order_id collation 是 utf8mb4_0900_ai_ci，
    //   orders.id 是 utf8mb4_unicode_ci，IN 子句里用 `CONVERT(f.order_id USING utf8mb4)
    //   COLLATE utf8mb4_unicode_ci` 对齐。
    if (options.abnormal) {
      qb.andWhere(
        `o.id IN (` +
          `SELECT CONVERT(f.order_id USING utf8mb4) COLLATE utf8mb4_unicode_ci ` +
          `FROM order_abnormal_feedbacks f WHERE f.status != 'closed'` +
        `)`,
      );
    }
  }

  /**
   * 统一的订单可见性过滤，list/listPaged 共用，避免两处分支漂移：
   * - admin/owner：scope=all 看全量；其他 scope 仍受限于自己的销售/教务身份
   * - role=academic + scope=pool          → 只看池单（academic_user_id IS NULL）
   * - role=academic + scope=academic/mine → 池单 + 已分配给自己的单（默认教务端视角）
   * - role=academic + scope=assigned      → 仅已分配给自己的单
   * - role=sales 等其他角色               → 仅自己经手的销售/教务订单
   */
  private applyOrdersScope(qb: any, options: ListOrdersOptions): void {
    const isAdminLike = options.sessionRole === 'admin' || options.sessionRole === 'owner' || options.sessionRole === 'supervisor' || options.sessionRole === 'academic_supervisor';

    if (isAdminLike && (options.scope === 'all' || !options.scope)) {
      return;
    }

    if (options.role === 'academic' || options.role === 'academic_supervisor' || options.sessionRole === 'academic' || options.sessionRole === 'academic_supervisor') {
      if (options.scope === 'pool') {
        qb.andWhere('o.academic_user_id IS NULL');
        this.applyAcademicClaimableFilter(qb);
        return;
      }
      if (options.scope === 'assigned' || options.scope === 'mine') {
        if (!options.currentUserId) { qb._earlyReturnEmpty = true; return; }
        qb.andWhere('o.academic_user_id = :uid', { uid: options.currentUserId });
        return;
      }
      // 默认教务视角（scope=academic 或未传）：池单 + 自己已认领
      if (!options.currentUserId) {
        qb.andWhere('o.academic_user_id IS NULL');
        this.applyAcademicClaimableFilter(qb);
        return;
      }
      qb.andWhere(
        '(o.academic_user_id IS NULL OR o.academic_user_id = :uid)',
        { uid: options.currentUserId },
      );
      return;
    }

    // 销售或未知角色：只看自己经手的销售/教务订单
    if (!options.currentUserId) { qb._earlyReturnEmpty = true; return; }
    qb.andWhere(
      '(o.sales_user_id = :uid OR o.academic_user_id = :uid)',
      { uid: options.currentUserId },
    );
  }

  // §9 / AC-10.2 订单列表分页
  // 控制器拿到 limit/offset 时改走 *Paged 版本，统一返回 { items, total, limit, offset }；
  // 无分页参数时仍走上面老接口（直接返回数组），保持前端兼容。
  // 业务过滤（role/scope/status）逻辑与 list() 完全一致，只在末尾包了分页 + count。
  async listPaged(
    options: ListOrdersOptions & { limit: number; offset: number },
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);

    const qb = this.orderRepository.createQueryBuilder('o').orderBy('o.created_at', 'DESC');
    this.applyOrderFilters(qb, options);

    this.applyOrdersScope(qb, options);
    if ((qb as any)._earlyReturnEmpty) {
      return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
    }

    qb.skip(safeOffset).take(safeLimit);
    const [rows, total] = await qb.getManyAndCount();
    const [namesById, leadSnapshots] = await Promise.all([
      this.lookupDisplayNamesForIds(rows.flatMap((r) => [r.salesUserId, r.academicUserId])),
      this.lookupLeadSnapshotsForIds(rows.map((r) => r.leadId)),
    ]);
    const mappedItems = rows.map((r) => {
      const mapped = this.mapOrder(r, {
        salesUserName: r.salesUserId ? namesById.get(r.salesUserId) || null : null,
        academicUserName: r.academicUserId ? namesById.get(r.academicUserId) || null : null,
      });
      // A-6：教务角色隐藏金额（教务主管可见完整金额）
      if (options.sessionRole === 'academic') {
        mapped.amount = null;
      }
      return {
        ...mapped,
        ...(leadSnapshots.get(r.leadId) || {}),
      };
    });
    return {
      items: mappedItems,
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

  /**
   * 教务端首页六宫格汇总。
   * 复用 applyOrdersScope 自身的可见性过滤（academic 池单 + 自己已认领），
   * 再叠加按 order_status 分桶的统计；nearDue 用「订单状态在履约中类目 + updated_at 早于 5 天前」近似 7 天内无进展。
   *
   * 返回 6 个数字：待接收 / 进行中 / 待客户资料 / 待老师安排 / 即将到期 / 异常。
   */
  async getAcademicHomeSummary(
    currentUserId: string,
    sessionRole?: string,
  ): Promise<{
    pendingReceive: number;
    inProgress: number;
    waitingMaterial: number;
    waitingTeacher: number;
    nearDue: number;
    abnormal: number;
    targets: Record<string, { orderId: string; todoType: string; targetModule: string } | null>;
  }> {
    // academic_supervisor 与 admin/owner 走全量统计，否则仅池单+自己已认领
    const effectiveRole = (sessionRole === 'academic_supervisor' || sessionRole === 'admin' || sessionRole === 'owner' || sessionRole === 'supervisor')
      ? sessionRole
      : 'academic';
    const scope: ListOrdersOptions = {
      role: effectiveRole,
      sessionRole: effectiveRole,
      currentUserId: effectiveRole === 'academic' ? (currentUserId || undefined) : undefined,
    };

    async function count(qb: any): Promise<number> {
      if ((qb as any)._earlyReturnEmpty) return 0;
      const row = await qb.select('COUNT(o.id)', 'cnt').getRawOne();
      const cnt = (row as { cnt?: string | number } | undefined)?.cnt;
      const n = Number(cnt ?? 0);
      return Number.isFinite(n) ? n : 0;
    }

    async function firstOrderId(qb: any): Promise<string | null> {
      if ((qb as any)._earlyReturnEmpty) return null;
      const row = await qb
        .select('o.id', 'orderId')
        .orderBy('o.updated_at', 'ASC')
        .getRawOne();
      return (row as { orderId?: string } | undefined)?.orderId ?? null;
    }

    const buildBase = () => {
      const qb = this.orderRepository.createQueryBuilder('o');
      this.applyOrdersScope(qb, scope);
      return qb;
    };
    const buildClaimableReceive = () => {
      const qb = this.orderRepository
        .createQueryBuilder('o')
        .andWhere('o.academic_user_id IS NULL')
        .andWhere('o.order_status = :s', { s: 'to_receive' });
      this.applyAcademicClaimableFilter(qb);
      return qb;
    };

    // 待接收：首页数量与领取池口径一致，只展示已付定金且有客户付款金额的池单。
    const pendingReceive = await count(buildClaimableReceive());

    const inProgress = await count(
      buildBase().andWhere('o.order_status = :s', { s: 'in_progress' }),
    );

    const waitingMaterial = await count(
      buildBase().andWhere('o.order_status = :s', { s: 'awaiting_client_info' }),
    );

    const waitingTeacher = await count(
      buildBase().andWhere('o.order_status = :s', { s: 'awaiting_teacher' }),
    );

    // 即将到期：履约中类目 + updated_at 早于 5 天前（≈「7 天内无进展」粗略估算）。
    // 用 updated_at 兜底，不依赖 order_follow_records.next_remind_at 字段是否填齐。
    const nearDue = await count(
      buildBase()
        .andWhere(
          "o.order_status IN (:...nearStatuses)",
          { nearStatuses: ['in_progress', 'awaiting_client_info', 'awaiting_teacher', 'to_deliver'] },
        )
        .andWhere('o.updated_at < (NOW() - INTERVAL 5 DAY)'),
    );

    const abnormal = await count(
      buildBase().andWhere('o.order_status = :s', { s: 'abnormal' }),
    );

    const [pendingReceiveTarget, waitingMaterialTarget, waitingTeacherTarget, nearDueTarget] =
      await Promise.all([
        firstOrderId(buildClaimableReceive()),
        firstOrderId(buildBase().andWhere('o.order_status = :s', { s: 'awaiting_client_info' })),
        firstOrderId(buildBase().andWhere('o.order_status = :s', { s: 'awaiting_teacher' })),
        firstOrderId(
          buildBase()
            .andWhere(
              "o.order_status IN (:...nearStatuses)",
              { nearStatuses: ['in_progress', 'awaiting_client_info', 'awaiting_teacher', 'to_deliver'] },
            )
            .andWhere('o.updated_at < (NOW() - INTERVAL 5 DAY)'),
        ),
      ]);

    const makeTarget = (
      orderId: string | null,
      todoType: string,
      targetModule: string,
    ) => (orderId ? { orderId, todoType, targetModule } : null);

    return {
      pendingReceive,
      inProgress,
      waitingMaterial,
      waitingTeacher,
      nearDue,
      abnormal,
      targets: {
        pendingReceive: makeTarget(pendingReceiveTarget, 'pendingReceive', 'overview'),
        inProgress: null,
        waitingMaterial: makeTarget(waitingMaterialTarget, 'waitingMaterial', 'client-info'),
        waitingTeacher: makeTarget(waitingTeacherTarget, 'waitingTeacher', 'teacher'),
        nearDue: makeTarget(nearDueTarget, 'nearDue', 'progress'),
        abnormal: null,
      },
    };
  }

  /**
   * 教务领取池只展示已付定金且有付款金额的订单。
   */
  private applyAcademicClaimableFilter(qb: any): void {
    qb.andWhere(`(
      o.payment_stage IS NOT NULL
      AND o.payment_stage NOT LIKE :unpaidStage
      AND o.payment_stage NOT LIKE :unpaidPaymentStage
    )`, {
      unpaidStage: '%未付%',
      unpaidPaymentStage: '%未付款%',
    });
    qb.andWhere(`(
      o.payment_stage LIKE :paidDepositStage
      OR o.payment_stage LIKE :paidMiddleStage
      OR o.payment_stage LIKE :paidFinalStage
      OR o.payment_stage LIKE :depositStage
      OR o.payment_stage LIKE :middleStage
      OR o.payment_stage LIKE :finalStage
      OR o.payment_stage LIKE :fullPaidStage
      OR o.payment_stage LIKE :singleStage
    )`, {
      paidDepositStage: '%已付定金%',
      paidMiddleStage: '%已付中期%',
      paidFinalStage: '%已付尾款%',
      depositStage: '%定金%',
      middleStage: '%中期%',
      finalStage: '%尾款%',
      fullPaidStage: '%全款%',
      singleStage: '%单期%',
    });
    qb.andWhere(`o.id IN (
      SELECT CONVERT(f.order_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      FROM order_finance f
      WHERE f.client_paid IS NOT NULL AND f.client_paid > 0
    )`);
  }

  async findOne(
    id: string,
    actor?: OrderActor,
  ): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (actor) {
      const role = actor.role || '';
      const uid = actor.userId || '';
      const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor' || role === 'academic_supervisor';
      if (!isAdminLike) {
        const canSee =
          (role === 'sales' && order.salesUserId === uid) ||
          (role === 'academic' && (order.academicUserId === uid || order.academicUserId == null)) ||
          (order.salesUserId === uid || order.academicUserId === uid);
        if (!canSee) {
          // 不暴露 "存在但无权限"；与不存在一致返回 404
          throw new NotFoundException('order not found');
        }
      }
    }
    const [followRecords, lead] = await Promise.all([
      this.orderFollowRepository.find({
        where: { orderId: id },
        order: { createdAt: 'DESC' },
      }),
      this.leadRepository.findOne({ where: { id: order.leadId } }),
    ]);
    const names = await this.lookupUserNames([order.salesUserId, order.academicUserId]);
    const mappedOrder = this.mapOrder(order, names);
    // A-6：教务角色隐藏金额（教务主管可见完整金额）
    const role = actor?.role || '';
    if (role === 'academic') {
      mappedOrder.amount = null;
    }
    return {
      ...mappedOrder,
      ...(lead ? this.mapLeadFollowSnapshot(lead) : {}),
      followRecords: followRecords.map((r) => this.mapFollowRecord(r)),
    };
  }

  /**
   * 查询教务端交付详情。
   * 聚合 orders 主表、order_authors、order_submissions、order_finance，供订单跟进页编辑。
   */
  async getOrderDelivery(orderId: string, actor?: OrderActor): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const [authors, submissions, backupSubmissions, finance] = await Promise.all([
      this.orderAuthorRepository.find({
        where: { orderId },
        order: { authorOrder: 'ASC' },
      }),
      this.orderSubmissionRepository.find({
        where: { orderId, type: 'regular' },
        order: { submissionNo: 'ASC' },
      }),
      this.orderSubmissionRepository.find({
        where: { orderId, type: 'backup' },
        order: { submissionNo: 'ASC' },
      }),
      this.orderFinanceRepository.findOne({ where: { orderId } }),
    ]);
    const mappedOrder = this.mapOrderDeliveryFields(order);
    const role = actor?.role || '';
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';
    const isAcademicSupervisor = role === 'academic_supervisor';
    const isAcademic = role === 'academic';
    const isSales = role === 'sales';
    // A-6：教务角色隐藏订单金额信息（教务主管可见完整金额）
    if (isAcademic) {
      mappedOrder.amount = null;
    }
    const mappedFinance = this.mapOrderFinance(finance);
    if (!isAdminLike && !isAcademicSupervisor) {
      if (isAcademic) {
        // 普通教务：隐藏客户付款金额，保留老师付款信息
        mappedFinance.orderAmount = null;
        mappedFinance.customerPaid = null;
        mappedFinance.customerPending = null;
      } else if (isSales) {
        // 销售：隐藏老师付款金额，保留客户付款信息
        mappedFinance.teacherPrice = null;
        mappedFinance.teacherPaid = null;
        mappedFinance.teacherPending = null;
      } else {
        // 其他角色：隐藏全部财务信息
        mappedFinance.orderAmount = null;
        mappedFinance.customerPaid = null;
        mappedFinance.customerPending = null;
        mappedFinance.teacherPrice = null;
        mappedFinance.teacherPaid = null;
        mappedFinance.teacherPending = null;
      }
    }
    return {
      order: mappedOrder,
      authors: authors.map((row) => this.mapOrderAuthor(row)),
      submissions: submissions.map((row) => this.mapOrderSubmission(row)),
      backupSubmissions: backupSubmissions.map((row) => this.mapOrderSubmission(row)),
      finance: mappedFinance,
    };
  }

  /**
   * 保存教务端交付详情。
   * 主表字段更新 orders；作者与投稿信息采用按订单整体替换，避免旧位次残留；
   * 财务表为 1:1 upsert，并自动计算客户/老师待付金额。
   *
   * 角色校验：交付详情只允许教务/admin/owner 修改，销售付款走订单付款更新接口。
   */
  async saveOrderDelivery(orderId: string, dto: OrderDeliveryDto, actor: OrderActor): Promise<void> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }

    const role = actor.role || '';
    const userId = actor.userId || '';
    const hasFinancePayload = this.hasNonEmptyObjectFields(dto.finance);
    const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor';
    const isSales = role === 'sales';
    const isAcademic = role === 'academic' || role === 'academic_supervisor';

    if (hasFinancePayload) {
      // 按角色分字段校验：教务可编辑老师侧，销售可编辑客户侧
      const financeKeys = Object.keys(dto.finance || {}).filter((k) => dto.finance?.[k] !== undefined && dto.finance?.[k] !== null && dto.finance?.[k] !== '');
      const CUSTOMER_FIELDS = ['orderAmount', 'customerPaid', 'customerPending'];
      const TEACHER_FIELDS = ['teacherPrice', 'teacherPaid', 'teacherPending'];
      const hasCustomerFields = financeKeys.some((k) => CUSTOMER_FIELDS.includes(k));
      const hasTeacherFields = financeKeys.some((k) => TEACHER_FIELDS.includes(k));

      if (isAcademic && hasCustomerFields) {
        throw new ForbiddenException('教务角色不允许修改客户侧财务信息');
      }
      if (isSales && hasTeacherFields) {
        throw new ForbiddenException('销售角色不允许修改老师侧财务信息');
      }
      if (isSales && order.salesUserId !== userId) {
        throw new ForbiddenException('仅订单销售本人可以修改财务信息');
      }
    }

    const orderPatch = this.buildOrderDeliveryPatch(dto.order || {});

    // 作者/投稿/财务 delete+reinsert 放在事务中，避免中途失败导致数据丢失
    // orderPatch 也放入同一事务：否则事务回滚后 order 元数据与子表不一致
    await this.dataSource.transaction(async (manager) => {
      if (Object.keys(orderPatch).length > 0) {
        await manager.getRepository(Order).update(orderId, orderPatch);
      }

      const authorRepo = manager.getRepository(OrderAuthor);
      const submissionRepo = manager.getRepository(OrderSubmission);
      const financeRepo = manager.getRepository(OrderFinance);

      if (Array.isArray(dto.authors)) {
        await authorRepo.delete({ orderId });
        const authors = dto.authors
          .map((item, index) => this.buildOrderAuthor(orderId, item, index))
          .filter((item): item is OrderAuthor => item !== null);
        if (authors.length > 0) {
          await authorRepo.save(authors);
        }
      }

      if (Array.isArray(dto.submissions)) {
        await submissionRepo.delete({ orderId, type: 'regular' });
        const submissions = dto.submissions
          .map((item, index) => this.buildOrderSubmission(orderId, item, index, 'regular'))
          .filter((item): item is OrderSubmission => item !== null);
        if (submissions.length > 0) {
          await submissionRepo.save(submissions);
        }
      }

      if (Array.isArray(dto.backupSubmissions)) {
        await submissionRepo.delete({ orderId, type: 'backup' });
        const backupItems = dto.backupSubmissions
          .map((item: any, index: number) => this.buildOrderSubmission(orderId, item, index, 'backup'))
          .filter((item: OrderSubmission | null): item is OrderSubmission => item !== null);
        if (backupItems.length > 0) {
          await submissionRepo.save(backupItems);
        }
      }

      if (dto.finance) {
        const currentFinance = await financeRepo.findOne({ where: { orderId } });
        await financeRepo.save(
          this.buildOrderFinance(orderId, dto.finance, currentFinance),
        );
      }
    });
  }

  /**
   * P0 越权修复 (TC-PERM-023 等)：控制器层在写操作前调用本方法做归属校验。
   * 规则与 findOne / applyOrdersScope 中的可见性策略保持一致：
   * - admin / owner：可访问全部订单
   * - sales：仅本人经手（sales_user_id = 当前用户）
   * - academic：仅自己已认领（academic_user_id = 当前用户）或池单（academic_user_id IS NULL）
   * - 其它 / 未传角色：兜底要求 sales_user_id 或 academic_user_id 与当前用户匹配
   *
   * 返回 boolean 而非抛 404，由 controller 统一把 false 翻译为 404 响应，
   * 避免与"订单不存在"在日志中产生歧义，也与 leads 模块的 canAccessLead 对齐。
   */
  async canAccessOrder(
    orderId: string,
    actor?: { userId?: string; role?: string },
  ): Promise<boolean> {
    if (!orderId) return false;
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) return false;
    const role = actor?.role || '';
    const uid = actor?.userId || '';
    if (role === 'admin' || role === 'owner' || role === 'supervisor' || role === 'academic_supervisor') return true;
    if (role === 'sales') {
      return Boolean(uid && order.salesUserId === uid);
    }
    if (role === 'academic') {
      return order.academicUserId === uid || order.academicUserId == null;
    }
    return Boolean(uid && (order.salesUserId === uid || order.academicUserId === uid));
  }

  /**
   * 教务提醒订单对应销售催收客户付款。
   */
  async remindSalesPayment(
    orderId: string,
    actor: { userId?: string; role?: string },
  ): Promise<{ ok: true; receiverId: string }> {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const role = actor?.role || '';
    if (role !== 'academic' && role !== 'admin' && role !== 'owner') {
      throw new ForbiddenException('当前角色不允许提醒销售催款');
    }
    const canAccess = await this.canAccessOrder(orderId, actor);
    if (!canAccess) {
      throw new NotFoundException('order not found');
    }
    if (!order.salesUserId) {
      throw new BadRequestException('订单未关联销售，无法发送催款提醒');
    }

    const contentParts = [
      `订单 ${order.id}`,
      order.customerName ? `客户 ${order.customerName}` : '客户未填写',
      order.paymentStage ? `付款阶段 ${order.paymentStage}` : '付款阶段未填写',
    ];
    await this.notificationsService.create({
      receiverIds: [order.salesUserId],
      senderId: actor.userId || null,
      portType: 'sales',
      typeCode: NOTIFICATION_TYPES.REMINDER,
      title: '催款提醒',
      content: `${contentParts.join('，')}，请尽快跟进客户付款。`,
      relatedId: order.id,
      relatedType: 'order',
    });
    return { ok: true, receiverId: order.salesUserId };
  }

  async update(id: string, actorUserId: string, dto: OrderPatchDto): Promise<void> {
    const current = await this.orderRepository.findOne({ where: { id } });
    if (!current) {
      throw new NotFoundException('order not found');
    }
    const next: Partial<Order> = {};
    const changedFields: string[] = [];
    if (dto.order_status !== undefined) {
      if (!ALLOWED_ORDER_STATUS.includes(dto.order_status)) {
        throw new BadRequestException('invalid order_status');
      }
      if (dto.order_status !== current.orderStatus) {
        changedFields.push('orderStatus');
        next.orderStatus = dto.order_status;
      }
    }
    if (dto.paid_status !== undefined) {
      if (!ALLOWED_PAID.includes(dto.paid_status)) {
        throw new BadRequestException('invalid paid_status');
      }
      if (dto.paid_status !== current.paidStatus) {
        changedFields.push('paidStatus');
        next.paidStatus = dto.paid_status;
      }
    }
    if (dto.payment_stage !== undefined) {
      const nextPaymentStage = dto.payment_stage ? String(dto.payment_stage).trim() : null;
      if (nextPaymentStage !== current.paymentStage) {
        changedFields.push('paymentStage');
        next.paymentStage = nextPaymentStage;
      }
    }
    if (dto.academic_user_id !== undefined) {
      const nextAcademic = dto.academic_user_id || null;
      if (nextAcademic !== current.academicUserId) {
        changedFields.push('academicUserId');
        next.academicUserId = nextAcademic;
      }
    }
    if (dto.service_type !== undefined) {
      const nextService = dto.service_type || null;
      if (nextService !== current.serviceType) {
        changedFields.push('serviceType');
        next.serviceType = nextService;
      }
    }
    if (dto.amount !== undefined) {
      const nextAmount = dto.amount != null && dto.amount !== '' ? String(dto.amount) : null;
      if (nextAmount !== current.amount) {
        changedFields.push('amount');
        next.amount = nextAmount;
      }
    }
    if (dto.client_paid !== undefined) {
      await this.updateClientPaidFinance(id, current.amount, dto.client_paid);
      changedFields.push('clientPaid');
    }
    if (dto.remark !== undefined) {
      const nextRemark = dto.remark || null;
      if (nextRemark !== current.remark) {
        changedFields.push('remark');
        next.remark = nextRemark;
      }
    }
    if (changedFields.length === 0) return;
    if (Object.keys(next).length > 0) {
      await this.orderRepository.update(id, next);
    }
    const updatedForClaim = { ...current, ...next } as Order;
    if (changedFields.includes('clientPaid') || changedFields.includes('paymentStage') || changedFields.includes('paidStatus')) {
      await this.notifyAcademicIfClaimable(updatedForClaim, actorUserId);
    }

    // N-P1-02: 订单状态/进度更新通知。
    // 接收方：订单的销售（始终）+ 主管/admin 兜底；portType='sales'。
    // 静默路径：通过 addFollowRecord 触发的更新可能很频繁——这里只覆盖显式
    // PATCH 路由；addFollowRecord 自身已有 ORDER_ABNORMAL 通知，非异常节点
    // 不重复发 ORDER_UPDATED 避免刷屏。
    try {
      await this.emitOrderUpdated(current, changedFields, actorUserId);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[orders] notify order_updated failed', err?.message || err);
    }
  }

  /**
   * N-P1-02: 发送 ORDER_UPDATED 通知。包含：
   * - 销售（order.salesUserId）—— 始终接收
   * - admin/owner 兜底（避免销售离职/无销售时通知丢失）
   * - 去重：同一 (orderId, changedFields 组合) 在 30s 内只发一次
   */
  private async emitOrderUpdated(
    current: Order,
    changedFields: string[],
    actorUserId: string,
  ): Promise<void> {
    if (changedFields.length === 0) return;
    const dedupKey = `${current.id}:${changedFields.slice().sort().join(',')}`;
    const last = this.orderUpdatedDedup.get(dedupKey);
    const now = Date.now();
    if (last && now - last < ORDER_UPDATED_DEDUP_MS) {
      return;
    }
    this.orderUpdatedDedup.set(dedupKey, now);
    // 老条目回收，避免 Map 无限增长
    if (this.orderUpdatedDedup.size > 256) {
      const cutoff = now - ORDER_UPDATED_DEDUP_MS * 4;
      for (const [k, ts] of this.orderUpdatedDedup) {
        if (ts < cutoff) this.orderUpdatedDedup.delete(k);
      }
    }

    const receivers = new Set<string>();
    if (current.salesUserId && current.salesUserId !== actorUserId) {
      receivers.add(current.salesUserId);
    }
    // 主管 / 总后台兜底（BF-09b：避开 TypeORM 1.0 `this.subQuery is not a function`，改用 Repository.find）
    try {
      const supervisors = await this.userRepository.find({
        where: { role: In(['admin', 'owner']) },
        select: { id: true },
      });
      for (const u of supervisors) {
        if (u.id && u.id !== actorUserId) receivers.add(u.id);
      }
    } catch {
      // 兜底查询失败不影响主流程
    }
    if (receivers.size === 0) return;

    const fieldLabels = changedFields
      .map((f) => ORDER_UPDATED_FIELD_LABELS[f] || f)
      .join('、');
    await this.notificationsService.create({
      receiverIds: Array.from(receivers),
      senderId: actorUserId || null,
      portType: 'sales',
      typeCode: NOTIFICATION_TYPES.ORDER_UPDATED,
      title: '订单进度更新',
      content: `订单 ${current.id} 更新了：${fieldLabels}`,
      relatedId: current.id,
      relatedType: 'order',
    });
  }

  async addFollowRecord(
    orderId: string,
    actorUserId: string,
    dto: OrderFollowDto,
  ): Promise<void> {
    if (!dto.nodeType || !dto.nodeType.trim()) {
      throw new BadRequestException('nodeType required');
    }
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    const nodeType = dto.nodeType.trim();
    await this.orderFollowRepository.save({
      id: makeId(),
      orderId,
      userId: actorUserId,
      nodeType,
      content: dto.content ? String(dto.content).trim() : null,
      nextRemindAt: OrderRemindersService.normalizeRemindAt(dto.nextRemindAt ?? null),
      remindStage: dto.remindStage ? String(dto.remindStage).trim() : null,
      attachmentUrl: dto.attachmentUrl || null,
      attachmentName: dto.attachmentName || null,
    });

    // §11.1 order_abnormal: 订单跟进出现异常节点，回写给销售。
    if (nodeType.includes('异常') && order.salesUserId && order.salesUserId !== actorUserId) {
      await this.notificationsService.create({
        receiverIds: [order.salesUserId],
        senderId: actorUserId || null,
        portType: 'sales',
        typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
        title: '订单异常',
        content: dto.content
          ? `订单跟进异常: ${String(dto.content).trim()}`
          : `订单跟进异常 (${nodeType})`,
        relatedId: orderId,
        relatedType: 'order',
      });
    }

    // 文档 1.2：教务添加「已接收 / 签收」类节点 → 自动转 accepted。
    // 用稳定的内部关键字判断，避免误触发："received" / "已接收" / "已签收"。
    const isReceivedNode =
      /^received$/i.test(nodeType) ||
      nodeType === '已接收' ||
      nodeType === '已签收';
    if (isReceivedNode && order.handoverStatus !== 'accepted') {
      // 修复「领取后状态依然为待领取」：orders.handover_status 的 schema 默认值为 'pending'，
      // 迁移/老数据/未走 close-deal 的订单可能停留在 pending。acceptHandover 状态机只接受
      // 'handed_over'，被拒后错误会被下方 try/catch 静默吞掉，导致 follow record 写成功但
      // 订单状态不变。这里先把 pending 推进到 handed_over，再走后续 auto-accept。
      if (order.handoverStatus === 'pending') {
        try {
          await this.orderRepository.update(
            { id: orderId },
            { handoverStatus: 'handed_over' },
          );
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error(
            '[orders] auto promote pending->handed_over on received node failed',
            err?.message || err,
          );
        }
      }
      // P0-NEW-03: 池单（academic_user_id IS NULL）在教务添加"已接收"节点时，
      // 先把订单认领到当前教务名下（用其 employeeId），再触发自动 acceptHandover。
      // 这样新加的 ownership 校验（order.academicUserId === actor.employeeId）才能通过。
      // 若失败不影响主流程（仍保存 follow record），仅 auto-accept 不生效。
      if (order.academicUserId == null && actorUserId) {
        try {
          // 统一存 users.id：与 canAccessOrder / acceptHandover / closeDeal 落库保持一致
          // 历史数据兜底：缺 userId 时退到 employeeId（兼容老记录）
          await this.orderRepository.update(
            { id: orderId },
            { academicUserId: actorUserId },
          );
          order.academicUserId = actorUserId;
        } catch (err: any) {
          // eslint-disable-next-line no-console
          console.error(
            '[orders] auto assign academic on received node failed',
            err?.message || err,
          );
        }
      }
      try {
        await this.acceptHandover(orderId, actorUserId, { silent: true });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] auto acceptHandover failed', err?.message || err);
      }
    }
  }

  // =====================================================================
  // §11.1 / 文档 1.2 订单交接状态机 (handover_status)
  // 状态: pending → handed_over → accepted (履约) | rejected
  // 写入 operation_logs + 通知相关方（销售/教务）。
  // 不动现有 orderStatus 字段（保持向后兼容），只在校验为 pending/handed_over
  // 的订单上推进到 accepted 时同步把 orderStatus 从 to_receive 推到 in_progress。
  // =====================================================================

  async getHandoverStatus(
    id: string,
    actor?: { userId?: string; role?: string; employeeId?: string | null },
  ): Promise<{
    orderId: string;
    handoverStatus: HandoverStatusCode;
    orderStatus: OrderStatus;
    academicUserId: string | null;
    salesUserId: string;
  }> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    // P0-NEW-03: 读权限校验（与 findOne 一致），避免泄露订单存在性。
    // 注意：现有 controller 未透传 session，因此 actor 通常为 undefined；
    // 留出 actor 参数便于未来 controller 补传后立即生效。undefined 时按 401 之外的
    // 已有行为处理（仅校验订单存在），与改动前完全一致。
    if (actor && (actor.userId || actor.role || actor.employeeId)) {
      let role = actor.role || '';
      let employeeId: string | null = actor.employeeId ?? null;
      if (!role && actor.userId) {
        const ctx = await this.getActorContext(actor.userId);
        role = ctx.role;
        employeeId = ctx.employeeId;
      }
      const uid = actor.userId || '';
      const isAdminLike = role === 'admin' || role === 'owner' || role === 'supervisor' || role === 'academic_supervisor';
      if (!isAdminLike) {
        const canSee =
          (role === 'sales' && order.salesUserId === uid) ||
          (role === 'academic' && (order.academicUserId === employeeId || order.academicUserId == null)) ||
          order.salesUserId === uid ||
          order.academicUserId === employeeId;
        if (!canSee) {
          // 不暴露"存在但无权限"，与不存在一致返回 404。
          throw new NotFoundException('order not found');
        }
      }
    }
    return {
      orderId: order.id,
      handoverStatus: order.handoverStatus,
      orderStatus: order.orderStatus as OrderStatus,
      academicUserId: order.academicUserId,
      salesUserId: order.salesUserId,
    };
  }

  /**
   * 销售成交 / 主动发起交接：pending → handed_over。
   * closeDeal 内部已自动设 'handed_over'，本方法主要是暴露给前端按钮调用。
   *
   * P0-NEW-03 修复：原代码无 owner 校验，任意登录用户都能把任意订单 handover。
   * 修复后：
   *   - admin/owner：旁路 ownership，可对任意订单调用
   *   - sales：仅当 order.salesUserId === actorUserId
   *   - 其他角色：403
   */
  async handOver(orderId: string, actorUserId: string): Promise<void> {
    const [order, ctx] = await Promise.all([
      this.orderRepository.findOne({ where: { id: orderId } }),
      this.getActorContext(actorUserId),
    ]);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    // P0-NEW-03: owner 校验（admin/owner 旁路；sales 必须是该订单的成交销售）
    const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
    if (!isAdmin) {
      // role 已知且不是 sales → 角色不符
      if (ctx.role && ctx.role !== 'sales') {
        throw new ForbiddenException('only sales or supervisor can hand over an order');
      }
      // role 是 sales 但订单归属不匹配 → ownership 不符
      if (order.salesUserId !== actorUserId) {
        throw new ForbiddenException('only the sales of the order can hand over');
      }
    }
    if (order.handoverStatus === 'handed_over') {
      // 幂等：已经交接过的订单直接返回，避免重复通知。
      return;
    }
    if (order.handoverStatus !== 'pending') {
      throw new BadRequestException(
        `cannot hand over from current status: ${order.handoverStatus}`,
      );
    }

    await this.orderRepository.update(orderId, { handoverStatus: 'handed_over' });
    // 操作日志由 controller 层 OperationLogsService 写入（action=HANDOVER, step=hand-over），
    // service 层只负责业务状态翻转，避免双写。

    // 通知所有教务/主管：有新订单待接收。
    // BF-09b：避开 TypeORM 1.0 `this.subQuery is not a function`，改用 Repository.find。
    try {
      const receivers = await this.userRepository.find({
        where: { role: In(['academic', 'academic_supervisor', 'admin', 'owner', 'supervisor']) },
        select: { id: true },
      });
      const ids = receivers.map((u) => u.id).filter((id) => id && id !== actorUserId);
      if (ids.length > 0) {
        await this.notificationsService.create({
          receiverIds: ids,
          senderId: actorUserId,
          portType: 'academic',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '订单待接收',
      content: `订单 ${orderId} 已交接，请尽快接单`,
          relatedId: orderId,
          relatedType: 'order',
        });
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[orders] notify hand_over failed', err?.message || err);
    }
  }

  /**
   * 付款信息补齐到可领取条件时，提醒教务领取订单。
   */
  private async notifyAcademicIfClaimable(order: Order, actorUserId: string): Promise<void> {
    try {
      await this.assertAcademicClaimable(order);
      if (order.handoverStatus !== 'handed_over' || order.academicUserId) {
        return;
      }
      const receivers = await this.userRepository.find({
        where: { role: In(['academic', 'admin', 'owner']) },
        select: { id: true },
      });
      const ids = receivers.map((u) => u.id).filter((id) => id && id !== actorUserId);
      if (ids.length === 0) return;
      await this.notificationsService.create({
        receiverIds: ids,
        senderId: actorUserId || null,
        portType: 'academic',
        typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
        title: '订单可领取',
        content: `订单 ${order.orderCode || order.id} 已确认定金与付款金额，请尽快领取`,
        relatedId: order.id,
        relatedType: 'order',
      });
    } catch (err: any) {
      if (err instanceof BadRequestException) return;
      // eslint-disable-next-line no-console
      console.error('[orders] notify academic claimable failed', err?.message || err);
    }
  }

  /**
   * 教务接单：handed_over → accepted，同时 orderStatus: to_receive → in_progress。
   * silent=true 用于内部自动触发（addFollowRecord 'received' 节点），不重复写日志。
   *
   * P0-NEW-03 修复：原代码无 owner 校验，任意登录用户都能把任意订单置为 accepted。
   * 修复后：
   *   - admin/owner：旁路 ownership
   *   - academic：仅当 order.academicUserId === actor.userId（统一存 users.id，
   *     与 canAccessOrder / 池单自动认领 / closeDeal 落库保持一致）
   *   - 其他角色：403
   * 状态机收紧：仅 'handed_over' 可 accept，'pending'（未先 hand-over）也拒绝；
   * 'accepted' 幂等；'rejected' 必须先重新发起 hand-over。
   */
  async acceptHandover(
    orderId: string,
    actorUserId: string,
    opts: { silent?: boolean } = {},
  ): Promise<void> {
    const [order, ctx] = await Promise.all([
      this.orderRepository.findOne({ where: { id: orderId } }),
      this.getActorContext(actorUserId),
    ]);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    // P0-NEW-03: owner 校验
    const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
    if (!isAdmin) {
      if (ctx.role && ctx.role !== 'academic') {
        throw new ForbiddenException('only academic or supervisor can accept handover');
      }
      // 统一用 actorUserId（与 orders.academic_user_id 落库值一致）；
      // 历史数据若仍存 employeeId，用 ctx.employeeId 兜底兼容（迁移窗口期）
      const actorKey = actorUserId || ctx.employeeId;
      if (order.academicUserId !== actorKey) {
        throw new ForbiddenException('only the assigned academic can accept handover');
      }
    }
    // P0-NEW-03: 状态机收紧 — 仅 'handed_over' 状态可被 accept
    if (order.handoverStatus === 'accepted') {
      return; // 幂等
    }
    if (order.handoverStatus === 'rejected') {
      throw new BadRequestException('order has been rejected, cannot accept');
    }
    if (order.handoverStatus !== 'handed_over') {
      throw new BadRequestException(
        `cannot accept from current status: ${order.handoverStatus}, must be handed_over`,
      );
    }
    await this.assertAcademicClaimable(order);

    const nextOrderStatus: OrderStatus =
      order.orderStatus === 'to_receive' || order.orderStatus === 'pending_accept'
        ? 'in_progress'
        : (order.orderStatus as OrderStatus);
    await this.orderRepository.update(orderId, {
      handoverStatus: 'accepted',
      orderStatus: nextOrderStatus,
    });

    if (!opts.silent) {
      // 操作日志由 controller 层 OperationLogsService 写入。
    } else {
      // 内部自动触发：日志由 controller 层 addFollowRecord 路径覆盖（STATUS_CHANGE）。
    }

    // 通知销售：教务已接单。
    if (order.salesUserId && order.salesUserId !== actorUserId) {
      try {
        await this.notificationsService.create({
          receiverIds: [order.salesUserId],
          senderId: actorUserId,
          portType: 'sales',
          typeCode: NOTIFICATION_TYPES.DEAL_CLOSED,
          title: '订单已被接收',
          content: `订单 ${orderId} 已被教务接单，进入履约阶段`,
          relatedId: orderId,
          relatedType: 'order',
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] notify accept failed', err?.message || err);
      }
    }
  }

  /**
   * 教务拒收：pending/handed_over → rejected。必须传 reason，写 operation_logs。
   * 拒收后通知销售。
   *
   * P0-NEW-03 修复：原代码无 owner 校验，任意登录用户都能把任意订单置为 rejected。
   * 修复后：仅 academic（且必须 order.academicUserId === actor.employeeId）或 admin/owner 可调用。
   */
  async rejectHandover(orderId: string, actorUserId: string, reason: string): Promise<void> {
    const [order, ctx] = await Promise.all([
      this.orderRepository.findOne({ where: { id: orderId } }),
      this.getActorContext(actorUserId),
    ]);
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (!actorUserId) {
      throw new BadRequestException('actor user required');
    }
    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) {
      throw new BadRequestException('reason required for rejecting handover');
    }
    // P0-NEW-03: owner 校验
    const isAdmin = ctx.role === 'admin' || ctx.role === 'owner';
    if (!isAdmin) {
      if (ctx.role && ctx.role !== 'academic') {
        throw new ForbiddenException('only academic or supervisor can reject handover');
      }
      if (order.academicUserId !== ctx.employeeId) {
        throw new ForbiddenException('only the assigned academic can reject handover');
      }
    }
    if (order.handoverStatus === 'rejected') {
      return; // 幂等
    }
    if (order.handoverStatus === 'accepted') {
      throw new BadRequestException('order already accepted, cannot reject');
    }

    await this.orderRepository.update(orderId, { handoverStatus: 'rejected' });
    // 操作日志由 controller 层 OperationLogsService 写入（action=HANDOVER, step=reject, reason=...）。

    if (order.salesUserId && order.salesUserId !== actorUserId) {
      try {
        await this.notificationsService.create({
          receiverIds: [order.salesUserId],
          senderId: actorUserId,
          portType: 'sales',
          typeCode: NOTIFICATION_TYPES.ORDER_ABNORMAL,
          title: '订单被拒收',
          content: `订单 ${orderId} 被拒收：${trimmedReason}`,
          relatedId: orderId,
          relatedType: 'order',
        });
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[orders] notify reject failed', err?.message || err);
      }
    }
  }

  // 注：交接状态变更日志统一由 controller 层 OperationLogsService 写入，
  //   不再在 service 层直接落库，避免依赖 OperationLogRepository。

  async listFollowRecords(
    orderId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(limit as number);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [rows, total] = await this.orderFollowRepository.findAndCount({
      where: { orderId },
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

  // ============================================================
  // v1.3 / SA-7: 销售"我的成交"列表
  // 只查 orders.sales_user_id = currentUser 的订单（与 closeDeal 落库保持一致）。
  // 支持时间/产品类型/订单状态筛选，导出 Excel 走 sales.controller 的 createExport。
  // ============================================================

  async listMyDeals(salesUserId: string, options: {
    status?: string | string[];
    productType?: string;
    startDate?: string;
    endDate?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: any[]; total: number; limit: number; offset: number }> {
    const safeLimit = this.clampLimit(options.limit);
    const safeOffset = Math.max(Number(options.offset) || 0, 0);
    if (!salesUserId) return { items: [], total: 0, limit: safeLimit, offset: safeOffset };
    const qb = this.orderRepository.createQueryBuilder('o')
      .where('o.sales_user_id = :uid', { uid: salesUserId });
    // 兼容 ?status=completed&status=closed 多次传参或单值：过滤到白名单后用 IN。
    if (options.status !== undefined && options.status !== null && options.status !== '') {
      const statusArr = (Array.isArray(options.status) ? options.status : [options.status])
        .filter((s) => ALLOWED_ORDER_STATUS.includes(s as OrderStatus));
      if (statusArr.length === 1) {
        qb.andWhere('o.order_status = :status', { status: statusArr[0] });
      } else if (statusArr.length > 1) {
        qb.andWhere('o.order_status IN (:...statuses)', { statuses: statusArr });
      }
    }
    if (options.productType) {
      // 产品类型藏在 service_type 或 remark 里（详见 closeDeal.composeRemark）
      qb.andWhere(
        '(o.service_type = :productType OR o.remark LIKE :productTypeLike)',
        { productType: options.productType, productTypeLike: `%产品: ${options.productType}%` },
      );
    }
    if (options.startDate) qb.andWhere('o.created_at >= :startDate', { startDate: options.startDate });
    if (options.endDate) qb.andWhere('o.created_at <= :endDate', { endDate: options.endDate });
    // 销售/教务展示姓名：LEFT JOIN users 取 username。
    // 注意：orders / users 两表 collation 不同（utf8mb4_unicode_ci vs utf8mb4_0900_ai_ci），
    // ON 条件必须显式 COLLATE，否则 MySQL 抛 ER_CANT_AGGREGATE_2COLLATIONS。
    // 用同一个别名 u 同时 join 两列，省一次 JOIN。
    qb.leftJoin('users', 'u', 'u.id COLLATE utf8mb4_unicode_ci = o.academic_user_id COLLATE utf8mb4_unicode_ci')
      .addSelect('u.username', 'academic_user_name');
    qb.orderBy('o.created_at', 'DESC')
      .addOrderBy('o.id', 'DESC')
      .take(safeLimit)
      .skip(safeOffset);
    const [rows, total] = await qb.getManyAndCount();
    const namesRaw = await qb.getRawMany();
    const academicNameByOrderId = new Map<string, string | null>();
    for (const raw of namesRaw) {
      const orderId = raw['o_id'] || raw['o_id' as string];
      if (orderId) academicNameByOrderId.set(String(orderId), raw['academic_user_name'] || null);
    }
    // 销售姓名批量查（PK 查不会触发跨表 collation 冲突）
    const salesUserIds = Array.from(new Set(rows.map((r) => r.salesUserId).filter(Boolean) as string[]));
    const salesUserList = salesUserIds.length
      ? await this.userRepository.find({
          where: salesUserIds.map((id) => ({ id })),
          select: { id: true, username: true },
        })
      : [];
    const salesNameById = new Map(salesUserList.map((u) => [u.id, u.username]));
    return {
      items: rows.map((r) =>
        this.mapOrder(r, {
          academicUserName: academicNameByOrderId.get(r.id) || null,
          salesUserName: r.salesUserId ? salesNameById.get(r.salesUserId) || null : null,
        }),
      ),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private async lookupLeadSnapshotsForIds(
    leadIdsInput: Array<string | null | undefined>,
  ): Promise<Map<string, any>> {
    const leadIds = Array.from(new Set(leadIdsInput.filter((v): v is string => !!v)));
    const result = new Map<string, any>();
    if (leadIds.length === 0) return result;

    const rows = await this.leadRepository.find({
      where: leadIds.map((id) => ({ id })),
    });
    for (const lead of rows) {
      result.set(lead.id, this.mapLeadFollowSnapshot(lead));
    }
    return result;
  }

  private mapLeadFollowSnapshot(lead: Lead): any {
    return {
      clientDegree: lead.clientDegree,
      clientMajorResearch: lead.clientMajorResearch,
      clientTimeRequirement: lead.clientTimeRequirement,
      objectionPoint: lead.objectionPoint,
      dealStatus: lead.dealStatus,
      dealAmount: lead.dealAmount,
      followAction: lead.followAction,
      followActionAt: lead.followActionAt,
      requirementNote: lead.requirementNote,
      intentionLevel: lead.intentionLevel,
      nextFollowAt: lead.nextFollowTime,
      contactInfo: lead.contactInfo ?? null,
      nickname: lead.nickname ?? null,
      budget: lead.budget ?? null,
      majorContent: lead.majorContent ?? null,
      salesFeedback: lead.salesFeedback ?? null,
    };
  }

  private mapOrder(row: Order, names: { salesUserName?: string | null; academicUserName?: string | null } = {}): any {
    return {
      id: row.id,
      leadId: row.leadId,
      salesUserId: row.salesUserId,
      salesUserName: names.salesUserName ?? null,
      academicUserId: row.academicUserId,
      academicUserName: names.academicUserName ?? null,
      serviceType: row.serviceType,
      amount: row.amount,
      paidStatus: row.paidStatus,
      orderStatus: row.orderStatus,
      handoverStatus: row.handoverStatus,
      remark: row.remark,
      orderCode: row.orderCode,
      productType: row.productType,
      guaranteeType: row.guaranteeType,
      paymentStage: row.paymentStage,
      customerName: row.customerName,
      articlePurpose: row.articlePurpose,
      salesContact: row.salesContact,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapOrderDeliveryFields(row: Order): any {
    return {
      id: row.id,
      productType: row.productType,
      orderNumber: row.orderCode || row.id,
      orderId: row.id,
      institutionAccepted: Boolean(row.institutionAccepted),
      orderStatus: row.orderStatus,
      customerName: row.customerName,
      degreeLevel: row.educationLevel,
      majorDirection: row.major,
      requiredZone: row.area,
      paperUse: row.articlePurpose,
      registrationFormStatus: row.registrationStatus,
      infoSentToTeacherAt: row.handoverToTeacherAt,
      fundInfo: row.fundInfo,
      fundRemark: row.fundRemark,
      submissionEmail: row.submitEmail,
      submissionEmailPassword: row.submitEmailPassword,
      authorRegistrationUrl: row.authorRegistrationUrl,
      authorRegistrationName: row.authorRegistrationName,
      backupSubmissionUrl: row.backupSubmissionUrl,
      backupSubmissionName: row.backupSubmissionName,
      operationMethod: row.operationMethod,
      plagiarismRequirement: row.checkedDuplicate ? '已查重' : '未确认',
      responsibleTeacher: row.dispatchedTeacherId,
      statusStage: row.orderStage,
      paperProgress: row.paperProgress,
      assignedTeacher: row.teacherId,
      assignedTeacherName: row.teacherName,
      backupTeacher: row.backupTeacher,
      backupTeachers: this.parseBackupTeachers(row.backupTeachers, row.backupTeacher),
      teacherPhone: row.teacherPhone,
      teacherWechat: row.teacherWechat,
      teacherStability: row.teacherStability,
      innovationReviewStatus: row.innovationReviewStatus,
      innovationReviewAt: row.innovationReviewAt,
      firstDraftReviewStatus: row.draftReviewStatus,
      firstDraftReviewAt: row.draftReviewAt,
      editorReviewStatus: row.editorReviewStatus,
      editorReviewAt: row.editorReviewAt,
      authorInfoChecked: row.authorVerifyStatus,
      authorInfoCheckedAt: row.authorVerifyAt,
      salesContact: row.salesContact,
      academicOwner: row.academicOwner,
      lastTeacherUpdateAt: row.lastTeacherUpdateAt,
      customerComplaint: row.customerComplaint,
      needsSupervisor: row.needsSupervisor,
      emergencyStatus: row.emergencyStatus,
      supervisorNote: row.supervisorNote,
      academicRemark: row.academicRemark,
      nextFollowUpAt: row.nextFollowAt,
      riskLevel: row.riskLevel,
      journalStatus: row.currentStage,
      submittedExpectedAt: row.submittedExpectedAt,
      withEditorExpectedAt: row.withEditorExpectedAt,
      underReviewExpectedAt: row.underReviewExpectedAt,
      revisionExpectedAt: row.revisionExpectedAt,
      acceptedExpectedAt: row.acceptedExpectedAt,
      proofingExpectedAt: row.proofingExpectedAt,
      onlineExpectedAt: row.onlineExpectedAt,
      indexedExpectedAt: row.indexedExpectedAt,
      firstWeekCheckAt: row.firstWeekCheckAt,
      nextJournalCheckAt: row.nextCheckAt,
      reminderLetterStatus: row.urgeLetterStatus,
      revisionStatus: row.revisionStatus,
      revisionDueAt: row.revisionDueAt,
      pageFeeStatus: row.pageFeeStatus,
      proofingStatus: row.proofStatus,
      onlineStatus: row.onlineStatus,
      onlineAt: row.onlineAt,
      indexingStatus: row.indexedStatus,
      indexingAt: row.indexingAt,
      reviewReportStatus: row.indexReviewReport,
    };
  }

  private buildOrderDeliveryPatch(input: Record<string, any>): Partial<Order> {
    const patch: Partial<Order> = {};
    const setString = (key: keyof Order, value: any) => {
      if (value !== undefined) {
        (patch as any)[key] = value === '' || value === null ? null : String(value);
      }
    };
    const setDate = (key: keyof Order, value: any) => {
      if (value !== undefined) {
        (patch as any)[key] = value ? new Date(value) : null;
      }
    };
    const setBoolean = (key: keyof Order, value: any) => {
      if (value !== undefined) {
        (patch as any)[key] = value === true || value === 'true' || value === 1 || value === '1';
      }
    };
    setString('educationLevel', input.degreeLevel);
    setString('customerName', input.customerName);
    setString('major', input.majorDirection);
    setString('area', input.requiredZone);
    setString('articlePurpose', input.paperUse);
    setString('registrationStatus', input.registrationFormStatus);
    setDate('handoverToTeacherAt', input.infoSentToTeacherAt);
    setString('fundInfo', input.fundInfo);
    setString('fundRemark', input.fundRemark);
    setString('submitEmail', input.submissionEmail);
    setString('submitEmailPassword', input.submissionEmailPassword);
    setString('authorRegistrationUrl', input.authorRegistrationUrl);
    setString('authorRegistrationName', input.authorRegistrationName);
    setString('backupSubmissionUrl', input.backupSubmissionUrl);
    setString('backupSubmissionName', input.backupSubmissionName);
    setString('operationMethod', input.operationMethod);
    if (input.plagiarismRequirement !== undefined) {
      patch.checkedDuplicate = ['已查重', '需要查重'].includes(String(input.plagiarismRequirement));
    }
    setString('dispatchedTeacherId', input.responsibleTeacher);
    setBoolean('institutionAccepted', input.institutionAccepted);
    const academicStatus = this.normalizeAcademicStage(input.statusStage);
    setString('orderStage', academicStatus ?? input.statusStage);
    if (academicStatus || input.orderStatus !== undefined) {
      const nextOrderStatus = academicStatus ?? String(input.orderStatus || '');
      if (ALLOWED_ORDER_STATUS.includes(nextOrderStatus as OrderStatus)) {
        patch.orderStatus = nextOrderStatus as OrderStatus;
      }
    }
    setString('paperProgress', input.paperProgress);
    setString('teacherId', input.assignedTeacher);
    setString('teacherName', input.assignedTeacherName);
    setString('backupTeacher', input.backupTeacher);
    if (input.backupTeachers !== undefined) {
      const backupTeachers = this.normalizeBackupTeachers(input.backupTeachers);
      patch.backupTeachers = backupTeachers.length > 0 ? JSON.stringify(backupTeachers) : null;
      patch.backupTeacher = backupTeachers[0]?.teacherName || backupTeachers[0]?.teacherId || null;
    }
    setString('teacherPhone', input.teacherPhone);
    setString('teacherWechat', input.teacherWechat);
    setString('teacherStability', input.teacherStability);
    setString('innovationReviewStatus', input.innovationReviewStatus);
    setDate('innovationReviewAt', input.innovationReviewAt);
    setString('draftReviewStatus', input.firstDraftReviewStatus);
    setDate('draftReviewAt', input.firstDraftReviewAt);
    setString('editorReviewStatus', input.editorReviewStatus);
    setDate('editorReviewAt', input.editorReviewAt);
    setString('authorVerifyStatus', input.authorInfoChecked);
    setDate('authorVerifyAt', input.authorInfoCheckedAt);
    setString('salesContact', input.salesContact);
    setString('academicOwner', input.academicOwner);
    setDate('lastTeacherUpdateAt', input.lastTeacherUpdateAt);
    setString('customerComplaint', input.customerComplaint);
    setString('needsSupervisor', input.needsSupervisor);
    setString('emergencyStatus', input.emergencyStatus);
    setString('supervisorNote', input.supervisorNote);
    setString('academicRemark', input.academicRemark);
    setString('currentStage', input.journalStatus);
    setDate('submittedExpectedAt', input.submittedExpectedAt);
    setDate('withEditorExpectedAt', input.withEditorExpectedAt);
    setDate('underReviewExpectedAt', input.underReviewExpectedAt);
    setDate('revisionExpectedAt', input.revisionExpectedAt);
    setDate('acceptedExpectedAt', input.acceptedExpectedAt);
    setDate('proofingExpectedAt', input.proofingExpectedAt);
    setDate('onlineExpectedAt', input.onlineExpectedAt);
    setDate('indexedExpectedAt', input.indexedExpectedAt);
    setDate('firstWeekCheckAt', input.firstWeekCheckAt);
    setDate('nextCheckAt', input.nextJournalCheckAt);
    setString('urgeLetterStatus', input.reminderLetterStatus);
    setString('revisionStatus', input.revisionStatus);
    setDate('revisionDueAt', input.revisionDueAt);
    setString('pageFeeStatus', input.pageFeeStatus);
    setString('proofStatus', input.proofingStatus);
    setString('onlineStatus', input.onlineStatus);
    setDate('onlineAt', input.onlineAt);
    setString('indexedStatus', input.indexingStatus);
    setDate('indexingAt', input.indexingAt);
    setString('indexReviewReport', input.reviewReportStatus);
    setString('riskLevel', input.riskLevel);
    setDate('nextFollowAt', input.nextFollowUpAt);
    return patch;
  }

  /**
   * 将教务端第 0 块的两个阶段收敛到订单核心状态。
   */
  private normalizeAcademicStage(value: any): OrderStatus | null {
    if (value === undefined || value === null || value === '') return null;
    return ACADEMIC_STAGE_TO_STATUS[String(value)] ?? null;
  }

  /**
   * 解析备用老师 JSON，兼容历史单个 backup_teacher 字段。
   */
  private parseBackupTeachers(raw: string | null, legacyBackupTeacher?: string | null): BackupTeacherRow[] {
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return this.normalizeBackupTeachers(parsed);
        }
      } catch {
        return legacyBackupTeacher ? [{ teacherName: legacyBackupTeacher }] : [];
      }
    }
    return legacyBackupTeacher ? [{ teacherName: legacyBackupTeacher }] : [];
  }

  /**
   * 规范化备用老师行，避免空行和多余字段写入订单。
   */
  private normalizeBackupTeachers(value: any): BackupTeacherRow[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => ({
        teacherId: item?.teacherId || item?.teacher_id ? String(item.teacherId || item.teacher_id) : null,
        teacherName: item?.teacherName || item?.teacher_name ? String(item.teacherName || item.teacher_name) : null,
        teacherPhone: item?.teacherPhone || item?.teacher_phone ? String(item.teacherPhone || item.teacher_phone) : null,
        teacherStability: item?.teacherStability || item?.teacher_stability
          ? String(item.teacherStability || item.teacher_stability)
          : null,
      }))
      .filter((item) => item.teacherId || item.teacherName || item.teacherPhone || item.teacherStability);
  }

  private buildOrderAuthor(
    orderId: string,
    input: Record<string, any>,
    index: number,
  ): OrderAuthor | null {
    const name = String(input.name || input.authorName || '').trim();
    if (!name) return null;
    return {
      id: input.id || makeId(),
      orderId,
      authorOrder: Number(input.authorOrder || input.order || index + 1),
      name,
      email: input.email ? String(input.email).trim() : null,
      degree: input.degree ? String(input.degree).trim() : null,
      school: input.school ? String(input.school).trim() : null,
      zipCode: input.zipCode ? String(input.zipCode).trim() : null,
      nameEn: input.nameEn ? String(input.nameEn).trim() : null,
    } as OrderAuthor;
  }

  private buildOrderSubmission(
    orderId: string,
    input: Record<string, any>,
    index: number,
    type: 'regular' | 'backup' = 'regular',
  ): OrderSubmission | null {
    const paperTitle = String(input.paperTitle || '').trim();
    const journalName = String(input.journalName || '').trim();
    const hasAnyValue = [
      paperTitle,
      journalName,
      input.journalUrl || input.submissionUrl,
      input.account || input.submissionAccount,
      input.password || input.submissionPassword,
      input.submitTime || input.submittedAt,
    ].some((value) => value !== undefined && value !== null && String(value).trim() !== '');
    if (!hasAnyValue && type === 'regular') return null;
    return {
      id: input.id || makeId(),
      orderId,
      submissionNo: Number(input.submissionNo || input.no || index + 1),
      paperTitle: paperTitle || `投稿信息 ${index + 1}`,
      journalName: journalName || null,
      journalUrl: input.journalUrl || input.submissionUrl ? String(input.journalUrl || input.submissionUrl).trim() : null,
      account: input.account || input.submissionAccount ? String(input.account || input.submissionAccount).trim() : null,
      password: input.password || input.submissionPassword ? String(input.password || input.submissionPassword).trim() : null,
      submitTime: input.submitTime || input.submittedAt ? new Date(input.submitTime || input.submittedAt) : null,
      type,
    } as OrderSubmission;
  }

  private buildOrderFinance(
    orderId: string,
    input: Record<string, any>,
    current: OrderFinance | null,
  ): OrderFinance {
    const base = current ? { ...current } : { id: makeId(), orderId };
    // 只覆盖入参中实际存在的字段，不覆盖的保留数据库原值
    if (input.orderAmount !== undefined && input.orderAmount !== null && input.orderAmount !== '') {
      const orderAmount = this.normalizeMoney(input.orderAmount);
      (base as any).orderAmount = orderAmount;
      (base as any).clientPending = this.computePending(
        orderAmount,
        (base as any).clientPaid ?? this.normalizeMoney(input.customerPaid ?? input.clientPaid),
      );
    }
    if (input.customerPaid !== undefined && input.customerPaid !== null && input.customerPaid !== '') {
      const clientPaid = this.normalizeMoney(input.customerPaid ?? input.clientPaid);
      (base as any).clientPaid = clientPaid;
      (base as any).clientPending = this.computePending(
        (base as any).orderAmount ?? this.normalizeMoney(input.orderAmount),
        clientPaid,
      );
    }
    if (input.teacherPrice !== undefined && input.teacherPrice !== null && input.teacherPrice !== '') {
      const teacherPrice = this.normalizeMoney(input.teacherPrice);
      (base as any).teacherPrice = teacherPrice;
      (base as any).teacherPending = this.computePending(
        teacherPrice,
        (base as any).teacherPaid ?? this.normalizeMoney(input.teacherPaid),
      );
    }
    if (input.teacherPaid !== undefined && input.teacherPaid !== null && input.teacherPaid !== '') {
      const teacherPaid = this.normalizeMoney(input.teacherPaid);
      (base as any).teacherPaid = teacherPaid;
      (base as any).teacherPending = this.computePending(
        (base as any).teacherPrice ?? this.normalizeMoney(input.teacherPrice),
        teacherPaid,
      );
    }
    return base as OrderFinance;
  }

  private mapOrderAuthor(row: OrderAuthor): any {
    return {
      id: row.id,
      orderId: row.orderId,
      authorOrder: row.authorOrder,
      name: row.name,
      email: row.email,
      degree: row.degree,
      school: row.school,
      zipCode: row.zipCode,
      nameEn: row.nameEn,
    };
  }

  private mapOrderSubmission(row: OrderSubmission): any {
    return {
      id: row.id,
      orderId: row.orderId,
      submissionNo: row.submissionNo,
      paperTitle: row.paperTitle,
      journalName: row.journalName,
      journalUrl: row.journalUrl,
      account: row.account,
      password: row.password,
      submitTime: row.submitTime,
    };
  }

  private mapOrderFinance(row: OrderFinance | null): any {
    return {
      orderAmount: row?.orderAmount ?? null,
      customerPaid: row?.clientPaid ?? null,
      customerPending: row?.clientPending ?? null,
      teacherPrice: row?.teacherPrice ?? null,
      teacherPaid: row?.teacherPaid ?? null,
      teacherPending: row?.teacherPending ?? null,
    };
  }

  private hasNonEmptyObjectFields(value?: Record<string, any>): boolean {
    if (!value || Object.keys(value).length === 0) return false;
    return Object.values(value).some((item) => {
      if (item === undefined || item === null) return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === 'object') return Object.keys(item).length > 0;
      return String(item).trim() !== '';
    });
  }

  private normalizeMoney(value: any): string | null {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num.toFixed(2);
  }

  private computePending(total: string | null, paid: string | null): string | null {
    if (total === null && paid === null) return null;
    const totalNum = Number(total || 0);
    const paidNum = Number(paid || 0);
    return (totalNum - paidNum).toFixed(2);
  }

  /**
   * 成交时付款状态必填，且必须表示已经发生付款。
   */
  private normalizeRequiredPaidStatus(value: any): PaidStatus {
    const paidStatus = String(value || '').trim() as PaidStatus;
    if (!ALLOWED_PAID.includes(paidStatus) || paidStatus === 'unpaid' || paidStatus === 'refunded') {
      throw new BadRequestException('付款状态必填，且必须为部分付款或已付款');
    }
    return paidStatus;
  }

  /**
   * 成交/领取要求付款阶段明确进入已付节点。
   */
  private normalizeRequiredPaymentStage(value: any): string {
    const paymentStage = String(value || '').trim();
    if (!this.isPaidDepositStage(paymentStage)) {
      throw new BadRequestException('付款阶段必填，且必须至少为已付定金');
    }
    return paymentStage;
  }

  /**
   * 将销售侧付款金额写入订单财务表。
   */
  private async updateClientPaidFinance(
    orderId: string,
    orderAmountInput: string | null,
    clientPaidInput: any,
  ): Promise<void> {
    const currentFinance = await this.orderFinanceRepository.findOne({ where: { orderId } });
    const orderAmount = this.normalizeMoney(currentFinance?.orderAmount ?? orderAmountInput);
    const clientPaid = this.normalizePositiveMoney(clientPaidInput);
    if (clientPaid === null) {
      throw new BadRequestException('付款金额必填且必须大于0');
    }
    await this.orderFinanceRepository.save({
      ...(currentFinance || {}),
      id: currentFinance?.id || makeId(),
      orderId,
      orderAmount,
      clientPaid,
      clientPending: this.computePending(orderAmount, clientPaid),
      teacherPrice: currentFinance?.teacherPrice ?? null,
      teacherPaid: currentFinance?.teacherPaid ?? null,
      teacherPending: currentFinance?.teacherPending ?? null,
    } as OrderFinance);
  }

  /**
   * 教务领取硬条件：已付定金或后续付款阶段，且客户已付金额大于 0。
   */
  private async assertAcademicClaimable(order: Order): Promise<void> {
    if (!this.isPaidDepositStage(order.paymentStage)) {
      throw new BadRequestException('订单未确认已付定金，暂不能领取');
    }
    const finance = await this.orderFinanceRepository.findOne({ where: { orderId: order.id } });
    const clientPaid = Number(finance?.clientPaid ?? 0);
    if (!Number.isFinite(clientPaid) || clientPaid <= 0) {
      throw new BadRequestException('订单未填写付款金额，暂不能领取');
    }
  }

  /**
   * 判断付款阶段是否满足教务领取的"已付定金及以上"。
   */
  private isPaidDepositStage(value?: string | null): boolean {
    const stage = String(value || '').trim();
    if (!stage) return false;
    if (stage.includes('未付') || stage.includes('未付款')) return false;
    return stage.includes('已付定金') ||
      stage.includes('定金') ||
      stage.includes('已付中期') ||
      stage.includes('中期') ||
      stage.includes('已付尾款') ||
      stage.includes('尾款') ||
      stage.includes('全款') ||
      stage.includes('单期');
  }

  /**
   * 金额字段标准化为大于 0 的两位小数字符串。
   */
  private normalizePositiveMoney(value: any): string | null {
    const money = this.normalizeMoney(value);
    if (money === null) return null;
    return Number(money) > 0 ? money : null;
  }

  /**
   * Resolve order user display names. Historical data may store either users.id
   * or employees.id in orders.academic_user_id, so support both shapes.
   * Employee real name wins over login username.
   */
  private async lookupDisplayNamesForIds(
    idsInput: Array<string | null | undefined>,
  ): Promise<Map<string, string>> {
    const ids = Array.from(new Set(idsInput.filter((v): v is string => !!v)));
    const result = new Map<string, string>();
    if (ids.length === 0) return result;

    const placeholders = ids.map(() => '?').join(',');
    const userRows: Array<{ id: string; username: string | null; employee_name: string | null }> =
      await this.orderRepository.manager.query(
        'SELECT u.id, u.username, e.name AS employee_name ' +
        'FROM users u ' +
        'LEFT JOIN employees e ON e.id COLLATE utf8mb4_unicode_ci = u.employee_id COLLATE utf8mb4_unicode_ci ' +
        `WHERE u.id IN (${placeholders})`,
        ids,
      );
    for (const row of userRows) {
      const name = row.employee_name || row.username;
      if (row.id && name) result.set(row.id, name);
    }

    const missingIds = ids.filter((id) => !result.has(id));
    if (missingIds.length > 0) {
      const employeePlaceholders = missingIds.map(() => '?').join(',');
      const employeeRows: Array<{ id: string; name: string | null }> =
        await this.orderRepository.manager.query(
          `SELECT id, name FROM employees WHERE id IN (${employeePlaceholders})`,
          missingIds,
        );
      for (const row of employeeRows) {
        if (row.id && row.name) result.set(row.id, row.name);
      }
    }

    return result;
  }

  private async lookupUserNames(
    userIds: Array<string | null | undefined>,
  ): Promise<{ salesUserName: string | null; academicUserName: string | null }> {
    const byId = await this.lookupDisplayNamesForIds(userIds);
    return {
      salesUserName: byId.get(userIds[0] || '') ?? null,
      academicUserName: byId.get(userIds[1] || '') ?? null,
    };
  }

  private mapFollowRecord(row: OrderFollowRecord): any {
    return {
      id: row.id,
      orderId: row.orderId,
      userId: row.userId,
      nodeType: row.nodeType,
      content: row.content,
      nextRemindAt: row.nextRemindAt,
      remindStage: row.remindStage,
      createdAt: row.createdAt,
    };
  }
}
