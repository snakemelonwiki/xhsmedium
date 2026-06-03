'use client';

import {
  DownloadOutlined,
  EyeOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Image,
  Input,
  message,
  Modal,
  Pagination,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { TablePaginationConfig } from 'antd/es/table/interface';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { createExport } from '@/shared/api/exports';

const { RangePicker } = DatePicker;
const DEFAULT_PAGE_SIZE = 20;

type Filters = {
  platform: string;
  employeeId: string;
  accountId: string;
  postType: string;
  isLeadPost: string;
  startDate: string;
  endDate: string;
  keyword: string;
};

const EMPTY_FILTERS: Filters = {
  platform: '',
  employeeId: '',
  accountId: '',
  postType: '',
  isLeadPost: '',
  startDate: '',
  endDate: '',
  keyword: '',
};

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

function formatDayjs(value: Dayjs | null | undefined): string {
  if (!value) return '';
  return value.format('YYYY-MM-DD');
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

export default function AdminPostsPage() {
  const [items, setItems] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, leadPosts: 0, pending: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedForm] = Form.useForm();
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [leadRecords, setLeadRecords] = useState<Array<{ id: string; customerName: string; platform?: string; createdAt?: string }>>([]);
  const [leadRecordsLoading, setLeadRecordsLoading] = useState(false);

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

  async function loadStats() {
    setStatsLoading(true);
    try {
      // 加载全量作品列表用于统计
      const baseQuery: Record<string, string | number> = {
        limit: 10000,
        offset: 0,
      };
      if (filters.platform) baseQuery.platform = filters.platform;
      if (filters.employeeId) baseQuery.employeeId = filters.employeeId;
      if (filters.accountId) baseQuery.accountId = filters.accountId;
      if (filters.postType) baseQuery.postType = filters.postType;
      if (filters.startDate) baseQuery.from = filters.startDate;
      if (filters.endDate) baseQuery.to = filters.endDate;
      if (filters.keyword) baseQuery.search = filters.keyword;
      const payload = await apiClient.get<any>('/posts', { query: baseQuery });
      const data = payload?.items ?? payload ?? [];
      const posts = Array.isArray(data) ? data : [];
      const leadPosts = posts.filter((p: any) => (p.leadsCount ?? p.leadCount ?? 0) >= 5).length;
      const pending = posts.filter((p: any) => !p.supervisorSuggestion && (p.leadsCount ?? p.leadCount ?? 0) >= 3).length;
      setStats({
        total: posts.length,
        leadPosts,
        pending,
      });
    } catch {
      // 忽略统计错误
    } finally {
      setStatsLoading(false);
    }
  }

  function buildQuery(override: { page?: number; pageSize?: number } = {}) {
    const { page: p = page, pageSize: ps = pageSize } = override;
    const query: Record<string, string | number> = {
      limit: ps,
      offset: (p - 1) * ps,
    };
    if (filters.platform) query.platform = filters.platform;
    if (filters.employeeId) query.employeeId = filters.employeeId;
    if (filters.accountId) query.accountId = filters.accountId;
    if (filters.postType) query.postType = filters.postType;
    if (filters.startDate) query.from = filters.startDate;
    if (filters.endDate) query.to = filters.endDate;
    if (filters.keyword) query.search = filters.keyword;
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
      const mapped = posts.map((p: any): Post => ({
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
        metrics: {
          traffic: Number(p.traffic ?? 0),
          likes: Number(p.likes ?? 0),
          comments: Number(p.comments ?? 0),
          favorites: Number(p.favorites ?? 0),
          shares: Number(p.shares ?? 0),
          leadsCount: Number(p.leadsCount ?? p.lead_count ?? p.leads_count ?? 0),
        },
      }));

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
    void loadStats();
    void load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.platform,
    filters.employeeId,
    filters.accountId,
    filters.postType,
    filters.isLeadPost,
    filters.startDate,
    filters.endDate,
    filters.keyword,
  ]);

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
    try {
      const filter: Record<string, string> = {};
      if (filters.platform) filter.platform = filters.platform;
      if (filters.employeeId) filter.employeeId = filters.employeeId;
      if (filters.accountId) filter.accountId = filters.accountId;
      if (filters.postType) filter.postType = filters.postType;
      if (filters.keyword) filter.search = filters.keyword;
      await createExport({ exportType: 'posts', filter });
      message.success('已创建作品导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '作品导出创建失败');
    } finally {
      setExporting(false);
    }
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

  function openAdvanced() {
    advancedForm.setFieldsValue({
      platform: filters.platform || undefined,
      employeeId: filters.employeeId || undefined,
      accountId: filters.accountId || undefined,
      postType: filters.postType || undefined,
      isLeadPost: filters.isLeadPost || undefined,
      dateRange: filters.startDate && filters.endDate
        ? [dayjs(filters.startDate), dayjs(filters.endDate)]
        : null,
      keyword: filters.keyword || undefined,
    });
    setAdvancedOpen(true);
  }

  function applyAdvanced() {
    const values = advancedForm.getFieldsValue() as {
      platform?: string;
      employeeId?: string;
      accountId?: string;
      postType?: string;
      isLeadPost?: string;
      dateRange?: (Dayjs | null)[] | null;
      keyword?: string;
    };
    setFilters({
      platform: values.platform ?? '',
      employeeId: values.employeeId ?? '',
      accountId: values.accountId ?? '',
      postType: values.postType ?? '',
      isLeadPost: values.isLeadPost ?? '',
      startDate: values.dateRange?.[0] ? formatDayjs(values.dateRange[0]) : '',
      endDate: values.dateRange?.[1] ? formatDayjs(values.dateRange[1]) : '',
      keyword: values.keyword ?? '',
    });
    setAdvancedOpen(false);
  }

  function resetAdvanced() {
    advancedForm.resetFields();
    setFilters(EMPTY_FILTERS);
    setAdvancedOpen(false);
  }

  const advancedActiveCount = [
    filters.platform,
    filters.employeeId,
    filters.accountId,
    filters.postType,
    filters.isLeadPost,
    filters.startDate,
    filters.endDate,
    filters.keyword,
  ].filter(Boolean).length;

  const employeeOptions = [
    { label: '全部员工', value: '' },
    ...employees.map((e) => ({ label: e.name || e.id, value: e.id })),
  ];

  const accountOptions = [
    { label: '全部账号', value: '' },
    ...accounts.map((a) => ({ label: a.name, value: a.id })),
  ];

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
    { title: '发布日期', dataIndex: 'publishedAt', width: 110, render: formatDate },
    { title: '流量', dataIndex: ['metrics', 'traffic'], width: 80 },
    { title: '赞', dataIndex: ['metrics', 'likes'], width: 70 },
    { title: '评', dataIndex: ['metrics', 'comments'], width: 70 },
    { title: '藏', dataIndex: ['metrics', 'favorites'], width: 70 },
    { title: '分享', dataIndex: ['metrics', 'shares'], width: 70 },
    {
      title: '客资数',
      dataIndex: ['metrics', 'leadsCount'],
      width: 80,
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
      width: 90,
      fixed: 'right',
      render: (_: unknown, row: Post) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  const handleTableChange = (next: TablePaginationConfig) => {
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
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void loadStats();
              void load(1, pageSize);
            }}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      </div>

      {/* 3 统计卡 */}
      <Row gutter={16}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="作品总数" value={stats.total} loading={statsLoading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="获客贴数(≥5)"
              value={stats.leadPosts}
              loading={statsLoading}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="待补充建议(≥3客资)"
              value={stats.pending}
              loading={statsLoading}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

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
          scroll={{ x: 1500 }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
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
                  {selectedPost.copywriting?.trim() || '暂无完整文案'}
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
    </Space>
  );
}
