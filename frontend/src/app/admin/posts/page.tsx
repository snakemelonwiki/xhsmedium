'use client';

import {
  DownloadOutlined,
  EyeOutlined,
  LinkOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  DatePicker,
  Empty,
  Image,
  Input,
  Modal,
  Pagination,
  Segmented,
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
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { buildPostExportFilter, getPostDetailDisplay } from './postDetail';

const { RangePicker } = DatePicker;
const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

type PeriodKey = 'today' | 'week' | 'month' | 'all' | 'custom';

type Filters = {
  period: PeriodKey;
  customRange: [string, string] | null;
  platform: string;
  employeeId: string;
  accountId: string;
  postType: string;
  isLeadPost: string;
  keyword: string;
};

const EMPTY_FILTERS: Filters = {
  period: 'all',
  customRange: null,
  platform: '',
  employeeId: '',
  accountId: '',
  postType: '',
  isLeadPost: '',
  keyword: '',
};

const PERIOD_OPTIONS: { label: string; value: PeriodKey }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '累计', value: 'all' },
  { label: '自定义', value: 'custom' },
];

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
];

const postTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '种草', value: '种草' },
  { label: '测评', value: '测评' },
  { label: '干货', value: '干货' },
  { label: '日常', value: '日常' },
];

const isLeadPostOptions = [
  { label: '全部', value: '' },
  { label: '获客贴(≥5)', value: 'yes' },
  { label: '普通贴(<5)', value: 'no' },
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
type Account = { id: string; name: string; employeeId?: string };

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
  const [sort, setSort] = useState<SortState>({ field: 'publishedAt', order: 'descend' });
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [leadRecords, setLeadRecords] = useState<Array<{ id: string; customerName: string; platform?: string; createdAt?: string }>>([]);
  const [leadRecordsLoading, setLeadRecordsLoading] = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [exportCountdown, setExportCountdown] = useState(5);
  const [pickPendingId, setPickPendingId] = useState<string | null>(null);
  const [customRangeValue, setCustomRangeValue] = useState<[Dayjs, Dayjs] | null>(null);

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
      setAccounts(Array.isArray(data) ? data : []);
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
    // 排序：后端 sort 参数支持 'leads'（按关联 lead 数量降序）；
    // 其它字段（traffic / published_at）由后端默认行为处理，前端在拿到数据后兜底做客户端排序。
    if (sort.field === 'leadsCount') {
      query.sort = 'leads';
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

      // 前端筛选获客贴
      if (filters.isLeadPost === 'yes') {
        posts = posts.filter((p: any) => (p.leadsCount ?? p.leadCount ?? 0) >= 5);
      } else if (filters.isLeadPost === 'no') {
        posts = posts.filter((p: any) => (p.leadsCount ?? p.leadCount ?? 0) < 5);
      }

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
        metrics: {
          traffic: Number(p.traffic ?? 0),
          likes: Number(p.likes ?? 0),
          comments: Number(p.comments ?? 0),
          favorites: Number(p.favorites ?? 0),
          shares: Number(p.shares ?? 0),
          leadsCount: Number(p.leadsCount ?? p.lead_count ?? p.leads_count ?? 0),
        },
      }));

      // 客户端兜底排序（除 leads 走后端 sort=leads 外）
      if (sort.field !== 'leadsCount') {
        const sortKey = sort.field;
        const dir = sort.order === 'ascend' ? 1 : -1;
        mapped = [...mapped].sort((a, b) => {
          const av = sortKey === 'publishedAt'
            ? String(a.publishedAt || '')
            : Number(a.metrics[sortKey as keyof Post['metrics']] ?? 0);
          const bv = sortKey === 'publishedAt'
            ? String(b.publishedAt || '')
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
    filters.isLeadPost,
    filters.period,
    filters.customRange,
    filters.keyword,
    sort.field,
    sort.order,
  ]);

  function handlePeriodChange(value: PeriodKey | string) {
    const v = value as PeriodKey;
    if (v === 'custom') {
      // 切到自定义时，如果还没有值，默认给一个最近 30 天的范围
      if (!customRangeValue) {
        const today = dayjs();
        const start = today.subtract(29, 'day');
        setCustomRangeValue([start, today]);
        setFilters((prev) => ({ ...prev, period: v, customRange: [start.format('YYYY-MM-DD'), today.format('YYYY-MM-DD')] }));
      } else {
        setFilters((prev) => ({
          ...prev,
          period: v,
          customRange: [customRangeValue[0].format('YYYY-MM-DD'), customRangeValue[1].format('YYYY-MM-DD')],
        }));
      }
    } else {
      setFilters((prev) => ({ ...prev, period: v, customRange: null }));
    }
  }

  function handleCustomRangeChange(values: [Dayjs | null, Dayjs | null] | null) {
    if (!values || !values[0] || !values[1]) {
      setCustomRangeValue(null);
      setFilters((prev) => ({ ...prev, customRange: null }));
      return;
    }
    setCustomRangeValue([values[0]!, values[1]!]);
    setFilters((prev) => ({
      ...prev,
      period: 'custom',
      customRange: [values[0]!.format('YYYY-MM-DD'), values[1]!.format('YYYY-MM-DD')],
    }));
  }

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

  async function openDetail(row: Post) {
    setSelectedPost(row);
    setSuggestionDraft(row.supervisorSuggestion || '');
    setLeadRecords([]);
    setDetailLoading(true);
    try {
      const detail = await apiClient.get<any>(`/posts/${encodeURIComponent(row.id)}`);
      const merged = { ...row, ...detail };
      setSelectedPost(merged);
      setSuggestionDraft(merged.supervisorSuggestion || '');
      // 加载来源客资列表
      void loadLeadRecords(row.id);
    } catch (err) {
      message.warning(err instanceof Error ? err.message : '作品详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadLeadRecords(postId: string) {
    setLeadRecordsLoading(true);
    try {
      // 从 leads 列表中筛选来源为该作品
      const payload = await apiClient.get<any>('/leads', {
        query: { scope: 'all', postId, limit: 50, offset: 0 },
      });
      const data = payload?.items ?? payload ?? [];
      setLeadRecords(
        Array.isArray(data)
          ? data.map((item: any) => ({
              id: String(item.id ?? ''),
              customerName: item.customerName ?? item.nickname ?? item.contactInfo ?? '未命名客户',
              platform: item.platform,
              createdAt: item.createdAt,
            }))
          : [],
      );
    } catch {
      setLeadRecords([]);
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
      if (filters.isLeadPost) filter.isLeadPost = filters.isLeadPost;
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

  const accountOptions = [
    { label: '全部账号', value: '' },
    ...accounts.map((a) => ({ label: a.name, value: a.id })),
  ];

  const employeeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, e.name || e.id);
    return m;
  }, [employees]);

  const accountMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  // 列排序 sorter：点击切换升降序，二次点击反向
  const sortColumn = (field: SortField) => ({
    sorter: true,
    sortOrder: sort.field === field ? sort.order : undefined,
    onHeaderCell: () => ({
      onClick: () => {
        setSort((prev) => {
          if (prev.field !== field) return { field, order: 'descend' };
          if (prev.order === 'descend') return { field, order: 'ascend' };
          return { field, order: 'descend' };
        });
      },
    }),
  });

  const columns: ColumnsType<Post> = [
    {
      title: '封面',
      dataIndex: 'coverThumbUrl',
      width: 70,
      render: (url?: string) =>
        url ? (
          <Image
            src={url}
            alt="封面"
            width={50}
            height={50}
            style={{ objectFit: 'cover', borderRadius: 4 }}
            preview={{ mask: <EyeOutlined /> }}
          />
        ) : (
          <div style={{ width: 50, height: 50, background: '#f0f0f0', borderRadius: 4 }} />
        ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      width: 200,
      render: (v: string, r: Post) =>
        r.postUrl ? (
          <a href={r.postUrl} target="_blank" rel="noreferrer">
            {v}
          </a>
        ) : (
          v
        ),
    },
    { title: '平台', dataIndex: 'platform', width: 80 },
    { title: '账号', dataIndex: 'accountName', width: 100, render: (v?: string) => v || '-' },
    { title: '员工', dataIndex: 'employeeName', width: 90, render: (v?: string) => v || '-' },
    { title: '类型', dataIndex: 'postType', width: 80 },
    {
      title: '发布日期',
      dataIndex: 'publishedAt',
      width: 110,
      ...sortColumn('publishedAt'),
      render: (v?: string, r?: Post) => {
        if (!r) return formatDate(v);
        const isPicked = Number(r.isSupervisorPicked || 0) === 1;
        return (
          <Space size={4}>
            {isPicked ? (
              <Tooltip title="已被主管标记为优秀作品">
                <StarFilled style={{ color: '#faad14' }} />
              </Tooltip>
            ) : null}
            <span>{formatDate(v)}</span>
          </Space>
        );
      },
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
      width: 220,
      fixed: 'right',
      render: (_: unknown, row: Post) => {
        const isPicked = Number(row.isSupervisorPicked || 0) === 1;
        const isPending = pickPendingId === row.id;
        return (
          <Space size={4}>
            <Button
              size="small"
              type={isPicked ? 'primary' : 'default'}
              icon={isPicked ? <StarFilled /> : <StarOutlined />}
              loading={isPending}
              onClick={() => void togglePick(row)}
            >
              {isPicked ? '已标记优秀' : '标记优秀作品'}
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
              详情
            </Button>
          </Space>
        );
      },
    },
  ];

  const handleTableChange: TableProps<Post>['onChange'] = (next: TablePaginationConfig) => {
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

      {/* 时间筛选（OP-21）：今日 / 本周 / 本月 / 累计 / 自定义 */}
      <Card size="small">
        <Space size={12} wrap align="center">
          <Segmented
            value={filters.period}
            onChange={handlePeriodChange}
            options={PERIOD_OPTIONS}
          />
          {filters.period === 'custom' ? (
            <RangePicker
              value={customRangeValue}
              onChange={handleCustomRangeChange}
              allowClear={false}
            />
          ) : null}
        </Space>
      </Card>

      {/* 筛选栏 */}
      <Card size="small">
        <Space size={12} wrap>
          <Input.Search
            allowClear
            placeholder="搜索标题/文案"
            style={{ width: 200 }}
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
            value={filters.isLeadPost}
            options={isLeadPostOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, isLeadPost: value }))}
            style={{ width: 140 }}
            placeholder="获客贴"
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
                <Typography.Text type="secondary">平台：{selectedPost.platform || '-'}</Typography.Text>
                <Typography.Text type="secondary">类型：{selectedPost.postType || '-'}</Typography.Text>
                {selectedPost.postUrl && (
                  <a href={selectedPost.postUrl} target="_blank" rel="noreferrer">
                    <Button size="small" icon={<LinkOutlined />}>
                      打开原帖
                    </Button>
                  </a>
                )}
              </Space>

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

              {/* 来源客资列表 */}
              <Card size="small">
                <Typography.Text strong>来源客资 ({leadRecords.length})</Typography.Text>
                <Spin spinning={leadRecordsLoading}>
                  {leadRecords.length > 0 ? (
                    <Table
                      size="small"
                      dataSource={leadRecords}
                      rowKey="id"
                      pagination={{ pageSize: 5 }}
                      columns={[
                        { title: '客户', dataIndex: 'customerName', render: (v) => v || '未命名' },
                        { title: '平台', dataIndex: 'platform' },
                        { title: '时间', dataIndex: 'createdAt', render: formatDate },
                      ]}
                      style={{ marginTop: 8 }}
                    />
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无来源客资" />
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
                  ? { label: '平台', value: filters.platform === 'xiaohongshu' ? '小红书' : filters.platform === 'douyin' ? '抖音' : filters.platform }
                  : null,
                filters.employeeId
                  ? { label: '员工', value: employeeMap.get(filters.employeeId) || filters.employeeId }
                  : null,
                filters.accountId
                  ? { label: '账号', value: accountMap.get(filters.accountId) || filters.accountId }
                  : null,
                filters.postType ? { label: '作品类型', value: filters.postType } : null,
                filters.isLeadPost
                  ? { label: '获客贴', value: filters.isLeadPost === 'yes' ? '获客贴(≥5)' : '普通贴(<5)' }
                  : null,
                (() => {
                  const { from, to } = resolvePeriodRange(filters.period, filters.customRange);
                  if (from || to) {
                    const periodLabel = PERIOD_OPTIONS.find((p) => p.value === filters.period)?.label || '自定义';
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
                filters.isLeadPost,
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
