import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { OrderPayment } from '../../entities/order-payment.entity';
import { TeacherPayment } from '../../entities/teacher-payment.entity';
import { OtherExpense } from '../../entities/other-expense.entity';
import { OrderFinance } from '../../entities/order-finance.entity';
import { Order } from '../../entities/order.entity';
import { makeId } from '../../shared/utils/id-generator';

// F-4/F-5：list 入参白名单与上限。
const ALLOWED_ORDER_STATUS = [
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
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_KEYWORD_LEN = 64;

// F-7：付款阶段 → stage_code 显式映射（与 OrdersService.mapPaymentStageToCode 保持一致）。
const PAYMENT_STAGE_TO_CODE: Record<string, string> = {
  已付定金: 'deposit',
  已付中期: 'midterm',
  已付尾款: 'final',
  已付全款: 'final',
  全款: 'final',
};
const STAGE_LABELS: Record<string, string> = {
  deposit: '定金',
  midterm: '中期',
  final: '尾款',
  extra: '额外',
};
const STAGE_INDEX: Record<string, number> = {
  deposit: 0,
  midterm: 1,
  final: 2,
  extra: 3,
};

// teacher_payments.stage_code 白名单（draft/revision/acceptance）。
const ALLOWED_TEACHER_STAGE_CODES = ['draft', 'revision', 'acceptance'];

function parsePage(value: unknown): number {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function parsePageSize(value: unknown): number {
  const n = Number(value ?? DEFAULT_PAGE_SIZE);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

// F-11：金额校验。返回规范化后的两位小数字符串，非法抛 BadRequestException。
function parseMoney(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') {
    throw new BadRequestException(`${field}必填`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${field}必须是数字`);
  }
  if (n <= 0) {
    throw new BadRequestException(`${field}必须大于 0`);
  }
  return n.toFixed(2);
}

// F-4：日期格式校验 YYYY-MM-DD。
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const s = String(value);
  if (!DATE_RE.test(s)) {
    throw new BadRequestException(`${field}格式必须为 YYYY-MM-DD`);
  }
  return s;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(OrderPayment)
    private readonly orderPaymentRepo: Repository<OrderPayment>,
    @InjectRepository(TeacherPayment)
    private readonly teacherPaymentRepo: Repository<TeacherPayment>,
    @InjectRepository(OtherExpense)
    private readonly otherExpenseRepo: Repository<OtherExpense>,
    @InjectRepository(OrderFinance)
    private readonly orderFinanceRepo: Repository<OrderFinance>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
  ) {}

  // ==================== 订单收入 ====================

  /**
   * 列出订单收入表。
   * 关联 orders + order_finance + order_payments（客户回款阶段） + teacher_payments（老师已付） + other_expenses（可选分摊）。
   * 同时返回 summary 全量合计（不受分页影响），前端不再用 items.reduce 算总额。
   */
  async listOrderIncome(query: any): Promise<any> {
    const page = parsePage(query?.page);
    const pageSize = parsePageSize(query?.pageSize);
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    const startDate = parseDate(query?.startDate, 'startDate');
    const endDate = parseDate(query?.endDate, 'endDate');
    const status = query?.status
      ? String(query.status)
      : undefined;
    if (status && !ALLOWED_ORDER_STATUS.includes(status)) {
      throw new BadRequestException('status 不在允许列表内');
    }
    let keyword = query?.keyword ? String(query.keyword).trim() : '';
    if (keyword.length > MAX_KEYWORD_LEN) keyword = keyword.slice(0, MAX_KEYWORD_LEN);

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    if (startDate) {
      whereClauses.push('o.created_at >= ?');
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      whereClauses.push('o.created_at <= ?');
      params.push(`${endDate} 23:59:59`);
    }
    if (status) {
      whereClauses.push('o.order_status = ?');
      params.push(status);
    }
    if (keyword) {
      whereClauses.push('(o.order_code LIKE ? OR o.customer_name LIKE ?)');
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereSql = whereClauses.join(' AND ');

    const sql = `
      SELECT
        o.id AS orderId,
        o.order_code AS orderCode,
        o.customer_name AS customerName,
        o.amount AS orderAmount,
        o.order_status AS orderStatus,
        o.paid_status AS paidStatus,
        o.created_at AS createdAt
      FROM orders o
      WHERE ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const orders = await this.orderRepo.query(sql, [...params, limit, offset]);

    const countSql = `SELECT COUNT(*) as total FROM orders o WHERE ${whereSql}`;
    const countResult = await this.orderRepo.query(countSql, [...params]);
    const total = Number(countResult[0]?.total ?? 0);

    // F-8：summary 全量合计（不分页，与列表 filter 一致）。
    // 用 SUM(...) 直接在 DB 算，避免把全量行拉到 Node 内存。
    // 注意：client_paid 不存在于 orders 表（位于 order_finance.client_paid），
    // 且 items 的 clientPaid 口径是 SUM(order_payments.amount)，因此 totalClientPaid
    // 也用 order_payments 子表 JOIN 求和（在 computeSummaryTotals 内一并算出）。
    const summarySql = `
      SELECT
        COALESCE(SUM(o.amount), 0) AS totalAmount
      FROM orders o
      WHERE ${whereSql}
    `;
    const summaryRow = await this.orderRepo.query(summarySql, [...params]);
    const summaryTotalAmount = Number(summaryRow[0]?.totalAmount ?? 0);

    const orderIds = orders.map((o: any) => o.orderId);
    const orderPayments = orderIds.length
      ? await this.orderPaymentRepo.query(
          `SELECT * FROM order_payments WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
          orderIds,
        )
      : [];
    const teacherPayments = orderIds.length
      ? await this.teacherPaymentRepo.query(
          `SELECT order_id, SUM(amount) AS total FROM teacher_payments WHERE order_id IN (${orderIds.map(() => '?').join(',')}) GROUP BY order_id`,
          orderIds,
        )
      : [];
    const otherExpenses = orderIds.length
      ? await this.otherExpenseRepo.query(
          `SELECT related_order_id AS orderId, SUM(amount) AS total FROM other_expenses WHERE related_order_id IN (${orderIds.map(() => '?').join(',')}) GROUP BY related_order_id`,
          orderIds,
        )
      : [];

    const orderPaymentsByOrderId = groupBy(orderPayments, 'order_id');
    const teacherPaymentsByOrderId = groupBy(teacherPayments, 'order_id');
    const otherExpensesByOrderId = groupBy(otherExpenses, 'orderId');

    let pageTeacherPaid = 0;
    let pageOtherExpense = 0;
    let pageProfit = 0;

    const items = orders.map((row: any) => {
      const opRows = orderPaymentsByOrderId[row.orderId] ?? [];
      const tpTotal = teacherPaymentsByOrderId[row.orderId]?.[0]?.total ?? '0';
      const otherTotal = otherExpensesByOrderId[row.orderId]?.[0]?.total ?? '0';

      const deposit = opRows.find((r: any) => r.stage_code === 'deposit');
      const midterm = opRows.find((r: any) => r.stage_code === 'midterm');
      const final = opRows.find((r: any) => r.stage_code === 'final');
      const extra = opRows.find((r: any) => r.stage_code === 'extra');
      const clientPaidSum = opRows.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0);

      const orderAmount = Number(row.orderAmount ?? 0);
      const teacherPaidNum = Number(tpTotal ?? 0);
      const otherNum = Number(otherTotal ?? 0);
      const profit = orderAmount - teacherPaidNum - otherNum;

      pageTeacherPaid += teacherPaidNum;
      pageOtherExpense += otherNum;
      pageProfit += profit;

      return {
        orderId: row.orderId,
        orderCode: row.orderCode ?? '-',
        customerName: row.customerName ?? '-',
        orderAmount,
        clientPaid: clientPaidSum,
        deposit: deposit ? { amount: Number(deposit.amount), paidAt: deposit.paid_at, source: deposit.source } : null,
        midterm: midterm ? { amount: Number(midterm.amount), paidAt: midterm.paid_at, source: midterm.source } : null,
        final: final ? { amount: Number(final.amount), paidAt: final.paid_at, source: final.source } : null,
        extra: extra ? { amount: Number(extra.amount), paidAt: extra.paid_at, source: extra.source } : null,
        teacherPaid: teacherPaidNum,
        otherExpense: otherNum,
        profit,
        orderStatus: row.orderStatus,
        paidStatus: row.paidStatus,
        createdAt: row.createdAt,
      };
    });

    // F-8：summary 用 DB 全量金额 + 子表全量合计，避免 items.reduce 当页错位。
    const summaryTotals = await this.computeSummaryTotals(whereSql, params);

    return {
      items,
      total,
      page,
      pageSize,
      summary: {
        totalAmount: summaryTotalAmount,
        totalClientPaid: summaryTotals.clientPaid,
        totalTeacherPaid: summaryTotals.teacherPaid,
        totalOtherExpense: summaryTotals.otherExpense,
        totalProfit: summaryTotalAmount - summaryTotals.teacherPaid - summaryTotals.otherExpense,
      },
    };
  }

  /**
   * 全量统计 order_payments / teacher_payments / other_expenses 的合计，受同一份 whereSql 约束。
   * - clientPaid：与列表口径一致，按 SUM(order_payments.amount) 算（而非 orders 主表上不存在的 client_paid 列）。
   */
  private async computeSummaryTotals(
    whereSql: string,
    params: any[],
  ): Promise<{ clientPaid: number; teacherPaid: number; otherExpense: number }> {
    const cpSql = `
      SELECT COALESCE(SUM(op.amount), 0) AS total
      FROM order_payments op
      INNER JOIN orders o ON o.id = op.order_id
      WHERE ${whereSql}
    `;
    const tpSql = `
      SELECT COALESCE(SUM(tp.amount), 0) AS total
      FROM teacher_payments tp
      INNER JOIN orders o ON o.id = tp.order_id
      WHERE ${whereSql}
    `;
    const oeSql = `
      SELECT COALESCE(SUM(oe.amount), 0) AS total
      FROM other_expenses oe
      INNER JOIN orders o ON o.id = oe.related_order_id
      WHERE ${whereSql}
    `;
    const [cpRow, tpRow, oeRow] = await Promise.all([
      this.orderRepo.query(cpSql, params),
      this.orderRepo.query(tpSql, params),
      this.orderRepo.query(oeSql, params),
    ]);
    return {
      clientPaid: Number(cpRow[0]?.total ?? 0),
      teacherPaid: Number(tpRow[0]?.total ?? 0),
      otherExpense: Number(oeRow[0]?.total ?? 0),
    };
  }

  // F-6：销售成交时由 OrdersService 调用，把 client_paid 种入 order_payments。
  // 接受外部 transaction manager，与 closeDeal 同一事务。
  async seedSalesClosePayment(args: {
    manager: EntityManager;
    orderId: string;
    paymentStage: string;
    amount: string;
    salesUserId: string;
  }): Promise<void> {
    const { manager, orderId, paymentStage, amount, salesUserId } = args;
    const stageCode = PAYMENT_STAGE_TO_CODE[paymentStage] ?? 'deposit';
    // 防止同一订单同一阶段重复插入触发 UNIQUE(order_id, stage_code) 冲突。
    // 保护条件：仅当 source='sales_close' 时才覆盖；若已有财务手工录入（finance_manual），
    // 说明财务已补录其他阶段，不应被销售成交覆盖。
    await manager.query(
      `INSERT INTO order_payments
       (id, order_id, stage_code, stage_label, stage_index, amount, paid_at, note, source, recorded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         amount = IF(source = 'sales_close', VALUES(amount), amount),
         paid_at = IF(source = 'sales_close', CURRENT_TIMESTAMP, paid_at),
         note = IF(source = 'sales_close', VALUES(note), note),
         updated_at = CURRENT_TIMESTAMP`,
      [
        makeId(),
        orderId,
        stageCode,
        STAGE_LABELS[stageCode] ?? paymentStage,
        STAGE_INDEX[stageCode] ?? 0,
        amount,
        `来自销售成交：${paymentStage}`,
        'sales_close',
        salesUserId,
      ],
    );
  }

  // ==================== 订单支出（老师付款） ====================

  async listTeacherPayments(query: any): Promise<any> {
    const page = parsePage(query?.page);
    const pageSize = parsePageSize(query?.pageSize);
    const offset = (page - 1) * pageSize;

    const qb = this.teacherPaymentRepo.createQueryBuilder('tp')
      .orderBy('tp.created_at', 'DESC')
      .limit(pageSize)
      .offset(offset);

    const orderId = query?.orderId ? String(query.orderId) : undefined;
    if (orderId) {
      qb.andWhere('tp.order_id = :orderId', { orderId });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async createTeacherPayment(body: any, userId: string): Promise<TeacherPayment> {
    // F-10：校验 order 存在。
    const orderId = body.orderId ? String(body.orderId) : '';
    if (!orderId) throw new BadRequestException('orderId 必填');
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`order not found: ${orderId}`);

    // F-11：金额校验。
    const amount = parseMoney(body.amount, 'amount');

    // stage_code 白名单。
    const stageCode = body.stageCode ? String(body.stageCode) : '';
    if (!ALLOWED_TEACHER_STAGE_CODES.includes(stageCode)) {
      throw new BadRequestException(`stageCode 必须为 ${ALLOWED_TEACHER_STAGE_CODES.join('/')} 之一`);
    }
    const teacherId = body.teacherId ? String(body.teacherId) : '';
    if (!teacherId) throw new BadRequestException('teacherId 必填');

    const payment = this.teacherPaymentRepo.create({
      id: makeId(),
      orderId,
      teacherId,
      stageCode,
      stageLabel: body.stageLabel ?? stageCode,
      amount,
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
      note: body.note ?? null,
      recordedBy: userId,
    });
    const saved = await this.teacherPaymentRepo.save(payment);
    await this.syncOrderFinanceTeacherFields(saved.orderId);
    return saved;
  }

  async updateTeacherPayment(id: string, body: any, userId: string): Promise<TeacherPayment> {
    // F-2：记录不存在抛 404。
    const payment = await this.teacherPaymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`teacher_payment not found: ${id}`);

    const updates: any = {};
    if (body.orderId !== undefined) {
      // F-10：若换订单，校验目标订单存在。
      const order = await this.orderRepo.findOne({ where: { id: body.orderId } });
      if (!order) throw new NotFoundException(`order not found: ${body.orderId}`);
      updates.orderId = body.orderId;
    }
    if (body.teacherId !== undefined) {
      updates.teacherId = String(body.teacherId);
    }
    if (body.stageCode !== undefined) {
      const stageCode = String(body.stageCode);
      if (!ALLOWED_TEACHER_STAGE_CODES.includes(stageCode)) {
        throw new BadRequestException(`stageCode 必须为 ${ALLOWED_TEACHER_STAGE_CODES.join('/')} 之一`);
      }
      updates.stageCode = stageCode;
    }
    if (body.stageLabel !== undefined) updates.stageLabel = body.stageLabel;
    if (body.amount !== undefined) {
      // F-11：金额校验。
      updates.amount = parseMoney(body.amount, 'amount');
    }
    if (body.paidAt !== undefined) {
      updates.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    }
    if (body.note !== undefined) updates.note = body.note ?? null;
    updates.recordedBy = userId;

    await this.teacherPaymentRepo.update({ id }, updates);
    const refreshed = await this.teacherPaymentRepo.findOne({ where: { id } });
    if (refreshed) {
      await this.syncOrderFinanceTeacherFields(refreshed.orderId);
      // 如果换订单，旧订单也要重算。
      if (payment.orderId !== refreshed.orderId) {
        await this.syncOrderFinanceTeacherFields(payment.orderId);
      }
    }
    return refreshed as TeacherPayment;
  }

  async deleteTeacherPayment(id: string): Promise<void> {
    const payment = await this.teacherPaymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`teacher_payment not found: ${id}`);
    await this.teacherPaymentRepo.delete({ id });
    await this.syncOrderFinanceTeacherFields(payment.orderId);
  }

  // F-15：让 order_finance.teacher_paid / teacher_pending 与 teacher_payments 子表保持同步。
  // 在 create/update/delete teacher_payment 后调用，重算该订单下所有老师付款总额，
  // 用 teacher_price（订单 update 时维护）减去 teacher_paid 得到 teacher_pending。
  private async syncOrderFinanceTeacherFields(orderId: string): Promise<void> {
    const financeRow = await this.orderFinanceRepo.findOne({ where: { orderId } });
    if (!financeRow) return;
    const sumRow = await this.teacherPaymentRepo.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM teacher_payments WHERE order_id = ?`,
      [orderId],
    );
    const teacherPaid = Number(sumRow[0]?.total ?? 0).toFixed(2);
    const teacherPriceRaw = financeRow.teacherPrice;
    let teacherPending: string | null = null;
    if (teacherPriceRaw != null) {
      const teacherPriceNum = Number(teacherPriceRaw);
      if (Number.isFinite(teacherPriceNum)) {
        teacherPending = (teacherPriceNum - Number(teacherPaid)).toFixed(2);
      }
    }
    await this.orderFinanceRepo.update({ id: financeRow.id }, {
      teacherPaid,
      teacherPending,
    } as any);
  }

  // ==================== 其他支出 ====================

  async listOtherExpenses(query: any): Promise<any> {
    const page = parsePage(query?.page);
    const pageSize = parsePageSize(query?.pageSize);
    const offset = (page - 1) * pageSize;

    const [items, total] = await this.otherExpenseRepo.findAndCount({
      order: { createdAt: 'DESC' } as any,
      take: pageSize,
      skip: offset,
    });
    return { items, total, page, pageSize };
  }

  async createOtherExpense(body: any, userId: string): Promise<OtherExpense> {
    const category = body.category ? String(body.category).trim() : '';
    if (!category) throw new BadRequestException('category 必填');
    const amount = parseMoney(body.amount, 'amount');

    // F-10：若关联订单，校验存在。
    let relatedOrderId: string | null = null;
    if (body.relatedOrderId) {
      relatedOrderId = String(body.relatedOrderId);
      const order = await this.orderRepo.findOne({ where: { id: relatedOrderId } });
      if (!order) throw new NotFoundException(`order not found: ${relatedOrderId}`);
    }

    const expense = this.otherExpenseRepo.create({
      id: makeId(),
      category,
      amount,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
      note: body.note ?? null,
      attachmentUrl: body.attachmentUrl ?? null,
      recordedBy: userId,
      relatedOrderId,
    });
    return this.otherExpenseRepo.save(expense);
  }

  async updateOtherExpense(id: string, body: any, userId: string): Promise<OtherExpense> {
    const expense = await this.otherExpenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException(`other_expense not found: ${id}`);

    const updates: any = {};
    if (body.category !== undefined) {
      const category = String(body.category).trim();
      if (!category) throw new BadRequestException('category 不能为空');
      updates.category = category;
    }
    if (body.amount !== undefined) {
      updates.amount = parseMoney(body.amount, 'amount');
    }
    if (body.occurredAt !== undefined) {
      updates.occurredAt = body.occurredAt ? new Date(body.occurredAt) : null;
    }
    if (body.note !== undefined) updates.note = body.note ?? null;
    if (body.attachmentUrl !== undefined) updates.attachmentUrl = body.attachmentUrl ?? null;
    if (body.relatedOrderId !== undefined) {
      if (body.relatedOrderId) {
        const order = await this.orderRepo.findOne({ where: { id: body.relatedOrderId } });
        if (!order) throw new NotFoundException(`order not found: ${body.relatedOrderId}`);
        updates.relatedOrderId = String(body.relatedOrderId);
      } else {
        updates.relatedOrderId = null;
      }
    }
    updates.recordedBy = userId;
    await this.otherExpenseRepo.update({ id }, updates);
    return (await this.otherExpenseRepo.findOne({ where: { id } })) as OtherExpense;
  }

  async deleteOtherExpense(id: string): Promise<void> {
    const expense = await this.otherExpenseRepo.findOne({ where: { id } });
    if (!expense) throw new NotFoundException(`other_expense not found: ${id}`);
    await this.otherExpenseRepo.delete({ id });
  }
}

function groupBy(arr: any[], key: string): Record<string, any[]> {
  const result: Record<string, any[]> = {};
  for (const item of arr) {
    const k = item[key];
    if (!result[k]) result[k] = [];
    result[k].push(item);
  }
  return result;
}
