'use client';

import {
  Alert,
  Button,
  Card,
  Empty,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listSourceAccounts, type CatalogOption } from '@/shared/api/catalog';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { listPosts, refreshPostMetrics, getPostDetail } from '@/shared/api/content';
import { QuickRangePicker, RANGE_PRESETS_FULL } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import type { ContentPost } from '@/shared/types/content';
import { normalizePostMetric } from '@/shared/utils/post-metrics';

type PostFilters = {
  platform?: string;
  accountId?: string;
  postType?: string;
  dateRange?: DateRangeValue;
  likesMin?: number;
  likesMax?: number;
  leadsMin?: number;
  leadsMax?: number;
  sort?: string;
};

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const postTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '图文', value: '图文' },
  { label: '视频', value: '视频' },
  { label: '素人贴', value: '素人贴' },
  { label: '话题贴', value: '话题贴' },
  { label: '获客贴', value: '获客贴' },
  { label: '营销贴', value: '营销贴' },
];

export default function OperationPostsPage() {
  const searchParams = useSearchParams();
  const fromParam = searchParams.get('from') || undefined;
  const toParam = searchParams.get('to') || undefined;
  const accountParam = searchParams.get('accountId') || undefined;

  const [items, setItems] = useState<ContentPost[]>([]);
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [filters, setFilters] = useState<PostFilters>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);

  // Metrics modal state
  const [metricsModal, setMetricsModal] = useState<{ open: boolean; postId?: string; loading?: boolean; history?: any[] }>({ open: false });
  // Supervisor suggestion modal state
  const [suggestionModal, setSuggestionModal] = useState<{ open: boolean; post?: ContentPost }>({ open: false });

  async function load(nextPage = page, nextFilters = filters) {
    setLoading(true);
    setError(undefined);
    try {
      const params: any = {
        page: nextPage,
        pageSize,
      };
      for (const [key, value] of Object.entries(nextFilters)) {
        if (key !== 'dateRange' && value !== undefined && value !== null && value !== '') {
          params[key] = value;
        }
      }
      if (fromParam) params.from = fromParam;
      if (toParam) params.to = toParam;
      if (accountParam && !params.accountId) params.accountId = accountParam;
      if (nextFilters.dateRange) {
        params.from = nextFilters.dateRange.start.format('YYYY-MM-DD');
        params.to = nextFilters.dateRange.end.format('YYYY-MM-DD');
      }
      const result = await listPosts(params);
      setItems(result.items.map((post) => ({
        ...post,
        metrics: {
          traffic: normalizePostMetric(post.metrics.traffic),
          likes: normalizePostMetric(post.metrics.likes),
          comments: normalizePostMetric(post.metrics.comments),
          favorites: normalizePostMetric(post.metrics.favorites),
          shares: normalizePostMetric(post.metrics.shares),
          leadsCount: normalizePostMetric(post.metrics.leadsCount),
        },
      })));
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '作品列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function refreshMetrics(post: ContentPost) {
    try {
      await refreshPostMetrics(post.id, post.postUrl);
      message.success('已提交刷新');
      await load(page);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '刷新失败');
    }
  }

  async function openMetricsModal(post: ContentPost) {
    setMetricsModal({ open: true, postId: post.id, loading: true });
    try {
      const detail = await getPostDetail(post.id);
      setMetricsModal((prev) => ({ ...prev, loading: false, history: [] }));
    } catch {
      setMetricsModal((prev) => ({ ...prev, loading: false, history: [] }));
    }
  }

  async function openSuggestionModal(post: ContentPost) {
    setSuggestionModal({ open: true, post });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const filterJson: any = { ...filters };
      delete filterJson.dateRange;
      if (fromParam) filterJson.from = fromParam;
      if (toParam) filterJson.to = toParam;
      if (accountParam && !filterJson.accountId) filterJson.accountId = accountParam;
      if (filters.dateRange) {
        filterJson.from = filters.dateRange.start.format('YYYY-MM-DD');
        filterJson.to = filters.dateRange.end.format('YYYY-MM-DD');
      }
      const created = await createExport({
        exportType: 'posts',
        filter: filterJson,
      });
      const taskId = created?.id;
      if (!taskId) {
        // 后端没返回 id,退回到老路径(去导出中心)
        message.success('导出任务已创建，请在导出中心查看进度');
        return;
      }
      // 修复 (2026-06-04) — 运营端"我的作品"导出应直接下载文件,不是发通知/跳转。
      //   后端导出是异步的(BullMQ 队列 + OSS 异步上传),普通数据 < 2s 内即可 completed。
      //   这里用轮询代替"去导出中心"两步操作,完成后自动 window.open 下载链接。
      message.loading({ content: '正在生成导出文件…', key: 'op-post-export', duration: 0 });
      const deadline = Date.now() + 30_000; // 30s 上限,超过后让用户去导出中心看
      let lastStatus: string = 'pending';
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const task = await getExport(taskId);
          lastStatus = String(task?.status || 'pending');
          if (lastStatus === 'completed' || lastStatus === 'success') {
            // 直接触发浏览器下载(走 OSS 302,前端不需拿文件)
            window.open(downloadExportUrl(taskId), '_blank');
            message.destroy('op-post-export');
            message.success('导出完成,文件已开始下载');
            return;
          }
          if (lastStatus === 'failed') {
            message.destroy('op-post-export');
            message.error('导出失败,请到导出中心查看');
            return;
          }
        } catch {
          // 单次轮询失败忽略,继续
        }
      }
      // 超时:30s 内还没完成(数据量大),退回到"去导出中心"路径
      message.destroy('op-post-export');
      message.warning('导出仍在后台生成,请到导出中心查看并下载');
    } catch (err) {
      message.destroy('op-post-export');
      message.error(err instanceof Error ? err.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromParam, toParam, accountParam]);

  useEffect(() => {
    if (accountParam) {
      setFilters((prev) => ({ ...prev, accountId: accountParam }));
    }
  }, [accountParam]);

  useEffect(() => {
    listSourceAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  function applyFilter<K extends keyof PostFilters>(key: K, value: PostFilters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(1, next);
  }

  function handleDateRangeChange(dateRange: DateRangeValue) {
    const next = { ...filters, dateRange };
    setFilters(next);
    load(1, next);
  }

  const columns: ColumnsType<ContentPost> = [
    {
      title: '作品',
      width: 320,
      render: (_, record) => (
        <Space size={10} align="start">
          {record.coverThumbUrl || record.coverImageUrl ? (
            <img
              src={record.coverThumbUrl || record.coverImageUrl}
              alt={record.title}
              style={{ width: 88, height: 64, objectFit: 'cover', borderRadius: 6, flex: '0 0 auto' }}
            />
          ) : (
            <div style={{ width: 88, height: 64, background: '#f0f0f0', borderRadius: 6, flex: '0 0 auto' }} />
          )}
          <Space direction="vertical" size={2} style={{ minWidth: 0 }}>
            <Typography.Text strong ellipsis style={{ maxWidth: 210 }}>
              {record.title || '未命名作品'}
            </Typography.Text>
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 210, fontSize: 12 }}>
              {record.copywriting || record.note || '暂无文案'}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 90,
      render: (platform: string) => (
        <Tag color={platform?.includes('抖') ? 'blue' : 'red'}>{platform}</Tag>
      ),
    },
    {
      title: '账号',
      width: 120,
      render: (_, record) => record.accountId ? (
        <Link href={`/operation/accounts?id=${encodeURIComponent(String(record.accountId))}`}>
          {record.accountName || record.accountId}
        </Link>
      ) : (record.accountName || '-'),
    },
    {
      title: '类型',
      dataIndex: 'postType',
      width: 90,
      render: (type: string) => type || '未分类',
    },
    {
      title: '发布时间',
      dataIndex: 'publishedAt',
      width: 110,
      sorter: false,
      render: (v?: string) => (v ? v.slice(0, 10) : '-'),
    },
    {
      title: '点赞/评论/收藏/转发',
      width: 200,
      render: (_, record) => (
        <Space size={4} wrap>
          <Tag>赞 {record.metrics.likes}</Tag>
          <Tag>评 {record.metrics.comments}</Tag>
          <Tag>藏 {record.metrics.favorites}</Tag>
          <Tag>转 {record.metrics.shares}</Tag>
        </Space>
      ),
    },
    {
      title: '客资数',
      width: 80,
      sorter: false,
      render: (_, record) => (
        <Typography.Text type={record.metrics.leadsCount > 0 ? 'success' : 'secondary'}>
          {record.metrics.leadsCount}
        </Typography.Text>
      ),
    },
    {
      title: '是否获客',
      width: 90,
      render: (_, record) => (
        <Tag color={record.metrics.leadsCount > 0 ? 'green' : 'default'}>
          {record.metrics.leadsCount > 0 ? '是' : '否'}
        </Tag>
      ),
    },
    {
      title: '操作',
      width: 240,
      render: (_, record) => (
        <Space size={4} wrap>
          <Link href={`/operation/posts/${record.id}/edit`}>
            <Button size="small">编辑</Button>
          </Link>
          {record.postUrl && (
            <Button size="small" onClick={() => window.open(record.postUrl, '_blank')}>
              原帖
            </Button>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => refreshMetrics(record)} disabled={!record.postUrl}>
            刷新
          </Button>
          <Button size="small" onClick={() => openMetricsModal(record)}>
            指标
          </Button>
          <Button size="small" onClick={() => openSuggestionModal(record)}>
            建议
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的作品</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看个人作品发布和互动数据，支持筛选、排序和导出。
          </Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={handleExport} loading={exporting}>
            导出
          </Button>
          <Link href="/operation/posts/new">
            <Button type="primary">新建作品</Button>
          </Link>
        </Space>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="作品数据暂不可用" description={error} />
      ) : null}
      {fromParam && toParam ? (
        <Alert type="info" showIcon message="今日录入记录" description={`${fromParam} 录入的作品记录`} />
      ) : null}

      <Card>
        {/* Filter bar */}
        <Space size={8} wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            aria-label="筛选平台"
            placeholder="全部平台"
            style={{ width: 130 }}
            value={filters.platform || undefined}
            options={platformOptions}
            onChange={(value) => applyFilter('platform', value || undefined)}
          />
          <Select
            allowClear
            showSearch
            aria-label="筛选账号"
            placeholder="全部账号"
            optionFilterProp="label"
            style={{ width: 180 }}
            value={filters.accountId || undefined}
            options={accounts.map((item) => ({
              label: item.platform ? `${item.name}（${item.platform}）` : item.name,
              value: item.id,
            }))}
            onChange={(value) => applyFilter('accountId', value || undefined)}
          />
          <Select
            allowClear
            aria-label="筛选类型"
            placeholder="全部类型"
            style={{ width: 130 }}
            value={filters.postType || undefined}
            options={postTypeOptions}
            onChange={(value) => applyFilter('postType', value || undefined)}
          />
          <QuickRangePicker
            value={filters.dateRange ?? null}
            onChange={handleDateRangeChange}
            presets={RANGE_PRESETS_FULL}
            variant="select"
            selectWidth={120}
            selectPlaceholder="快捷时间"
          />
          <InputNumber
            aria-label="最低点赞"
            min={0}
            placeholder="最低点赞"
            style={{ width: 100 }}
            value={filters.likesMin}
            onChange={(value) => applyFilter('likesMin', typeof value === 'number' ? value : undefined)}
          />
          <span style={{ color: '#999', lineHeight: '32px' }}>~</span>
          <InputNumber
            aria-label="最高点赞"
            min={0}
            placeholder="最高点赞"
            style={{ width: 100 }}
            value={filters.likesMax}
            onChange={(value) => applyFilter('likesMax', typeof value === 'number' ? value : undefined)}
          />
          <InputNumber
            aria-label="最低客资数"
            min={0}
            placeholder="最低客资"
            style={{ width: 100 }}
            value={filters.leadsMin}
            onChange={(value) => applyFilter('leadsMin', typeof value === 'number' ? value : undefined)}
          />
          <span style={{ color: '#999', lineHeight: '32px' }}>~</span>
          <InputNumber
            aria-label="最高客资数"
            min={0}
            placeholder="最高客资"
            style={{ width: 100 }}
            value={filters.leadsMax}
            onChange={(value) => applyFilter('leadsMax', typeof value === 'number' ? value : undefined)}
          />
        </Space>

        {/* Summary row */}
        <div style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>
          共 <strong>{total}</strong> 条作品
        </div>

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 1200 }}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(nextPage) => load(nextPage)}
          style={{ marginTop: 16, textAlign: 'right' }}
          showSizeChanger={false}
        />
      </Card>

      {/* Metrics Modal */}
      <Modal
        title="作品指标"
        open={metricsModal.open}
        onCancel={() => setMetricsModal({ open: false })}
        footer={
          <Button onClick={() => setMetricsModal({ open: false })}>关闭</Button>
        }
        width={500}
      >
        <Spin spinning={!!metricsModal.loading}>
          {metricsModal.postId ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Paragraph type="secondary">
                作品 ID：{metricsModal.postId}
              </Typography.Paragraph>
              <Typography.Paragraph type="secondary">
                指标数据由刷新按钮触发抓取，最新数据可在列表中查看。
              </Typography.Paragraph>
            </Space>
          ) : null}
        </Spin>
      </Modal>

      {/* Supervisor Suggestion Modal */}
      <Modal
        title="主管建议"
        open={suggestionModal.open}
        onCancel={() => setSuggestionModal({ open: false })}
        footer={
          <Button onClick={() => setSuggestionModal({ open: false })}>关闭</Button>
        }
        width={600}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {suggestionModal.post && (
            <>
              <div>
                <Typography.Text strong>作品：</Typography.Text>
                <Typography.Text>{suggestionModal.post.title}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">
                  {suggestionModal.post.supervisorSuggestion
                    ? suggestionModal.post.supervisorSuggestion
                    : '暂无主管建议'}
                </Typography.Text>
              </div>
            </>
          )}
        </Space>
      </Modal>
    </Space>
  );
}
