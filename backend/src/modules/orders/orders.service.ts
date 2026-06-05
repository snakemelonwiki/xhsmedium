import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { Order, HANDOVER_STATUS_CODES, HandoverStatusCode } from '../../entities/order.entity';
import { OrderFollowRecord } from '../../entities/order-follow-record.entity';
import { OrderFinance } from '../../entities/order-finance.entity';
import { Lead } from '../../entities/lead.entity';
import { User } from '../../entities/user.entity';
import { makeId } from '../../shared/utils/id-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_TYPES } from '../../shared/notifications';

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
const ALLOWED_HANDOVER_STATUS: HandoverStatusCode[] = [...HANDOVER_STATUS_CODES];

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
  remark: '备注',
};

interface CloseDealDto {
  serviceType?: string | null;
  amount?: number | string | null;
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
  remark?: string | null;
}

interface OrderFollowDto {
  nodeType: string;
  content?: string | null;
  nextRemindAt?: string | Date | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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
      // v1.3 / CROSS-4: 在同一事务内生成订单编号 ORD-YYYYMMDD-XXXXX
      // 必须在 INSERT Order 之前完成（行锁在同一事务内保持），避免并发时序号重复。
      generatedOrderCode = await this.generateOrderCode(manager);
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
      const remark = this.composeRemark(dto);
      const amountStr = dto.amount != null && dto.amount !== '' ? String(dto.amount) : null;
      await manager.query(
        `UPDATE leads
         SET process_status = ?, deal_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        ['deal_done', 'deal_done', 'in_followup', leadId],
      );
      await manager.query(
        `INSERT INTO orders
         (id, lead_id, sales_user_id, academic_user_id, service_type, amount,
          paid_status, order_status, handover_status, remark, order_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          orderId,
          leadId,
          salesUserId,
          null,
          mergedServiceType,
          amountStr,
          dto.paidStatus || 'unpaid',
          'to_receive',
          'handed_over',
          remark,
          orderCode,
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
          '0.00',
          amountStr,
          null,
          null,
          null,
        ],
      );

      // v1.3 / SA-9: 落首条 order_follow_records(销售成交记录)。
      const followContent = this.composeFollowContent(dto, generatedOrderCode);
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
  private composeRemark(dto: CloseDealDto): string | null {
    const parts: string[] = [];
    if (dto.clientRequirementNote) parts.push(`客户要求: ${dto.clientRequirementNote}`);
    if (dto.productType) parts.push(`产品: ${dto.productType}`);
    if (dto.serviceType && dto.serviceType !== dto.productType) parts.push(`服务: ${dto.serviceType}`);
    if (dto.guaranteeType) parts.push(`保障: ${dto.guaranteeType}`);
    if (dto.paymentStage) parts.push(`付款: ${dto.paymentStage}`);
    if (dto.deliveryRequirement) parts.push(`交付要求: ${dto.deliveryRequirement}`);
    if (parts.length === 0) return dto.remark || null;
    return parts.join(' || ');
  }

  /**
   * v1.3 / SA-9: 销售成交首条 order_follow_records 的 content 文本。
   */
  private composeFollowContent(dto: CloseDealDto, orderCode: string | null): string {
    const codeLine = orderCode ? `订单编号 ${orderCode}` : '';
    const amountLine = dto.amount != null && dto.amount !== '' ? `金额 ¥${dto.amount}` : '';
    const stageLine = dto.paymentStage ? `付款阶段 ${dto.paymentStage}` : '';
    const lines = [codeLine, amountLine, stageLine].filter(Boolean);
    return lines.join(' | ') || '销售成交';
  }

  /**
   * v1.3 / CROSS-4: 生成订单编号 ORD-YYYYMMDD-XXXXX。
   * - YYYYMMDD：业务统一用 UTC+8 当日日期作为分界（与日志/前端展示一致）
   * - XXXXX：5 位当日自增序号，从 00001 开始每日重置
   * - 并发安全：依赖 orders_order_code_seq 单行 (seq_date) + SELECT ... FOR UPDATE 行锁
   *   保证同一秒内多次成交不会拿到重复序号；事务内调用即可获得行锁语义。
   *
   * 注意：必须传入 EntityManager（来自外层 transaction 的 manager），
   * 不能直接用 Repository 走新连接 — 否则行锁无法跨调用保持。
   */
  private async generateOrderCode(manager: EntityManager): Promise<string> {
    // 业务统一用 UTC+8（北京时间）作为日期分界，避免跨时区部署时出现日期错位。
    const now = new Date();
    const utc8Ms = now.getTime() + 8 * 3600 * 1000;
    const utc8 = new Date(utc8Ms);
    const yyyy = utc8.getUTCFullYear();
    const mm = String(utc8.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(utc8.getUTCDate()).padStart(2, '0');
    const dateKey = `${yyyy}-${mm}-${dd}`;
    const orderCodePrefix = `ORD-${yyyy}${mm}${dd}-`;

    // 先保证当日行存在（INSERT ... ON DUPLICATE KEY UPDATE 不变更 current_seq，仅保证行可被锁）。
    // uk_orders_order_code_seq_date 唯一索引保证每天 1 行。
    await manager.query(
      `INSERT INTO orders_order_code_seq (seq_date, current_seq)
       VALUES (?, 0)
       ON DUPLICATE KEY UPDATE seq_date = seq_date`,
      [dateKey],
    );
    // 行锁：FOR UPDATE 阻塞其他事务对该行的读取，确保自增串行化。
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
    return `${orderCodePrefix}${String(nextSeq).padStart(5, '0')}`;
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
    return rows.map((r) => this.mapOrder(r));
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
    const isAdminLike = options.sessionRole === 'admin' || options.sessionRole === 'owner';

    if (isAdminLike && (options.scope === 'all' || !options.scope)) {
      return;
    }

    if (options.role === 'academic' || options.sessionRole === 'academic') {
      if (options.scope === 'pool') {
        qb.andWhere('o.academic_user_id IS NULL');
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
    return {
      items: rows.map((r) => this.mapOrder(r)),
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
  async getAcademicHomeSummary(currentUserId: string): Promise<{
    pendingReceive: number;
    inProgress: number;
    waitingMaterial: number;
    waitingTeacher: number;
    nearDue: number;
    abnormal: number;
  }> {
    // 走 root qb 复用 applyOrdersScope 的可见性逻辑（academic 默认 = 池单 + 自己已认领）。
    // admin/owner 调用本接口时也回落到"自己经手"（applyOrdersScope 已含）。
    const scope: ListOrdersOptions = {
      role: 'academic',
      sessionRole: 'academic',
      currentUserId: currentUserId || undefined,
    };

    async function count(qb: any): Promise<number> {
      if ((qb as any)._earlyReturnEmpty) return 0;
      const row = await qb.select('COUNT(o.id)', 'cnt').getRawOne();
      const cnt = (row as { cnt?: string | number } | undefined)?.cnt;
      const n = Number(cnt ?? 0);
      return Number.isFinite(n) ? n : 0;
    }

    const buildBase = () => {
      const qb = this.orderRepository.createQueryBuilder('o');
      this.applyOrdersScope(qb, scope);
      return qb;
    };

    // 待接收：池单（academic_user_id IS NULL） + 状态 to_receive。
    const pendingReceive = await count(
      buildBase().andWhere('o.order_status = :s', { s: 'to_receive' }),
    );

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

    return {
      pendingReceive,
      inProgress,
      waitingMaterial,
      waitingTeacher,
      nearDue,
      abnormal,
    };
  }

  async findOne(
    id: string,
    actor?: { userId?: string; role?: string },
  ): Promise<any> {
    const order = await this.orderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException('order not found');
    }
    if (actor) {
      const role = actor.role || '';
      const uid = actor.userId || '';
      const isAdminLike = role === 'admin' || role === 'owner';
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
    const followRecords = await this.orderFollowRepository.find({
      where: { orderId: id },
      order: { createdAt: 'DESC' },
    });
    const names = await this.lookupUserNames([order.salesUserId, order.academicUserId]);
    return {
      ...this.mapOrder(order, names),
      followRecords: followRecords.map((r) => this.mapFollowRecord(r)),
    };
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
    if (role === 'admin' || role === 'owner') return true;
    if (role === 'sales') {
      return Boolean(uid && order.salesUserId === uid);
    }
    if (role === 'academic') {
      return order.academicUserId === uid || order.academicUserId == null;
    }
    return Boolean(uid && (order.salesUserId === uid || order.academicUserId === uid));
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
    if (dto.remark !== undefined) {
      const nextRemark = dto.remark || null;
      if (nextRemark !== current.remark) {
        changedFields.push('remark');
        next.remark = nextRemark;
      }
    }
    if (changedFields.length === 0) return;
    await this.orderRepository.update(id, next);

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
      nextRemindAt: dto.nextRemindAt ? new Date(dto.nextRemindAt) : null,
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
      const isAdminLike = role === 'admin' || role === 'owner';
      if (!isAdminLike) {
        const canSee =
          (role === 'sales' && order.salesUserId === uid) ||
          (role === 'academic' &&
            (order.academicUserId === employeeId || order.academicUserId == null)) ||
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
        where: { role: In(['academic', 'admin', 'owner']) },
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
    status?: string;
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
    if (options.status && ALLOWED_ORDER_STATUS.includes(options.status as OrderStatus)) {
      qb.andWhere('o.order_status = :status', { status: options.status });
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * 批量查 users 表，把 userId 列表映射成 { id -> username }。
   * 用于给订单详情 / 我的成交返回「销售」「教务」的真实姓名，避免前端显示裸 ID。
   * 注意：跨表 collation 不一致（orders=unicode_ci vs users=0900_ai_ci），
   *       用 IN-list 主键查询走 PK 不会触发 collation 冲突。
   */
  private async lookupUserNames(
    userIds: Array<string | null | undefined>,
  ): Promise<{ salesUserName: string | null; academicUserName: string | null }> {
    const ids = Array.from(new Set(userIds.filter((v): v is string => !!v)));
    if (ids.length === 0) {
      return { salesUserName: null, academicUserName: null };
    }
    const users = await this.userRepository.find({
      where: ids.map((id) => ({ id })),
      select: { id: true, username: true },
    });
    const byId = new Map<string, string>();
    for (const u of users) byId.set(u.id, u.username);
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
      createdAt: row.createdAt,
    };
  }
}
