'use client';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { HeartOutlined, EyeOutlined, StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

import { listAdminEmployees } from '@/shared/api/admin';
import { listSourceAccounts, type CatalogOption } from '@/shared/api/catalog';
import { listGalleryPosts, togglePostFavorite } from '@/shared/api/content';
import type { ContentPost } from '@/shared/types/content';

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '图文', value: '图文' },
  { label: '视频', value: '视频' },
  { label: '素人贴', value: '素人贴' },
  { label: '话题贴', value: '话题贴' },
  { label: '获客贴', value: '获客贴' },
  { label: '营销贴', value: '营销贴' },
];

type GalleryFilters = {
  platform?: string;
  postType?: string;
  employeeId?: string;
  accountId?: string;
  from?: string;
  to?: string;
  likesMin?: number;
  likesMax?: number;
  leadsMin?: number;
  leadsMax?: number;
};

export default function OperationGalleryPage() {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<GalleryFilters>({});
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  // Detail modal state
  const [detailModal, setDetailModal] = useState<{ open: boolean; post?: ContentPost }>({ open: false });

  const pageSize = 12;

  async function load(nextPage = page, nextFilters = filters) {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listGalleryPosts({
        page: nextPage,
        pageSize,
        platform: nextFilters.platform || undefined,
        postType: nextFilters.postType || undefined,
        employeeId: nextFilters.employeeId || undefined,
        accountId: nextFilters.accountId || undefined,
        from: nextFilters.from,
        to: nextFilters.to,
        likesMin: nextFilters.likesMin,
        likesMax: nextFilters.likesMax,
        leadsMin: nextFilters.leadsMin,
        leadsMax: nextFilters.leadsMax,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '作品广场加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listAdminEmployees({ pageSize: 200 })
      .then((result) => {
        setEmployees(result.items.map((e) => ({ id: e.id, name: e.name })));
      })
      .catch(() => setEmployees([]));
    listSourceAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  function applyFilter<K extends keyof GalleryFilters>(key: K, value: GalleryFilters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(1, next);
  }

  function handleDateRangeChange(dates: any) {
    const next = {
      ...filters,
      from: dates && dates[0] ? dayjs(dates[0]).format('YYYY-MM-DD') : undefined,
      to: dates && dates[1] ? dayjs(dates[1]).format('YYYY-MM-DD') : undefined,
    };
    setFilters(next);
    load(1, next);
  }

  async function toggleFavorite(post: ContentPost, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      const result = await togglePostFavorite(post.id);
      setItems((current) =>
        current.map((item) => {
          if (item.id !== post.id) return item;
          const currentCount = item.metrics.favorites || 0;
          const nextCount =
            result.favorites ?? Math.max(0, currentCount + (result.isFavorited ? 1 : -1));
          return {
            ...item,
            isFavorited: result.isFavorited,
            metrics: { ...item.metrics, favorites: nextCount },
          };
        }),
      );
      message.success(result.isFavorited ? '已收藏' : '已取消收藏');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '收藏操作失败');
    }
  }

  function openDetail(post: ContentPost) {
    setDetailModal({ open: true, post });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>作品广场</Typography.Title>
          <Typography.Paragraph type="secondary">
            浏览全公司作品，收藏学习。客户联系方式、跟进记录、成交信息等敏感字段对运营端不展示。
          </Typography.Paragraph>
        </div>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="作品广场暂不可用" description={error} />
      ) : null}

      <Card loading={loading}>
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
            aria-label="筛选类型"
            placeholder="全部类型"
            style={{ width: 130 }}
            value={filters.postType || undefined}
            options={typeOptions}
            onChange={(value) => applyFilter('postType', value || undefined)}
          />
          <Select
            allowClear
            showSearch
            aria-label="筛选员工"
            placeholder="全部员工"
            optionFilterProp="label"
            style={{ width: 160 }}
            value={filters.employeeId || undefined}
            options={employees.map((e) => ({ label: e.name, value: e.id }))}
            onChange={(value) => applyFilter('employeeId', value || undefined)}
          />
          <Select
            allowClear
            showSearch
            aria-label="筛选账号"
            placeholder="全部账号"
            optionFilterProp="label"
            style={{ width: 180 }}
            value={filters.accountId || undefined}
            options={accounts.map((a) => ({
              label: a.platform ? `${a.name}（${a.platform}）` : a.name,
              value: a.id,
            }))}
            onChange={(value) => applyFilter('accountId', value || undefined)}
          />
          <DatePicker.RangePicker
            allowClear
            style={{ width: 260 }}
            onChange={handleDateRangeChange}
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

        {/* Summary */}
        <div style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>
          共 <strong>{total}</strong> 条作品
        </div>

        {/* Card grid */}
        {items.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((post) => (
              <Card
                key={post.id}
                size="small"
                hoverable
                cover={
                  post.coverThumbUrl || post.coverImageUrl ? (
                    <img
                      src={post.coverThumbUrl || post.coverImageUrl}
                      alt={post.title}
                      style={{ height: 148, objectFit: 'cover' }}
                    />
                  ) : undefined
                }
                onClick={() => openDetail(post)}
                style={{ cursor: 'pointer' }}
              >
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space wrap>
                    <Tag color={post.platform?.includes('抖') ? 'blue' : 'red'}>{post.platform}</Tag>
                    <Tag>{post.postType || '未分类'}</Tag>
                    {post.metrics.leadsCount > 0 && (
                      <Tag color="green">获客</Tag>
                    )}
                  </Space>

                  <Typography.Text strong ellipsis={{ tooltip: post.title }}>
                    {post.title}
                  </Typography.Text>

                  <Typography.Text type="secondary" ellipsis>
                    账号：{post.accountName || post.accountId || '未知'}
                  </Typography.Text>

                  <Typography.Text type="secondary" ellipsis>
                    运营：{post.employeeName || '-'}
                  </Typography.Text>

                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {post.publishedAt || '-'}
                  </Typography.Text>

                  <Space wrap>
                    <Tag>
                      赞 {post.metrics.likes}
                    </Tag>
                    <Tag>
                      评 {post.metrics.comments}
                    </Tag>
                    <Tag>
                      藏 {post.metrics.favorites}
                    </Tag>
                    <Tag color={post.metrics.leadsCount > 0 ? 'green' : 'default'}>
                      客资 {post.metrics.leadsCount}
                    </Tag>
                  </Space>

                  <Space>
                    {post.postUrl && (
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(post.postUrl, '_blank');
                        }}
                      >
                        原帖
                      </Button>
                    )}
                    <Button
                      size="small"
                      type={post.isFavorited ? 'primary' : 'default'}
                      icon={post.isFavorited ? <StarFilled /> : <HeartOutlined />}
                      onClick={(e) => toggleFavorite(post, e)}
                    >
                      {post.isFavorited ? '已收藏' : '收藏'}
                    </Button>
                  </Space>
                </Space>
              </Card>
            ))}
          </div>
        ) : (
          <Empty description="暂无作品" />
        )}

        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(next) => load(next)}
          style={{ marginTop: 16, textAlign: 'right' }}
          showSizeChanger={false}
        />
      </Card>

      {/* Detail Modal */}
      <Modal
        title="作品详情"
        open={detailModal.open}
        onCancel={() => setDetailModal({ open: false })}
        width={640}
        footer={
          <Space>
            {detailModal.post?.postUrl && (
              <Button
                onClick={() => window.open(detailModal.post?.postUrl, '_blank')}
                icon={<EyeOutlined />}
              >
                打开原帖
              </Button>
            )}
            <Button onClick={() => setDetailModal({ open: false })}>关闭</Button>
          </Space>
        }
      >
        {detailModal.post && (
          // v1.3 / OP-22: 详情弹窗顺序改为「封面 → 标题 → 元信息 → 文案 → 数据 → 主管建议」；
          // 列表已按 all 视图加载（v1.3 / OP-14 全公司作品），联系方式/跟进/成交等敏感字段不展示。
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {/* 1. 封面图置顶，占满宽度 */}
            {(detailModal.post.coverThumbUrl || detailModal.post.coverImageUrl) && (
              <img
                src={detailModal.post.coverThumbUrl || detailModal.post.coverImageUrl}
                alt={detailModal.post.title}
                style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8 }}
              />
            )}

            {/* 2. 标题 */}
            <Typography.Text strong style={{ fontSize: 18 }}>{detailModal.post.title}</Typography.Text>

            {/* 3. 元信息：平台 / 类型 / 时间 / 账号 / 运营 */}
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={detailModal.post.platform?.includes('抖') ? 'blue' : 'red'}>
                  {detailModal.post.platform}
                </Tag>
                <Tag>{detailModal.post.postType || '未分类'}</Tag>
                {detailModal.post.metrics.leadsCount > 0 && (
                  <Tag color="green">获客贴</Tag>
                )}
              </Space>
              <div>
                <Typography.Text type="secondary">账号：</Typography.Text>
                <Typography.Text>{detailModal.post.accountName || detailModal.post.accountId || '未知'}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">运营：</Typography.Text>
                <Typography.Text>{detailModal.post.employeeName || '-'}</Typography.Text>
              </div>
              <div>
                <Typography.Text type="secondary">发布时间：</Typography.Text>
                <Typography.Text>{detailModal.post.publishedAt || '-'}</Typography.Text>
              </div>
            </Space>

            {/* 4. 文案 */}
            {detailModal.post.copywriting && (
              <div>
                <Typography.Text type="secondary">文案：</Typography.Text>
                <Typography.Paragraph
                  style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}
                  ellipsis={{ rows: 6, expandable: true }}
                >
                  {detailModal.post.copywriting}
                </Typography.Paragraph>
              </div>
            )}

            {/* 5. 互动数据 */}
            <div>
              <Typography.Text type="secondary">互动数据：</Typography.Text>
              <Space wrap>
                <Tag>赞 {detailModal.post.metrics.likes}</Tag>
                <Tag>评 {detailModal.post.metrics.comments}</Tag>
                <Tag>藏 {detailModal.post.metrics.favorites}</Tag>
                <Tag>转 {detailModal.post.metrics.shares}</Tag>
                <Tag color={detailModal.post.metrics.leadsCount > 0 ? 'green' : 'default'}>
                  客资 {detailModal.post.metrics.leadsCount}
                </Tag>
              </Space>
            </div>

            {/* 6. 主管建议（v1.3 / OP-22：顺序为 封面 → 标题 → 元信息 → 文案 → 数据 → 主管建议） */}
            <div>
              <Typography.Text type="secondary">主管建议：</Typography.Text>
              <Typography.Paragraph
                style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}
                ellipsis={{ rows: 4, expandable: true }}
              >
                {detailModal.post.supervisorSuggestion || '暂无主管建议'}
              </Typography.Paragraph>
            </div>

            {/* 7. 隐藏字段说明（OP-14 全公司作品范围下隐藏联系方式/跟进/成交） */}
            <Alert
              type="info"
              showIcon={false}
              message="以下信息已被隐藏：客户联系方式、销售分配、成交信息"
              style={{ fontSize: 12 }}
            />
          </Space>
        )}
      </Modal>
    </Space>
  );
}
