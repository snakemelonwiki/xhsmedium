import { apiClient, normalizePagedResult } from './apiClient';
import type { PageQuery, PagedResult } from '../types/pagination';

type RawRecord = Record<string, unknown>;

function text(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface OrderPaymentStage {
  amount: number;
  paidAt?: string | null;
  source?: string;
}

export interface OrderIncomeRow {
  orderId: string;
  orderCode: string;
  customerName: string;
  orderAmount: number;
  clientPaid: number;
  deposit: OrderPaymentStage | null;
  midterm: OrderPaymentStage | null;
  final: OrderPaymentStage | null;
  extra: OrderPaymentStage | null;
  teacherPaid: number;
  otherExpense: number;
  profit: number;
  orderStatus: string;
  paidStatus: string;
  createdAt: string;
}

export interface TeacherPaymentRow {
  id: string;
  orderId: string;
  teacherId: string;
  stageCode: string;
  stageLabel?: string;
  amount: number;
  paidAt?: string | null;
  note?: string;
  recordedBy?: string;
  createdAt: string;
}

export interface OtherExpenseRow {
  id: string;
  category: string;
  amount: number;
  occurredAt?: string | null;
  note?: string;
  attachmentUrl?: string;
  recordedBy?: string;
  relatedOrderId?: string;
  createdAt: string;
}

export interface OrderIncomeSummary {
  totalAmount: number;
  totalClientPaid: number;
  totalTeacherPaid: number;
  totalOtherExpense: number;
  totalProfit: number;
}

export async function listOrderIncome(query: PageQuery = {}): Promise<{ items: OrderIncomeRow[]; total: number; page: number; pageSize: number; summary: OrderIncomeSummary }> {
  const payload = await apiClient.get<unknown>('/finance/order-income', { query });
  const raw = (payload ?? {}) as RawRecord;
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]) : [];
  const summaryRaw = (raw.summary ?? {}) as RawRecord;
  return {
    items: items.map(mapOrderIncome),
    total: numberValue(raw.total),
    page: numberValue(raw.page),
    pageSize: numberValue(raw.pageSize),
    summary: {
      totalAmount: numberValue(summaryRaw.totalAmount),
      totalClientPaid: numberValue(summaryRaw.totalClientPaid),
      totalTeacherPaid: numberValue(summaryRaw.totalTeacherPaid),
      totalOtherExpense: numberValue(summaryRaw.totalOtherExpense),
      totalProfit: numberValue(summaryRaw.totalProfit),
    },
  };
}

function mapOrderIncome(raw: RawRecord): OrderIncomeRow {
  const parseStage = (s: unknown): OrderPaymentStage | null => {
    if (!s || typeof s !== 'object') return null;
    const r = s as RawRecord;
    return {
      amount: numberValue(r.amount),
      paidAt: text(r.paidAt),
      source: text(r.source),
    };
  };
  return {
    orderId: text(raw.orderId) ?? '',
    orderCode: text(raw.orderCode) ?? '-',
    customerName: text(raw.customerName) ?? '-',
    orderAmount: numberValue(raw.orderAmount),
    clientPaid: numberValue(raw.clientPaid),
    deposit: parseStage(raw.deposit),
    midterm: parseStage(raw.midterm),
    final: parseStage(raw.final),
    extra: parseStage(raw.extra),
    teacherPaid: numberValue(raw.teacherPaid),
    otherExpense: numberValue(raw.otherExpense),
    profit: numberValue(raw.profit),
    orderStatus: text(raw.orderStatus) ?? '',
    paidStatus: text(raw.paidStatus) ?? '',
    createdAt: text(raw.createdAt) ?? '',
  };
}

export async function listTeacherPayments(query: PageQuery & { orderId?: string } = {}): Promise<{ items: TeacherPaymentRow[]; total: number; page: number; pageSize: number }> {
  const payload = await apiClient.get<unknown>('/finance/teacher-payments', { query });
  const raw = (payload ?? {}) as RawRecord;
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]) : [];
  return {
    items: items.map(mapTeacherPayment),
    total: numberValue(raw.total),
    page: numberValue(raw.page),
    pageSize: numberValue(raw.pageSize),
  };
}

function mapTeacherPayment(raw: RawRecord): TeacherPaymentRow {
  return {
    id: text(raw.id) ?? '',
    orderId: text(raw.orderId) ?? '',
    teacherId: text(raw.teacherId) ?? '',
    stageCode: text(raw.stageCode) ?? '',
    stageLabel: text(raw.stageLabel),
    amount: numberValue(raw.amount),
    paidAt: text(raw.paidAt) ?? null,
    note: text(raw.note) ?? undefined,
    recordedBy: text(raw.recordedBy) ?? undefined,
    createdAt: text(raw.createdAt) ?? '',
  };
}

export async function createTeacherPayment(body: Partial<TeacherPaymentRow>): Promise<TeacherPaymentRow> {
  const payload = await apiClient.post<RawRecord>('/finance/teacher-payments', body as unknown as Record<string, unknown>);
  return mapTeacherPayment((payload as any).data ?? payload);
}

export async function updateTeacherPayment(id: string, body: Partial<TeacherPaymentRow>): Promise<TeacherPaymentRow> {
  const payload = await apiClient.request<RawRecord>(`/finance/teacher-payments/${id}`, { method: 'PATCH', body: body as unknown as Record<string, unknown> });
  return mapTeacherPayment((payload as any).data ?? payload);
}

export async function deleteTeacherPayment(id: string): Promise<void> {
  await apiClient.request<void>(`/finance/teacher-payments/${id}`, { method: 'DELETE' });
}

export interface OrderSearchItem {
  id: string;
  orderCode: string;
  customerName: string;
}

export async function searchOrders(keyword: string): Promise<OrderSearchItem[]> {
  if (!keyword.trim()) return [];
  const payload = await apiClient.get<unknown>('/orders', {
    query: { keyword, scope: 'all', limit: 20, offset: 0 },
  });
  const raw = (payload ?? {}) as RawRecord;
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]) : Array.isArray(payload) ? (payload as RawRecord[]) : [];
  return items.map((r) => ({
    id: text(r.id) ?? '',
    orderCode: text(r.orderCode ?? r.order_code) ?? text(r.id) ?? '',
    customerName: text(r.customerName ?? r.customer_name) ?? '-',
  }));
}

export async function listOtherExpenses(query: PageQuery = {}): Promise<{ items: OtherExpenseRow[]; total: number; page: number; pageSize: number }> {
  const payload = await apiClient.get<unknown>('/finance/other-expenses', { query });
  const raw = (payload ?? {}) as RawRecord;
  const items = Array.isArray(raw.items) ? (raw.items as RawRecord[]) : [];
  return {
    items: items.map(mapOtherExpense),
    total: numberValue(raw.total),
    page: numberValue(raw.page),
    pageSize: numberValue(raw.pageSize),
  };
}

function mapOtherExpense(raw: RawRecord): OtherExpenseRow {
  return {
    id: text(raw.id) ?? '',
    category: text(raw.category) ?? '',
    amount: numberValue(raw.amount),
    occurredAt: text(raw.occurredAt) ?? null,
    note: text(raw.note) ?? undefined,
    attachmentUrl: text(raw.attachmentUrl) ?? undefined,
    recordedBy: text(raw.recordedBy) ?? undefined,
    relatedOrderId: text(raw.relatedOrderId) ?? undefined,
    createdAt: text(raw.createdAt) ?? '',
  };
}

export async function createOtherExpense(body: Partial<OtherExpenseRow>): Promise<OtherExpenseRow> {
  const payload = await apiClient.post<RawRecord>('/finance/other-expenses', body as unknown as Record<string, unknown>);
  return mapOtherExpense((payload as any).data ?? payload);
}

export async function updateOtherExpense(id: string, body: Partial<OtherExpenseRow>): Promise<OtherExpenseRow> {
  const payload = await apiClient.request<RawRecord>(`/finance/other-expenses/${id}`, { method: 'PATCH', body: body as unknown as Record<string, unknown> });
  return mapOtherExpense((payload as any).data ?? payload);
}

export async function deleteOtherExpense(id: string): Promise<void> {
  await apiClient.request<void>(`/finance/other-expenses/${id}`, { method: 'DELETE' });
}
