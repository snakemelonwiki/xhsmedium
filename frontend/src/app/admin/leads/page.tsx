'use client';

import { DownloadOutlined, FilterOutlined, ReloadOutlined, SwapOutlined, HistoryOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { getAdminLeadsStats, listAdminEmployees, listAdminLeads } from '@/shared/api/admin';
import { listSourceAccounts, listSourcePosts, listAssignableSalesUsers, type CatalogOption } from '@/shared/api/catalog';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { QuickRangePicker, RANGE_PRESETS_FULL } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { PostTitleCell } from '@/shared/components/dashboard/PlatformAnalysisPanel';
import { getStatusMeta } from '@/shared/constants/status';
import type { AdminEmployee } from '@/shared/types/admin';
import type { AdminLeadsStats } from '@/shared/api/admin';
import type { LeadTimelineItem } from '@/shared/types/leads';

import { buildLeadReassignPayload } from './leadActions';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const DEFAULT_PAGE_SIZE = 20;

// --- debounce hook (手写，无 lodash 依赖) ---
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

type Filters = {
  platform: string;
  operatorId: string;
  salesId: string;
  accountId: string;
  postId: string;
  processStatus: string;
  addStatus: string;
  dealStatus: string;
  startDate: string;
  endDate: string;
};

const EMPTY_FILTERS: Filters = {
  platform: '',
  operatorId: '',
  salesId: '',
  accountId: '',
  postId: '',
  processStatus: '',
  addStatus: '',
  dealStatus: '',
  startDate: '',
  endDate: '',
};

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
  { label: '其他', value: 'other' },
];

const processStatusOptions = [
  { label: '全部处理状态', value: '' },
  { label: '未联系', value: 'not_contacted' },
  { label: '待通过', value: 'waiting_pass' },
  { label: '沟通中', value: 'communicating' },
  { label: '已报价', value: 'quoted' },
  { label: '待成交', value: 'deal_pending' },
  { label: '已成交', value: 'deal_done' },
  { label: '无效', value: 'invalid' },
];

const addStatusOptions = [
  { label: '全部添加状态', value: '' },
  { label: '未添加', value: 'not_added' },
  { label: '已申请添加', value: 'applied' },
  { label: '客户未通过', value: 'not_passed' },
  { label: '运营已提醒', value: 'operation_reminded' },
  { label: '已添加通过', value: 'added' },
];

const dealStatusOptions = [
  { label: '全部成交状态', value: '' },
  { label: '未成交', value: 'not_deal' },
  { label: '已成交', value: 'deal_done' },
];

function formatDayjs(value: Dayjs | null | undefined): string {
  if (!value) return '';
  return value.format('YYYY-MM-DD');
}

function buildDateRangeValue(startDate: string, endDate: string): DateRangeValue {
  if (!startDate || !endDate) return null;
  return { start: dayjs(startDate), end: dayjs(endDate) };
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return value.slice(0, 16).replace('T', ' ');
}

function maskContact(contact?: string): string {
  if (!contact) return '-';
  if (contact.length <= 3) return contact;
  if (/^\d+$/.test(contact)) {
    // 手机号
    return contact.slice(0, 3) + '****' + contact.slice(-4);
  }
  return contact.slice(0, 2) + '***' + contact.slice(-2);
}

type Lead = {
  id: string;
  customerName: string;
  contact?: string;
  platform?: string;
  operatorName?: string;
  salesName?: string;
  status: string;
  addStatus?: string;
  processStatus?: string;
  collaborationStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  latestFollowNote?: string;
  latestFollowAt?: string;
  sourcePostTitle?: string;
  sourceAccountName?: string;
  accountId?: string;
  postId?: string;
  employeeId?: string;
  assignedSalesUserId?: string;
};

export default function AdminLeadsPage() {
  const [items, setItems] = useState<Lead[]>([]);
  const [stats, setStats] = useState<AdminLeadsStats | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedForm] = Form.useForm();

  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [salesUsers, setSalesUsers] = useState<CatalogOption[]>([]);
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [posts, setPosts] = useState<CatalogOption[]>([]);

  const [reassignLead, setReassignLead] = useState<Lead | null>(null);
  const [selectedSalesUserId, setSelectedSalesUserId] = useState<string>();
  const [actionLoading, setActionLoading] = useState(false);

  const [followRecordLead, setFollowRecordLead] = useState<Lead | null>(null);
  const [followRecords, setFollowRecords] = useState<LeadTimelineItem[]>([]);
  const [followRecordsLoading, setFollowRecordsLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  // 合并: 初始加载 employees + sales users (并行，一次性)
  useEffect(() => {
    void Promise.all([
      listAdminEmployees({ page: 1, pageSize: 200, limit: 200 }).then((r) => setEmployees(r.items)).catch(() => setEmployees([])),
      listAssignableSalesUsers().then(setSalesUsers).catch(() => setSalesUsers([])),
    ]);
  }, []);

  // debouncedFilters: 筛选变化时延迟 300ms 再加载，避免频繁触发
  const debouncedFilters = useDebouncedValue(filters, 300);

  // accounts + posts 级联加载（依赖 debouncedFilters，保证稳定）
  useEffect(() => {
    void Promise.all([
      filters.operatorId
        ? listSourceAccounts().then((r) => setAccounts(r.filter((a) => a.employeeId === filters.operatorId))).catch(() => setAccounts([]))
        : listSourceAccounts().then(setAccounts).catch(() => setAccounts([])),
      filters.accountId
        ? listSourcePosts(filters.accountId).then(setPosts).catch(() => setPosts([]))
        : Promise.resolve(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.operatorId, filters.accountId]);

  // 筛选变化 → loadStats + loadLeads (debounced, 300ms)
  useEffect(() => {
    setPage(1);
    void Promise.all([loadStats(), loadLeads(1, pageSize)]);
  }, [debouncedFilters.platform, debouncedFilters.operatorId, debouncedFilters.salesId,
      debouncedFilters.accountId, debouncedFilters.postId, debouncedFilters.processStatus,
      debouncedFilters.addStatus, debouncedFilters.dealStatus,
      debouncedFilters.startDate, debouncedFilters.endDate]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      const result = await getAdminLeadsStats(buildStatsQuery());
      setStats(result);
    } catch {
      // 统计失败不影响主流程
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadLeads(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError('');
    try {
      const result = await listAdminLeads({
        page: nextPage,
        pageSize: nextPageSize,
        ...buildListQuery(),
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '客资列表加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  function buildStatsQuery() {
    const q: Record<string, string> = {};
    if (filters.platform) q.platform = filters.platform;
    if (filters.operatorId) q.employeeId = filters.operatorId;
    if (filters.salesId) q.assignedSalesUserId = filters.salesId;
    if (filters.accountId) q.accountId = filters.accountId;
    if (filters.postId) q.postId = filters.postId;
    if (filters.processStatus) q.processStatus = filters.processStatus;
    if (filters.addStatus) q.addStatus = filters.addStatus;
    if (filters.dealStatus) q.dealStatus = filters.dealStatus;
    if (filters.startDate) q.from = filters.startDate;
    if (filters.endDate) q.to = filters.endDate;
    return q;
  }

  function buildListQuery() {
    return buildStatsQuery();
  }

  async function handleExport() {
    setExporting(true);
    try {
      // 1) 先用当前筛选条件查 total,无数据直接短路提示
      const statsResult = await getAdminLeadsStats(buildStatsQuery());
      if (!statsResult || statsResult.total === 0) {
        message.warning('当前筛选条件下无数据,无需导出');
        return;
      }
      // 2) 有数据:走 createExport + 轮询 + 自动下载
      const hide = message.loading('正在生成导出文件...', 0);
      try {
        const result = await createExport({ exportType: 'leads', filter: buildStatsQuery() });
        let attempts = 0;
        const maxAttempts = 30;
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const exportTask = await getExport(result.id);
          if (exportTask.status === 'completed') {
            hide();
            window.open(downloadExportUrl(result.id), '_blank');
            message.success('导出成功，文件开始下载');
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
      } catch (err) {
        hide();
        message.error(err instanceof Error ? err.message : '客资导出失败');
      }
    } finally {
      setExporting(false);
    }
  }

  function openAdvanced() {
    advancedForm.setFieldsValue({
      platform: filters.platform || undefined,
      operatorId: filters.operatorId || undefined,
      salesId: filters.salesId || undefined,
      accountId: filters.accountId || undefined,
      postId: filters.postId || undefined,
      processStatus: filters.processStatus || undefined,
      addStatus: filters.addStatus || undefined,
      dealStatus: filters.dealStatus || undefined,
      dateRange: filters.startDate && filters.endDate
        ? [dayjs(filters.startDate), dayjs(filters.endDate)]
        : null,
    });
    setAdvancedOpen(true);
  }

  function applyAdvanced() {
    const values = advancedForm.getFieldsValue() as {
      platform?: string;
      operatorId?: string;
      salesId?: string;
      accountId?: string;
      postId?: string;
      processStatus?: string;
      addStatus?: string;
      dealStatus?: string;
      dateRange?: (Dayjs | null)[] | null;
    };
    setFilters((prev) => ({
      ...prev,
      platform: values.platform ?? '',
      operatorId: values.operatorId ?? '',
      salesId: values.salesId ?? '',
      accountId: values.accountId ?? '',
      postId: values.postId ?? '',
      processStatus: values.processStatus ?? '',
      addStatus: values.addStatus ?? '',
      dealStatus: values.dealStatus ?? '',
      startDate: values.dateRange?.[0] ? formatDayjs(values.dateRange[0]) : '',
      endDate: values.dateRange?.[1] ? formatDayjs(values.dateRange[1]) : '',
    }));
    setAdvancedOpen(false);
  }

  function resetAdvanced() {
    advancedForm.resetFields();
    setFilters(EMPTY_FILTERS);
    setAdvancedOpen(false);
  }

  async function loadFollowRecords(leadId: string) {
    setFollowRecordsLoading(true);
    try {
      const payload = await apiClient.get<unknown>(`/leads/${encodeURIComponent(leadId)}/follow-records`, {
        query: { limit: 50, offset: 0, paged: 1 },
      });
      const data = payload as { items?: unknown[]; rows?: unknown[] };
      const items = (data.items ?? data.rows ?? []) as Record<string, unknown>[];
      setFollowRecords(items.map((item) => ({
        id: String(item.id ?? ''),
        kind: 'follow' as const,
        title: '跟进记录',
        content: String(item.content ?? item.note ?? ''),
        actorName: String(item.userName ?? item.salesName ?? item.operatorName ?? ''),
        occurredAt: String(item.createdAt ?? item.updated_at ?? '-'),
        status: String(item.status ?? ''),
      })));
    } catch {
      setFollowRecords([]);
    } finally {
      setFollowRecordsLoading(false);
    }
  }

  function openFollowRecords(lead: Lead) {
    setFollowRecordLead(lead);
    void loadFollowRecords(lead.id);
  }

  function openReassign(lead: Lead) {
    setReassignLead(lead);
    setSelectedSalesUserId(undefined);
  }

  async function confirmReassign() {
    if (!reassignLead || !selectedSalesUserId) {
      message.warning('请选择要改派的销售');
      return;
    }
    const salesUser = salesUsers.find((item) => item.id === selectedSalesUserId);
    if (!salesUser) {
      message.warning('销售候选不存在，请刷新后重试');
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.request(`/leads/${encodeURIComponent(reassignLead.id)}`, {
        method: 'PUT',
        body: buildLeadReassignPayload(salesUser),
      });
      message.success('客资已改派');
      setReassignLead(null);
      void loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资改派失败');
    } finally {
      setActionLoading(false);
    }
  }

  const employeeOptions = useMemo(
    () => [
      { label: '全部运营', value: '' },
      ...employees.map((emp) => ({ label: emp.name, value: emp.id })),
    ],
    [employees],
  );

  const salesOptions = useMemo(
    () => [
      { label: '全部销售', value: '' },
      ...salesUsers.map((s) => ({ label: s.name, value: s.id })),
    ],
    [salesUsers],
  );

  const accountOptions = useMemo(
    () => [
      { label: '全部账号', value: '' },
      ...accounts.map((a) => ({ label: a.name, value: a.id })),
    ],
    [accounts],
  );

  const postOptions = useMemo(
    () => [
      { label: '全部作品', value: '' },
      ...posts.map((p) => ({ label: p.name, value: p.id })),
    ],
    [posts],
  );

  const advancedActiveCount = [
    filters.platform,
    filters.operatorId,
    filters.salesId,
    filters.accountId,
    filters.postId,
    filters.processStatus,
    filters.addStatus,
    filters.dealStatus,
    filters.startDate,
    filters.endDate,
  ].filter(Boolean).length;

  // 8 统计卡数据
  const statsData = useMemo(() => {
    if (!stats) {
      return {
        total: 0,
        newCount: 0,
        assigned: 0,
        pending: 0,
        added: 0,
        collaborating: 0,
        dealDone: 0,
        invalid: 0,
      };
    }
    return {
      total: stats.total,
      newCount: stats.byStatus['new'] ?? 0,
      assigned: stats.assigned,
      pending: stats.byAddStatus['not_added'] ?? 0,
      added: stats.byAddStatus['added'] ?? 0,
      collaborating: stats.byStatus['in_collaboration'] ?? 0,
      dealDone: stats.byProcess['deal_done'] ?? 0,
      invalid: stats.byStatus['invalid'] ?? 0,
    };
  }, [stats]);

  const columns: ColumnsType<Lead> = [
    { title: '客户昵称', dataIndex: 'customerName', width: 120, render: (v: string) => v || '未命名客户' },
    { title: '联系方式', dataIndex: 'contact', width: 130, render: (v?: string) => maskContact(v) },
    { title: '平台', dataIndex: 'platform', width: 80 },
    {
      title: '来源作品',
      dataIndex: 'sourcePostTitle',
      width: 120,
      render: (v?: string, record?: Lead) => (
        <PostTitleCell title={v} postId={record?.postId} maxChars={8} />
      ),
    },
    { title: '来源账号', dataIndex: 'sourceAccountName', width: 100, render: (v?: string) => v || '-' },
    { title: '所属运营', dataIndex: 'operatorName', width: 90, render: (v?: string) => v || '-' },
    { title: '分配销售', dataIndex: 'salesName', width: 90, render: (v?: string) => v || '-' },
    {
      title: '添加状态',
      dataIndex: 'addStatus',
      width: 100,
      render: (v?: string) => {
        if (!v) return '-';
        const meta = getStatusMeta('addStatus', v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '处理状态',
      dataIndex: 'processStatus',
      width: 100,
      render: (v?: string) => {
        if (!v) return '-';
        const meta = getStatusMeta('processStatus', v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '协同状态',
      dataIndex: 'collaborationStatus',
      width: 90,
      render: (v?: string) => {
        if (!v || v === 'none') return '-';
        const meta = getStatusMeta('collaborationStatus', v);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    { title: '最后更新', dataIndex: 'updatedAt', width: 150, render: formatDate },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: unknown, row: Lead) => (
        <Space size={4}>
          <Button size="small" icon={<SwapOutlined />} onClick={() => openReassign(row)}>
            改派
          </Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => openFollowRecords(row)}>
            跟进
          </Button>
        </Space>
      ),
    },
  ];

  const handleTableChange = (next: TablePaginationConfig) => {
    void loadLeads(next.current ?? 1, next.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const tablePagination: TablePaginationConfig = {
    current: page,
    pageSize: pageSize,
    total: total,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (t) => `共 ${t} 条`,
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 页面标题 */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管客资看板</Typography.Title>
          <Typography.Paragraph type="secondary">查看全量客资，筛选分析销售跟进情况。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<FilterOutlined />} onClick={openAdvanced}>
            高级筛选{advancedActiveCount > 0 ? ` (${advancedActiveCount})` : ''}
          </Button>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { void loadStats(); void loadLeads(); }} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 8 统计卡 */}
      <Row gutter={16}>
        <Col span={3}>
          <Card size="small">
            <Statistic title="客资总数" value={statsData.total} loading={statsLoading} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="新客资" value={statsData.newCount} loading={statsLoading} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="已分配" value={statsData.assigned} loading={statsLoading} valueStyle={{ color: '#13c2c2' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="待添加" value={statsData.pending} loading={statsLoading} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="已通过" value={statsData.added} loading={statsLoading} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="协同中" value={statsData.collaborating} loading={statsLoading} valueStyle={{ color: '#722ed1' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="已成交" value={statsData.dealDone} loading={statsLoading} valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col span={3}>
          <Card size="small">
            <Statistic title="无效" value={statsData.invalid} loading={statsLoading} valueStyle={{ color: '#f5222d' }} />
          </Card>
        </Col>
      </Row>

      {/* 筛选栏 */}
      <Card size="small">
        <Space size={12} wrap>
          <Select
            value={filters.platform}
            options={platformOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, platform: value }))}
            style={{ width: 120 }}
            placeholder="平台"
          />
          <Select
            value={filters.operatorId}
            options={employeeOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, operatorId: value, accountId: '' }))}
            style={{ width: 140 }}
            placeholder="运营"
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={filters.salesId}
            options={salesOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, salesId: value }))}
            style={{ width: 140 }}
            placeholder="销售"
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={filters.accountId}
            options={accountOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, accountId: value, postId: '' }))}
            style={{ width: 160 }}
            placeholder="来源账号"
            showSearch
            optionFilterProp="label"
          />
          <Select
            value={filters.processStatus}
            options={processStatusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, processStatus: value }))}
            style={{ width: 130 }}
            placeholder="处理状态"
          />
          <Select
            value={filters.addStatus}
            options={addStatusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, addStatus: value }))}
            style={{ width: 140 }}
            placeholder="添加状态"
          />
          <QuickRangePicker
            value={buildDateRangeValue(filters.startDate, filters.endDate)}
            onChange={(range) => setFilters((prev) => ({
              ...prev,
              startDate: range?.start.format('YYYY-MM-DD') ?? '',
              endDate: range?.end.format('YYYY-MM-DD') ?? '',
            }))}
            presets={RANGE_PRESETS_FULL}
            variant="select"
            selectWidth={120}
            selectPlaceholder="快捷时间"
          />
        </Space>
      </Card>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      {/* 主表格 */}
      <Card>
        <Spin spinning={loading}>
          <Table<Lead>
            rowKey="id"
            columns={columns}
            dataSource={items}
            pagination={tablePagination}
            scroll={{ x: 1400 }}
            onChange={handleTableChange}
            locale={{ emptyText: <Empty description={error ? '客资加载失败' : '暂无客资'} /> }}
          />
        </Spin>
      </Card>

      {/* 高级筛选弹窗 */}
      <Modal
        title="高级筛选"
        open={advancedOpen}
        onCancel={() => setAdvancedOpen(false)}
        width={520}
        destroyOnClose
        footer={[
          <Button key="reset" onClick={resetAdvanced}>清空</Button>,
          <Button key="cancel" onClick={() => setAdvancedOpen(false)}>取消</Button>,
          <Button key="apply" type="primary" onClick={applyAdvanced}>应用</Button>,
        ]}
      >
        <Form form={advancedForm} layout="vertical" preserve={false}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="平台" name="platform">
                <Select options={platformOptions} placeholder="全部平台" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="运营" name="operatorId">
                <Select
                  options={employeeOptions}
                  placeholder="全部运营"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="销售" name="salesId">
                <Select
                  options={salesOptions}
                  placeholder="全部销售"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="来源账号" name="accountId">
                <Select
                  options={accountOptions}
                  placeholder="全部账号"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="来源作品" name="postId">
                <Select
                  options={postOptions}
                  placeholder="全部作品"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="处理状态" name="processStatus">
                <Select options={processStatusOptions} placeholder="全部处理状态" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="添加状态" name="addStatus">
                <Select options={addStatusOptions} placeholder="全部添加状态" allowClear />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="成交状态" name="dealStatus">
                <Select options={dealStatusOptions} placeholder="全部成交状态" allowClear />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="创建日期范围" name="dateRange">
                <RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 改派弹窗 */}
      <Modal
        title="改派客资"
        open={Boolean(reassignLead)}
        onCancel={() => setReassignLead(null)}
        onOk={confirmReassign}
        confirmLoading={actionLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text type="secondary">
            {reassignLead ? `${reassignLead.customerName} 当前销售：${reassignLead.salesName || '未分配'}` : ''}
          </Text>
          <Select
            showSearch
            placeholder="选择新的销售"
            value={selectedSalesUserId}
            onChange={setSelectedSalesUserId}
            options={salesUsers.map((item) => ({ label: item.name, value: item.id }))}
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
        </Space>
      </Modal>

      {/* 跟进记录弹窗 */}
      <Modal
        title={`跟进记录 - ${followRecordLead?.customerName || ''}`}
        open={Boolean(followRecordLead)}
        onCancel={() => setFollowRecordLead(null)}
        footer={null}
        width={600}
      >
        <Spin spinning={followRecordsLoading}>
          {followRecords.length > 0 ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {followRecords.map((record) => (
                <Card key={record.id} size="small">
                  <Space>
                    <Text type="secondary">{record.occurredAt}</Text>
                    <Text type="secondary">|</Text>
                    <Text>{record.actorName || '未知'}</Text>
                  </Space>
                  <Typography.Paragraph style={{ marginBottom: 0, marginTop: 8 }}>
                    {record.content || '无内容'}
                  </Typography.Paragraph>
                </Card>
              ))}
            </Space>
          ) : (
            <Empty description="暂无跟进记录" />
          )}
        </Spin>
      </Modal>
    </Space>
  );
}
