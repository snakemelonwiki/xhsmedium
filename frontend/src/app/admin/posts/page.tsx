'use client';

import {
  DownloadOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Image,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Radio,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import type { ColumnsType, TableProps } from 'antd/es/table';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { QuickRangePicker, RANGE_PRESETS_FULL } from '@/shared/components/date';
import { normalizePostMetric } from '@/shared/utils/post-metrics';
import { buildPostExportFilter, getPostDetailDisplay, getPostQualityMeta, type PostQualityStatus } from './postDetail';
import { getStatusLabel } from '@/shared/constants/lead-status';
import { paidStatusMeta, orderStatusMeta } from '@/shared/api/enums';
import { platformKeyToDisplay } from '@/shared/utils/platform-key';
import type { IntentionLevelCode } from '@/shared/types/leads';
const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZE_OPTIONS = [15, 30, 50, 100];

const INTENTION_LEVEL_META: Record<IntentionLevelCode, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  mid: { label: '中', color: 'orange' },
  low: { label: '低', color: 'blue' },
  invalid: { label: '无效', color: 'default' },
  pending: { label: '待判断', color: 'default' },
};

type PeriodKey = 'today' | 'week' | 'month' | 'all' | 'custom';

type LeadPostMetric = 'leadsCount' | 'traffic';
type LeadPostOperator = 'gt' | 'gte' | 'eq' | 'lte' | 'lt';

type Filters = {
  period: PeriodKey;
  customRange: [string, string] | null;
  platform: string;
  employeeId: string;
  accountId: string;
  postType: string;
  leadPostMetric: LeadPostMetric;
  leadPostOperator: LeadPostOperator;
  leadPostThreshold: number | null;
  keyword: string;
};

const EMPTY_FILTERS: Filters = {
  period: 'today',
  customRange: null,
  platform: '',
  employeeId: '',
  accountId: '',
  postType: '',
  leadPostMetric: 'leadsCount',
  leadPostOperator: 'gte',
  leadPostThreshold: null,
  keyword: '',
};

const platformOptions = [
  { label: '全部平台', value: '' },
  // T4.2 修复 (2026-06-09): value 改为与 DB 实际值对齐的「小红书 / 抖音」，
  //   后端 service 已映射到 ['小红书','xiaohongshu','xhs','乱码'] 兼容匹配。
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const postTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '获客帖', value: '获客帖' },
  { label: '人设帖', value: '人设帖' },
  { label: '讨论帖', value: '讨论帖' },
];

const leadPostMetricOptions: { label: string; value: LeadPostMetric }[] = [
  { label: '客资数', value: 'leadsCount' },
  { label: '流量数', value: 'traffic' },
];

const leadPostOperatorOptions: { label: string; value: LeadPostOperator }[] = [
  { label: '>', value: 'gt' },
  { label: '≥', value: 'gte' },
  { label: '=', value: 'eq' },
  { label: '≤', value: 'lte' },
  { label: '<', value: 'lt' },
];

function formatDate(value?: string): string {
  if (!value) return '-';
  return value.slice(0, 10);
}

/**
 * 主管作品看板 - 时间筛选 (OP-21)。
 * 把 today/week/month/all 翻译成 (from, to)；custom 由 customRange 决定。
 */
function resolvePeriodRange(
  period: PeriodKey,
  customRange: [string, string] | null,
): { from?: string; to?: string } {
  const today = dayjs().format('YYYY-MM-DD');
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      const weekStart = dayjs().startOf('week').format('YYYY-MM-DD');
      return { from: weekStart, to: today };
    }
    case 'month': {
      const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
      return { from: monthStart, to: today };
    }
    case 'custom':
      return { from: customRange?.[0], to: customRange?.[1] };
    case 'all':
    default:
      return { from: undefined, to: undefined };
  }
}

function getPeriodLabel(period: PeriodKey): string {
  if (period === 'today') return '今日';
  if (period === 'week') return '本周';
  if (period === 'month') return '本月';
  if (period === 'custom') return '自定义';
  return '累计';
}

function buildPeriodDateRangeValue(filters: Filters) {
  const { from, to } = resolvePeriodRange(filters.period, filters.customRange);
  return from && to ? { start: dayjs(from), end: dayjs(to) } : null;
}

function isLongPostTitle(title?: string): boolean {
  return Array.from(title || '').length > 12;
}

type Post = {
  id: string;
  platform: string;
  title: string;
  copywriting?: string;
  accountId?: string;
  accountName?: string;
  employeeId?: string;
  employeeName?: string;
  postType?: string;
  postUrl?: string;
  coverImageUrl?: string;
  coverThumbUrl?: string;
  publishedAt?: string;
  metricsUpdatedAt?: string;
  note?: string;
  supervisorSuggestion?: string;
  isSupervisorPicked?: number;
  supervisorQualityStatus?: PostQualityStatus;
  metrics: {
    traffic: number;
    likes: number;
    comments: number;
    favorites: number;
    shares: number;
    leadsCount: number;
  };
};

type Employee = { id: string; name: string };
type Account = { id: string; name?: string; accountName?: string; employeeId?: string; platform?: string };

function getAccountName(account: Account): string {
  const name = String(account.accountName ?? account.name ?? '').trim();
  return name || '未命名账号';
}

type SortField =
  | 'publishedAt'
  | 'traffic'
  | 'leadsCount'
  | 'likes'
  | 'comments'
  | 'favorites'
  | 'shares';

type SortState = { field: SortField; order: 'ascend' | 'descend' };

export default function AdminPostsPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState>({ field: 'leadsCount', order: 'descend' });
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState('');
  // A-② 修复（2026-06-23）：主管端帖子详情需要显示客户联系方式、销售分配、成交信息（不再脱敏）。
  // 客资明细沿用 leadRecords（保留 platform/createdAt 字段），并扩展 contactInfo / wechat / salesUserName。
  // 成交明细新增 orderRecords，调同一 sensitive-info 接口。
  type AdminLeadRecord = {
    id: string;
    customerName: string;
    platform?: string;
    createdAt?: string;
    contactInfo: string | null;
    wechat: string | null;
    status: string;
    salesUserName: string | null;
    intentionLevel: string | null;
    invalidReason: string | null;
    addStatus: string | null;
  };
  type AdminOrderRecord = {
    id: string;
    orderCode: string | null;
    customerName: string | null;
    amount: string | null;
    paidStatus: string;
    orderStatus: string;
    paymentStage: string | null;
    createdAt: string;
  };
  const [leadRecords, setLeadRecords] = useState<AdminLeadRecord[]>([]);
  const [leadRecordsLoading, setLeadRecordsLoading] = useState(false);
  const [orderRecords, setOrderRecords] = useState<AdminOrderRecord[]>([]);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportCountdown, setExportCountdown] = useState(5);
  const [pickPendingId, setPickPendingId] = useState<string | null>(null);
  const [qualityPendingId, setQualityPendingId] = useState<string | null>(null);

  // 导出确认弹窗倒计时
  useEffect(() => {
    if (!exportConfirmOpen) {
      setExportCountdown(5);
      return;
    }
    if (exportCountdown <= 0) return;
    const timer = setTimeout(() => {
      setExportCountdown((c) => c - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [exportConfirmOpen, exportCountdown]);

  async function loadEmployees() {
    try {
      const payload = await apiClient.get<any>('/employees', { query: { limit: 200, offset: 0 } });
      const data = payload?.items ?? payload ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    }
  }

  async function loadAccounts() {
    try {
      const payload = await apiClient.get<any>('/accounts', { query: { limit: 200, offset: 0 } });
      const data = payload?.items ?? payload ?? [];
      // 后端返回字段是 accountName（不是 name），映射到 name 供下拉/列展示使用
      const normalized = (Array.isArray(data) ? data : []).map((a: any) => ({
        ...a,
        name: a.accountName ?? a.name ?? a.id,
      }));
      setAccounts(normalized);
    } catch {
      setAccounts([]);
    }
  }

  function buildQuery(override: { page?: number; pageSize?: number } = {}) {
    const { page: p = page, pageSize: ps = pageSize } = override;
    const query: Record<string, string | number> = {
      limit: ps,
      offset: (p - 1) * ps,
    };
    const { from, to } = resolvePeriodRange(filters.period, filters.customRange);
    if (from) query.from = from;
    if (to) query.to = to;
    if (filters.platform) query.platform = filters.platform;
    if (filters.employeeId) query.employeeId = filters.employeeId;
    if (filters.accountId) query.accountId = filters.accountId;
    if (filters.postType) query.postType = filters.postType;
    if (filters.keyword) query.search = filters.keyword;
    // T4.1 修复 (2026-06-09): 客资 / 流量阈值直接下推给后端 SQL，
    //   避免之前在已分页的 15 条上做客户端过滤导致命中数几乎为 0。
    if (filters.leadPostThreshold !== null && filters.leadPostThreshold !== undefined) {
      query.metric = filters.leadPostMetric;
      query.metricOperator = filters.leadPostOperator;
      query.metricThreshold = filters.leadPostThreshold;
    }
    // 排序：后端 sort 参数支持 'leads'（按关联 lead 数量降序）和 'traffic'（按流量降序）。
    if (sort.field === 'leadsCount') {
      query.sort = 'leads';
    } else if (sort.field === 'traffic') {
      query.sort = 'traffic';
    }
    return query;
  }

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    try {
      const query = buildQuery({ page: nextPage, pageSize: nextPageSize });
      const payload = await apiClient.get<any>('/posts', { query });
      const data = payload?.items ?? payload ?? [];
      let posts = Array.isArray(data) ? data : [];

      // T4.1 修复 (2026-06-09): 客资 / 流量阈值已下推后端 SQL 过滤；
      //   此处不再做客户端过滤（之前在分页后的 15 条上 filter，几乎命中 0 条）。

      // 映射数据
      let mapped = posts.map((p: any): Post => ({
        id: String(p.id ?? ''),
        platform: p.platform ?? '未知平台',
        title: p.title ?? '未命名作品',
        copywriting: p.copywriting,
        accountId: p.accountId ?? p.account_id,
        accountName: p.accountName ?? p.account_name,
        employeeId: p.employeeId ?? p.employee_id,
        employeeName: p.employeeName ?? p.employee_name,
        postType: p.postType ?? p.post_type,
        postUrl: p.postUrl ?? p.post_url,
        coverImageUrl: p.coverImageUrl ?? p.cover_image_url,
        coverThumbUrl: p.coverThumbUrl ?? p.cover_thumb_url,
        publishedAt: p.publishedAt ?? p.published_at,
        metricsUpdatedAt: p.metricsUpdatedAt ?? p.metrics_updated_at,
        note: p.note,
        supervisorSuggestion: p.supervisorSuggestion ?? p.supervisor_suggestion,
        isSupervisorPicked: Number(p.isSupervisorPicked ?? p.is_supervisor_picked ?? 0),
        supervisorQualityStatus: (p.supervisorQualityStatus ?? p.supervisor_quality_status ?? 'normal') as PostQualityStatus,
        metrics: {
          traffic: normalizePostMetric(p.traffic),
          likes: normalizePostMetric(p.likes),
          comments: normalizePostMetric(p.comments),
          favorites: normalizePostMetric(p.favorites),
          shares: normalizePostMetric(p.shares),
          leadsCount: normalizePostMetric(p.leadsCount ?? p.lead_count ?? p.leads_count),
        },
      }));

      // 客户端兜底排序（仅后端不支持排序的字段）
      const sortKey = sort.field;
      const backendSortFields = new Set(['leadsCount', 'traffic']);
      if (!backendSortFields.has(sortKey)) {
        const dir = sort.order === 'ascend' ? 1 : -1;
        mapped = [...mapped].sort((a, b) => {
          const av = sortKey === 'publishedAt'
            ? new Date(a.publishedAt || 0).getTime()
            : Number(a.metrics[sortKey as keyof Post['metrics']] ?? 0);
          const bv = sortKey === 'publishedAt'
            ? new Date(b.publishedAt || 0).getTime()
            : Number(b.metrics[sortKey as keyof Post['metrics']] ?? 0);
          if (av < bv) return -1 * dir;
          if (av > bv) return 1 * dir;
          return 0;
        });
      }

      setItems(mapped);
      // 分页的 total 使用过滤前的总数，实际显示由前端控制
      setTotal(payload?.total ?? mapped.length);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
    void loadAccounts();
  }, []);

  useEffect(() => {
    void load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.platform,
    filters.employeeId,
    filters.accountId,
    filters.postType,
    filters.leadPostMetric,
    filters.leadPostOperator,
    filters.leadPostThreshold,
    filters.period,
    filters.customRange,
    filters.keyword,
    sort.field,
    sort.order,
  ]);

  /**
   * v1.3 SUP-1: 主管标记 / 取消标记优秀作品。
   * 后端端点已由 Wave 2a 实现（POST /api/posts/:id/pick / DELETE /api/posts/:id/pick）。
   * 前端只做集成：行内 toggle 按钮 + 乐观更新。
   */
  async function togglePick(row: Post) {
    const isPicked = Number(row.isSupervisorPicked || 0) === 1;
    const method = isPicked ? 'DELETE' : 'POST';
    setPickPendingId(row.id);
    try {
      await apiClient.request(`/posts/${encodeURIComponent(row.id)}/pick`, { method });
      setItems((prev) =>
        prev.map((it) => (it.id === row.id ? { ...it, isSupervisorPicked: isPicked ? 0 : 1 } : it)),
      );
      message.success(isPicked ? '已取消优秀标记' : '已标记为优秀作品');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记失败');
    } finally {
      setPickPendingId(null);
    }
  }

  async function updateQuality(row: Post, qualityStatus: PostQualityStatus) {
    const meta = getPostQualityMeta(qualityStatus);
    const ok = qualityStatus === 'unqualified'
      ? window.confirm('确认标记为不合格作品？关联客资成单时，订单金额会按销售填写金额的 50% 入单。')
      : true;
    if (!ok) return;
    setQualityPendingId(row.id);
    try {
      const result = await apiClient.request<any>(`/posts/${encodeURIComponent(row.id)}/quality`, {
        method: 'PATCH',
        body: { qualityStatus },
      });
      setItems((prev) =>
        prev.map((it) => (it.id === row.id
          ? {
              ...it,
              supervisorQualityStatus: result?.supervisorQualityStatus ?? qualityStatus,
              isSupervisorPicked: Number(result?.isSupervisorPicked ?? (qualityStatus === 'excellent' ? 1 : 0)),
            }
          : it)),
      );
      message.success(`已标记为${meta.label}`);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '标记失败');
    } finally {
      setQualityPendingId(null);
    }
  }

  async function openDetail(row: Post) {
    setSelectedPost(row);
    setSuggestionDraft(row.supervisorSuggestion || '');
    setLeadRecords([]);
    setOrderRecords([]);
    setDetailLoading(true);
    try {
      const detail = await apiClient.get<any>(`/posts/${encodeURIComponent(row.id)}`);
      const merged = { ...row, ...detail };
      setSelectedPost(merged);
      setSuggestionDraft(merged.supervisorSuggestion || '');
      // 加载敏感信息（客资 + 成交），仅 supervisor/admin/owner 可访问
      void loadSensitiveInfo(row.id);
    } catch (err) {
      message.warning(err instanceof Error ? err.message : '作品详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  // A-② 修复（2026-06-23）：使用敏感信息接口（GET /posts/:id/sensitive-info），
  // 由后端按角色（supervisor/admin/owner）授权返回明文联系方式/微信/销售分配/成交信息。
  async function loadSensitiveInfo(postId: string) {
    setLeadRecordsLoading(true);
    try {
      const payload = await apiClient.get<any>(`/posts/${encodeURIComponent(postId)}/sensitive-info`);
      const rawLeads: any[] = Array.isArray(payload?.leads) ? payload.leads : [];
      const rawOrders: any[] = Array.isArray(payload?.orders) ? payload.orders : [];
      setLeadRecords(
        rawLeads.map((item) => ({
          id: String(item.id ?? ''),
          customerName: item.customerName ?? item.customer_name ?? item.nickname ?? '未命名客户',
          platform: item.platform,
          createdAt: item.createdAt ?? item.created_at,
          contactInfo: item.contactInfo ?? item.contact_info ?? null,
          wechat: item.wechat ?? null,
          status: item.status ?? '',
          salesUserName: item.salesUserName ?? item.sales_user_name ?? null,
          intentionLevel: item.intentionLevel ?? item.intention_level ?? null,
          invalidReason: item.invalidReason ?? item.invalid_reason ?? null,
          addStatus: item.addStatus ?? item.add_status ?? null,
        })),
      );
      setOrderRecords(
        rawOrders.map((item) => ({
          id: String(item.id ?? ''),
          orderCode: item.orderCode ?? item.order_code ?? null,
          customerName: item.customerName ?? item.customer_name ?? null,
          amount: item.amount != null ? String(item.amount) : null,
          paidStatus: item.paidStatus ?? item.paid_status ?? '',
          orderStatus: item.orderStatus ?? item.order_status ?? '',
          paymentStage: item.paymentStage ?? item.payment_stage ?? null,
          createdAt: item.createdAt ?? item.created_at ?? '',
        })),
      );
    } catch (err) {
      // 403 时是当前角色无权访问 —— 静默清空即可（普通运营/销售不会进入 admin/posts）。
      setLeadRecords([]);
      setOrderRecords([]);
    } finally {
      setLeadRecordsLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const { from, to } = resolvePeriodRange(filters.period, filters.customRange);
      const filter: Record<string, string> = buildPostExportFilter({
        employeeId: filters.employeeId || undefined,
        platform: filters.platform || undefined,
        keyword: filters.keyword || undefined,
      });
      if (filters.accountId) filter.accountId = filters.accountId;
      if (filters.postType) filter.postType = filters.postType;
      if (from) filter.from = from;
      if (to) filter.to = to;
      const result = await createExport({ exportType: 'posts', filter });

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);
        if (exportTask.status === 'completed') {
          hide();
          window.open(downloadExportUrl(result.id), '_blank');
          message.success('导出成功，文件开始下载');
          setExportConfirmOpen(false);
          return;
        } else if (exportTask.status === 'failed') {
          hide();
          message.error('导出失败，请重试');
          return;
        }
        attempts++;
      }
      hide();
      message.warning('导出超时，请到导出中心查看');
      setExportConfirmOpen(false);
    } catch (err) {
      hide();
      message.error(err instanceof Error ? err.message : '作品导出失败');
    } finally {
      setExporting(false);
    }
  }

  function openExportConfirm() {
    setExportConfirmOpen(true);
    setExportCountdown(5);
  }

  async function saveSuggestion() {
    if (!selectedPost) return;
    setSavingSuggestion(true);
    try {
      await apiClient.request(`/posts/${encodeURIComponent(selectedPost.id)}/supervisor-suggestion`, {
        method: 'PUT',
        body: { supervisorSuggestion: suggestionDraft },
      });
      setSelectedPost({ ...selectedPost, supervisorSuggestion: suggestionDraft });
      setItems((current) =>
        current.map((item) =>
          item.id === selectedPost.id ? { ...item, supervisorSuggestion: suggestionDraft } : item,
        ),
      );
      message.success('主管建议已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '主管建议保存失败');
    } finally {
      setSavingSuggestion(false);
    }
  }

  const employeeOptions = [
    { label: '全部员工', value: '' },
    ...employees.map((e) => ({ label: e.name || e.id, value: e.id })),
  ];

  // T4.3 修复 (2026-06-09): 账号下拉按 (account_name + platform) 组合 label，
  //   避免 DB 中同名账号（如 '青松果' 出现 2 次）让主管误以为同一账号被选了两遍。
  //   value 仍是账号 id（账号 id 唯一），搜索 prop 同时搜 label 和 value 让主管可按 ID / 名称快速定位。
  const accountOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of accounts) {
      const key = getAccountName(a);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [
      { label: '全部账号', value: '' },
      ...accounts.map((a) => {
        const name = getAccountName(a);
        const isDuplicate = (counts.get(name) || 0) > 1;
        const label = isDuplicate && a.platform ? `${name}（${platformKeyToDisplay(a.platform) || a.platform}）` : name;
        return { label, value: a.id };
      }),
    ];
  }, [accounts]);

  const employeeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name || e.id);
    return m;
  }, [employees]);

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, getAccountName(a));
    return m;
  }, [accounts]);

  // 列排序 sorter：点击默认降序（从高到低），再次点击切换升序，第三次点击取消排序回到默认
  const sortColumn = (field: SortField) => ({
    key: field,
    sorter: true as const,
    sortOrder: sort.field === field ? sort.order : undefined,
    sortDirections: ['descend', 'ascend', null] as ('descend' | 'ascend' | null)[],
  });

  const columns: ColumnsType<Post> = [
    {
      title: '作品',
      dataIndex: 'title',
      width: 200,
      render: (v: string, r: Post) => (
        <Space size={6} align="start">
          {r.coverThumbUrl || r.coverImageUrl ? (
            <Image
              src={r.coverThumbUrl || r.coverImageUrl}
              alt="封面"
              width={56}
              height={42}
              style={{ objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }}
              preview={{ mask: <EyeOutlined /> }}
            />
          ) : (
            <div style={{ width: 56, height: 42, background: '#f0f0f0', borderRadius: 6, flex: '0 0 auto' }} />
          )}
          <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
            {r.postUrl ? (
              <a href={r.postUrl} target="_blank" rel="noreferrer">
                <Tooltip placement="top" title={isLongPostTitle(v) ? v : undefined}>
                  <Typography.Text strong ellipsis style={{ maxWidth: 120 }}>{v}</Typography.Text>
                </Tooltip>
              </a>
            ) : (
              <Tooltip placement="top" title={isLongPostTitle(v) ? v : undefined}>
                <Typography.Text strong ellipsis style={{ maxWidth: 120 }}>{v}</Typography.Text>
              </Tooltip>
            )}
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 120, fontSize: 12 }}>
              {r.copywriting || '暂无文案'}
            </Typography.Text>
            {(() => {
              const quality = r.supervisorQualityStatus || (Number(r.isSupervisorPicked || 0) === 1 ? 'excellent' : 'normal');
              const meta = getPostQualityMeta(quality);
              return quality !== 'normal' ? <Tag color={meta.color}>{meta.label}</Tag> : null;
            })()}
          </Space>
        </Space>
      ),
    },
    { title: '平台', dataIndex: 'platform', width: 80, render: (v?: string) => platformKeyToDisplay(v) || v || '-' },
    {
      title: '账号',
      dataIndex: 'accountName',
      width: 110,
      render: (v?: string, record?: Post) => record?.accountId ? (
        <Link href={`/admin/accounts?id=${encodeURIComponent(record.accountId)}`}>
          {v || record.accountId}
        </Link>
      ) : (v || '-'),
    },
    { title: '员工', dataIndex: 'employeeName', width: 90, render: (v?: string) => v || '-' },
    { title: '类型', dataIndex: 'postType', width: 80 },
    {
      title: '发布日期',
      dataIndex: 'publishedAt',
      width: 110,
      ...sortColumn('publishedAt'),
      render: (v?: string) => formatDate(v),
    },
    {
      title: '流量',
      dataIndex: ['metrics', 'traffic'],
      width: 80,
      ...sortColumn('traffic'),
    },
    {
      title: '赞',
      dataIndex: ['metrics', 'likes'],
      width: 70,
      ...sortColumn('likes'),
    },
    {
      title: '评',
      dataIndex: ['metrics', 'comments'],
      width: 70,
      ...sortColumn('comments'),
    },
    {
      title: '藏',
      dataIndex: ['metrics', 'favorites'],
      width: 70,
      ...sortColumn('favorites'),
    },
    {
      title: '分享',
      dataIndex: ['metrics', 'shares'],
      width: 70,
      ...sortColumn('shares'),
    },
    {
      title: '客资数',
      dataIndex: ['metrics', 'leadsCount'],
      width: 90,
      ...sortColumn('leadsCount'),
      render: (v: number) => (
        <Tag color={v >= 5 ? 'green' : v >= 3 ? 'orange' : 'default'}>{v}</Tag>
      ),
    },
    {
      title: '建议',
      dataIndex: 'supervisorSuggestion',
      width: 80,
      render: (v?: string) => (v ? <Tag color="blue">已填</Tag> : <Tag>未填</Tag>),
    },
    {
      title: '操作',
      key: 'action',
      width: 170,
      fixed: 'right',
      render: (_: unknown, row: Post) => {
        const isPicked = Number(row.isSupervisorPicked || 0) === 1;
        const isPending = pickPendingId === row.id;
        const quality = row.supervisorQualityStatus || (isPicked ? 'excellent' : 'normal');
        const isUnqualified = quality === 'unqualified';
        const isQualityPending = qualityPendingId === row.id;
        return (
          <Space size={4} wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
              详情
            </Button>
            <Button
              size="small"
              type={isPicked ? 'primary' : 'default'}
              icon={isPicked ? <StarFilled /> : <StarOutlined />}
              loading={isPending}
              onClick={() => void togglePick(row)}
            >
              {isPicked ? '已标记优秀' : '标记优秀作品'}
            </Button>
            <Button
              size="small"
              danger={isUnqualified}
              icon={<StopOutlined />}
              loading={isQualityPending}
              onClick={() => void updateQuality(row, isUnqualified ? 'normal' : 'unqualified')}
            >
              {isUnqualified ? '取消不合格' : '标记不合格'}
            </Button>
          </Space>
        );
      },
    },
  ];

  const handleTableChange: TableProps<Post>['onChange'] = (next: TablePaginationConfig, _filters, sorter) => {
    // 处理列头排序变化
    if (sorter && typeof sorter === 'object' && !Array.isArray(sorter)) {
      const info = sorter as { columnKey?: string; order?: 'ascend' | 'descend' | null };
      if (info.columnKey && (info.order === 'ascend' || info.order === 'descend')) {
        setSort({ field: info.columnKey as SortField, order: info.order });
      } else if (info.columnKey && !info.order) {
        setSort({ field: 'publishedAt', order: 'descend' });
      }
    }
    void load(next.current ?? 1, next.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 页面标题 */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管作品看板</Typography.Title>
          <Typography.Paragraph type="secondary">查看全量作品数据，分析获客效果。</Typography.Paragraph>
        </div>
        <Space wrap>
          {/* T7.1 (2026-06-09): 主管端"推荐作品"录入入口。链接可分享给他人，未登录也能点开。 */}
          <Link href="/admin/posts/recommend" target="_blank">
            <Button icon={<PlusOutlined />} type="primary" ghost>
              推荐作品
            </Button>
          </Link>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={openExportConfirm}>
            导出
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => void load(1, pageSize)}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <Card size="small">
        <Space size={8} wrap align="center">
          <Input.Search
            allowClear
            placeholder="搜索标题/文案"
            style={{ width: 180 }}
            value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            onSearch={(v) => setFilters((prev) => ({ ...prev, keyword: v }))}
          />
          <Select
            value={filters.platform}
            options={platformOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, platform: value }))}
            style={{ width: 120 }}
            placeholder="平台"
          />
          <Select
            value={filters.employeeId}
            options={employeeOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, employeeId: value }))}
            style={{ width: 140 }}
            placeholder="员工"
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={filters.accountId}
            options={accountOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, accountId: value }))}
            style={{ width: 160 }}
            placeholder="账号"
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={filters.postType}
            options={postTypeOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, postType: value }))}
            style={{ width: 120 }}
            placeholder="作品类型"
          />
          <Space size={8} wrap>
            <Radio.Group
              value={filters.leadPostMetric}
              onChange={(e) => {
                const metric = e.target.value as LeadPostMetric;
                setFilters((prev) => ({ ...prev, leadPostMetric: metric }));
                // 联动排序：选中"客资数"时按客资数降序，选中"流量数"时按流量降序
                if (metric === 'leadsCount') {
                  setSort({ field: 'leadsCount', order: 'descend' });
                } else if (metric === 'traffic') {
                  setSort({ field: 'traffic', order: 'descend' });
                }
              }}
              optionType="button"
              size="small"
              options={leadPostMetricOptions}
            />
            <Radio.Group
              value={filters.leadPostOperator}
              onChange={(e) => setFilters((prev) => ({ ...prev, leadPostOperator: e.target.value }))}
              optionType="button"
              size="small"
              options={leadPostOperatorOptions}
            />
            <InputNumber
              value={filters.leadPostThreshold ?? undefined}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, leadPostThreshold: value === null ? null : Number(value) }))
              }
              placeholder="数量"
              min={0}
              size="small"
              style={{ width: 100 }}
            />
          </Space>
          <QuickRangePicker
            value={buildPeriodDateRangeValue(filters)}
            onChange={(range) => {
              if (!range) {
                setFilters((prev) => ({ ...prev, period: 'today', customRange: null }));
                return;
              }
              setFilters((prev) => ({
                ...prev,
                period: 'custom',
                customRange: [range.start.format('YYYY-MM-DD'), range.end.format('YYYY-MM-DD')],
              }));
            }}
            presets={RANGE_PRESETS_FULL}
            variant="select"
            selectWidth={120}
            selectPlaceholder="快捷时间"
          />
        </Space>
      </Card>

      {/* 主表格 */}
      <Card>
        <Table<Post>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 1600 }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          pageSizeOptions={PAGE_SIZE_OPTIONS.map(String)}
          showSizeChanger
          showQuickJumper
          onChange={(p, ps) => void load(p, ps)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={selectedPost?.title || '作品详情'}
        open={Boolean(selectedPost)}
        onCancel={() => setSelectedPost(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedPost(null)}>
            关闭
          </Button>,
          <Button key="save" type="primary" loading={savingSuggestion} onClick={saveSuggestion}>
            保存建议
          </Button>,
        ]}
        width={800}
      >
        <Spin spinning={detailLoading}>
          {selectedPost && (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {/* 基本信息 */}
              <Space size={16} wrap>
                <Typography.Text type="secondary">
                  员工：{selectedPost.employeeName || selectedPost.employeeId || '-'}
                </Typography.Text>
                <Typography.Text type="secondary">
                  账号：{selectedPost.accountName || selectedPost.accountId || '-'}
                </Typography.Text>
                <Typography.Text type="secondary">平台：{platformKeyToDisplay(selectedPost.platform) || selectedPost.platform || '-'}</Typography.Text>
                <Typography.Text type="secondary">类型：{selectedPost.postType || '-'}</Typography.Text>
              </Space>

              {/* 作品链接 */}
              {selectedPost.postUrl ? (
                <div>
                  <Typography.Text type="secondary">作品链接：</Typography.Text>
                  <Typography.Link
                    href={selectedPost.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    copyable
                  >
                    {selectedPost.postUrl}
                  </Typography.Link>
                </div>
              ) : (
                <Typography.Text type="secondary">作品链接：-</Typography.Text>
              )}

              {/* 完整文案 */}
              <Card size="small">
                <Typography.Text strong>完整文案</Typography.Text>
                <Typography.Paragraph
                  style={{ whiteSpace: 'pre-wrap', marginTop: 8, marginBottom: 0, maxHeight: 200, overflow: 'auto' }}
                >
                  {getPostDetailDisplay({
                    id: selectedPost.id,
                    title: selectedPost.title,
                    copywriting: selectedPost.copywriting,
                    coverImageUrl: selectedPost.coverImageUrl,
                    coverThumbUrl: selectedPost.coverThumbUrl,
                    traffic: selectedPost.metrics?.traffic,
                    likes: selectedPost.metrics?.likes,
                    comments: selectedPost.metrics?.comments,
                    favorites: selectedPost.metrics?.favorites,
                    supervisorSuggestion: selectedPost.supervisorSuggestion,
                  }).copywriting}
                </Typography.Paragraph>
              </Card>

              {/* 互动指标 */}
              <Space size={12} wrap>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic title="流量" value={selectedPost.metrics?.traffic ?? 0} />
                </Card>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic title="点赞" value={selectedPost.metrics?.likes ?? 0} />
                </Card>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic title="评论" value={selectedPost.metrics?.comments ?? 0} />
                </Card>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic title="收藏" value={selectedPost.metrics?.favorites ?? 0} />
                </Card>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic title="分享" value={selectedPost.metrics?.shares ?? 0} />
                </Card>
                <Card size="small" style={{ width: 100 }}>
                  <Statistic
                    title="客资数"
                    value={selectedPost.metrics?.leadsCount ?? 0}
                    valueStyle={{ color: (selectedPost.metrics?.leadsCount ?? 0) >= 5 ? '#52c41a' : undefined }}
                  />
                </Card>
              </Space>

              {/* 封面/截图 */}
              <Card size="small">
                <Typography.Text strong>封面/截图</Typography.Text>
                <div style={{ marginTop: 8 }}>
                  {selectedPost.coverImageUrl || selectedPost.coverThumbUrl ? (
                    <Image
                      src={selectedPost.coverImageUrl || selectedPost.coverThumbUrl}
                      alt="封面"
                      style={{ maxHeight: 300, objectFit: 'contain' }}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无截图" />
                  )}
                </div>
              </Card>

              {/* 来源客资列表（含联系方式、微信、销售分配、意向 —— 主管端不脱敏，A-②） */}
              <Card size="small">
                <Typography.Text strong>来源客资 ({leadRecords.length})</Typography.Text>
                <Spin spinning={leadRecordsLoading}>
                  {leadRecords.length > 0 ? (
                    <div style={{ marginTop: 8 }}>
                      {leadRecords.map((lead, index) => {
                        const intentionMeta = INTENTION_LEVEL_META[(lead.intentionLevel as IntentionLevelCode) ?? 'pending'] ?? { label: lead.intentionLevel || '待判断', color: 'default' };
                        return (
                          <div
                            key={lead.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              padding: '12px 0',
                              borderBottom: index < leadRecords.length - 1 ? '1px solid #f0f0f0' : undefined,
                            }}
                          >
                            {/* 左侧：客资详情 */}
                            <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                              <Typography.Text strong>{lead.customerName || '未命名客户'}</Typography.Text>
                              <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12, marginTop: 4 }}>
                                <span>联系方式：{lead.contactInfo || '-'}</span>
                                <span style={{ margin: '0 8px' }}>|</span>
                                <span>微信：{lead.wechat || '-'}</span>
                              </div>
                              <div style={{ color: 'rgba(0, 0, 0, 0.45)', fontSize: 12, marginTop: 4 }}>
                                <span>销售：{lead.salesUserName || '-'}</span>
                                <span style={{ margin: '0 8px' }}>|</span>
                                <span>平台：{platformKeyToDisplay(lead.platform) || lead.platform || '-'}</span>
                                <span style={{ margin: '0 8px' }}>|</span>
                                <span>{formatDate(lead.createdAt)}</span>
                              </div>
                            </div>

                            {/* 右侧：客资意向 & 状态 */}
                            <div style={{ width: 180, flexShrink: 0, textAlign: 'right' }}>
                              <div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>意向：</Typography.Text>
                                <Tag color={intentionMeta.color}>{intentionMeta.label}</Tag>
                              </div>
                              <div style={{ marginTop: 4 }}>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>状态：</Typography.Text>
                                <Tag>{getStatusLabel(lead.status as any) || lead.status || '-'}</Tag>
                              </div>
                              {lead.intentionLevel === 'invalid' && lead.invalidReason ? (
                                <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>
                                  无效原因：{lead.invalidReason}
                                </div>
                              ) : null}
                              {lead.addStatus === 'not_added' ? (
                                <div style={{ marginTop: 4 }}>
                                  <Tag color="error">未添加</Tag>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源客资" />
                  )}
                </Spin>
              </Card>

              {/* 成交信息（A-②：主管端可见） */}
              <Card size="small">
                <Typography.Text strong>成交信息 ({orderRecords.length})</Typography.Text>
                <Spin spinning={leadRecordsLoading}>
                  {orderRecords.length > 0 ? (
                    <Table
                      size="small"
                      dataSource={orderRecords}
                      rowKey="id"
                      pagination={{ pageSize: 5 }}
                      columns={[
                        { title: '订单编号', dataIndex: 'id', width: 160, render: (_: string, record: AdminOrderRecord) => record.orderCode || record.id },
                        { title: '客户', dataIndex: 'customerName', width: 110, render: (v) => v || '-' },
                        { title: '金额', dataIndex: 'amount', width: 100, align: 'right', render: (v) => v ?? '-' },
                        {
                          title: '付款状态',
                          dataIndex: 'paidStatus',
                          width: 90,
                          render: (v: string) => {
                            const meta = paidStatusMeta(v);
                            return <Tag color={meta.color}>{meta.label}</Tag>;
                          },
                        },
                        {
                          title: '订单状态',
                          dataIndex: 'orderStatus',
                          width: 100,
                          render: (v: string) => {
                            const meta = orderStatusMeta(v);
                            return <Tag color={meta.color}>{meta.label}</Tag>;
                          },
                        },
                        { title: '付款阶段', dataIndex: 'paymentStage', width: 100, render: (v) => v || '-' },
                        { title: '创建时间', dataIndex: 'createdAt', width: 110, render: formatDate },
                      ]}
                      style={{ marginTop: 8 }}
                      scroll={{ x: 'max-content' }}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无成交信息" />
                  )}
                </Spin>
              </Card>

              {/* 主管建议 */}
              <Card size="small">
                <Typography.Text strong>主管建议</Typography.Text>
                <Input.TextArea
                  rows={4}
                  value={suggestionDraft}
                  onChange={(e) => setSuggestionDraft(e.target.value)}
                  placeholder="填写主管建议，记录对作品的评估和优化方向"
                  style={{ marginTop: 8 }}
                />
              </Card>
            </Space>
          )}
        </Spin>
      </Modal>

      {/* 导出确认弹窗 */}
      <Modal
        title="确认导出作品"
        open={exportConfirmOpen}
        onCancel={() => setExportConfirmOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportConfirmOpen(false)} disabled={exporting}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={exporting}
            disabled={exportCountdown > 0}
            onClick={() => void handleExport()}
          >
            {exportCountdown > 0 ? `${exportCountdown} 秒后可导出` : '确认导出'}
          </Button>,
        ]}
        width={500}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text>确认导出当前筛选条件下的作品数据？</Typography.Text>

          {/* 当前筛选条件 */}
          <Card size="small">
            <Typography.Text strong>当前筛选条件</Typography.Text>
            <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
              {[
                filters.keyword ? { label: '关键词', value: filters.keyword } : null,
                filters.platform
                  ? { label: '平台', value: filters.platform }
                  : null,
                filters.employeeId
                  ? { label: '员工', value: employeeMap.get(filters.employeeId) || filters.employeeId }
                  : null,
                filters.accountId
                  ? { label: '账号', value: accountMap.get(filters.accountId) || filters.accountId }
                  : null,
                filters.postType ? { label: '作品类型', value: filters.postType } : null,
                filters.leadPostThreshold !== null && filters.leadPostThreshold !== undefined
                  ? {
                      label: '指标筛选',
                      value: `${filters.leadPostMetric === 'leadsCount' ? '客资数' : '流量数'} ${
                        { gt: '>', gte: '≥', eq: '=', lte: '≤', lt: '<' }[filters.leadPostOperator]
                      } ${filters.leadPostThreshold}`,
                    }
                  : null,
                (() => {
                  const { from, to } = resolvePeriodRange(filters.period, filters.customRange);
                  if (from || to) {
                    const periodLabel = getPeriodLabel(filters.period);
                    return { label: '时间范围', value: `${periodLabel} (${from || '-'} 至 ${to || '-'})` };
                  }
                  return null;
                })(),
              ]
                .filter((item): item is { label: string; value: string } => item !== null)
                .map((item) => (
                  <Space key={item.label}>
                    <Typography.Text type="secondary">{item.label}:</Typography.Text>
                    <Typography.Text>{item.value}</Typography.Text>
                  </Space>
                ))}
              {![
                filters.keyword,
                filters.platform,
                filters.employeeId,
                filters.accountId,
                filters.postType,
                filters.period !== 'all' ? filters.period : '',
              ].filter(Boolean).length && (
                <Typography.Text type="secondary">无筛选条件（将导出全部作品）</Typography.Text>
              )}
            </Space>
          </Card>

          <Typography.Text type="secondary">
            导出任务创建后可到「导出中心」下载文件。
          </Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
