'use client';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  InputNumber,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { HeartOutlined, EyeOutlined, StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { listSourceAccounts, type CatalogOption } from '@/shared/api/catalog';
import { listGalleryPosts, togglePostFavorite, getPostSensitiveInfo, type PostSensitiveInfo } from '@/shared/api/content';
import { getPlazaConfig, updatePlazaConfig, type PlazaConfig } from '@/shared/api/plaza-config';
import { listAdminEmployees } from '@/shared/api/admin';
import type { ContentPost } from '@/shared/types/content';
import { todayDateString } from '@/shared/utils/default-date-range';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { getStatusLabel } from '@/shared/constants/lead-status';
import { LazyImage } from '@/shared/components/LazyImage';
import type { IntentionLevelCode } from '@/shared/types/leads';

const INTENTION_LEVEL_META: Record<IntentionLevelCode, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  mid: { label: '中', color: 'orange' },
  low: { label: '低', color: 'blue' },
  invalid: { label: '无效', color: 'default' },
  pending: { label: '待判断', color: 'default' },
};

const platformOptions = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

export const GALLERY_TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '获客贴', value: '获客贴' },
  { label: '人设贴', value: '人设贴' },
  { label: '讨论贴', value: '讨论贴' },
];

function buildDefaultGalleryFilters(): GalleryFilters {
  const today = todayDateString();
  return { from: today, to: today };
}

export function getGalleryTypeSelectValue(postType?: string) {
  return GALLERY_TYPE_OPTIONS.some((option) => option.value === postType) ? postType : undefined;
}


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

type GalleryPageContentProps = {
  description?: string;
  showConfigPanel?: boolean;
  allowFavoriteActions?: boolean;
};

function NumberRangeInput({
  minValue,
  maxValue,
  onBlur: onBlurProp,
  minPlaceholder = '最低',
  maxPlaceholder = '最高',
}: {
  minValue?: number;
  maxValue?: number;
  onBlur: (min?: number, max?: number) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}) {
  const [localMin, setLocalMin] = useState<number | undefined>(minValue);
  const [localMax, setLocalMax] = useState<number | undefined>(maxValue);

  useEffect(() => {
    setLocalMin(minValue);
  }, [minValue]);

  useEffect(() => {
    setLocalMax(maxValue);
  }, [maxValue]);

  const handleBlur = () => {
    onBlurProp(localMin, localMax);
  };

  return (
    <>
      <InputNumber
        min={0}
        placeholder={minPlaceholder}
        style={{ width: 100 }}
        value={localMin}
        onChange={(value) => setLocalMin(typeof value === 'number' ? value : undefined)}
        onBlur={handleBlur}
      />
      <span style={{ color: '#999', lineHeight: '32px' }}>~</span>
      <InputNumber
        min={0}
        placeholder={maxPlaceholder}
        style={{ width: 100 }}
        value={localMax}
        onChange={(value) => setLocalMax(typeof value === 'number' ? value : undefined)}
        onBlur={handleBlur}
      />
    </>
  );
}

export function GalleryPageContent({
  description = '浏览全公司作品，收藏学习。客户联系方式、跟进记录、成交信息等敏感字段对运营端不展示。',
  showConfigPanel = false,
  allowFavoriteActions = true,
}: GalleryPageContentProps) {
  const [items, setItems] = useState<ContentPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<GalleryFilters>(() => buildDefaultGalleryFilters());
  const [accounts, setAccounts] = useState<CatalogOption[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [configForm] = Form.useForm<PlazaConfig>();
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [detailModal, setDetailModal] = useState<{ open: boolean; post?: ContentPost }>({ open: false });
  const [sensitiveInfo, setSensitiveInfo] = useState<PostSensitiveInfo | null>(null);
  const [sensitiveLoading, setSensitiveLoading] = useState(false);

  const pageSize = 15;

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
    listSourceAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    listAdminEmployees({ page: 1, pageSize: 500, limit: 500 })
      .then((result) => {
        const items = result.items || [];
        setEmployees(items.map((e) => ({ id: e.id, name: e.name || e.employeeCode || e.id })));
      })
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!showConfigPanel) return;
    setConfigLoading(true);
    getPlazaConfig()
      .then((config) => configForm.setFieldsValue(config))
      .catch((err) => message.warning(err instanceof Error ? err.message : '作品广场条件加载失败'))
      .finally(() => setConfigLoading(false));
  }, [configForm, showConfigPanel]);

  function applyFilter<K extends keyof GalleryFilters>(key: K, value: GalleryFilters[K]) {
    const next = { ...filters, [key]: value };
    setFilters(next);
    load(1, next);
  }

  function handleDateRangeChange(dates: any) {
    const today = todayDateString();
    const next = {
      ...filters,
      from: dates && dates[0] ? dayjs(dates[0]).format('YYYY-MM-DD') : today,
      to: dates && dates[1] ? dayjs(dates[1]).format('YYYY-MM-DD') : today,
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
    setSensitiveInfo(null);
    setDetailModal({ open: true, post });
    // 加载敏感信息
    const user = typeof window !== 'undefined' ? readAuthenticatedUser() : undefined;
    if (user && ['supervisor', 'admin', 'owner'].includes(user.role)) {
      setSensitiveLoading(true);
      getPostSensitiveInfo(post.id)
        .then(setSensitiveInfo)
        .catch(() => setSensitiveInfo(null))
        .finally(() => setSensitiveLoading(false));
    } else {
      setSensitiveInfo(null);
    }
  }

  async function saveConfig(values: PlazaConfig) {
    setConfigSaving(true);
    try {
      const next = await updatePlazaConfig({
        minLeads: Number(values.minLeads ?? 0),
        minTraffic: Number(values.minTraffic ?? 0),
        marketingMinLeads: Number(values.marketingMinLeads ?? 1),
        personaMinTraffic: Number(values.personaMinTraffic ?? 10000),
      });
      configForm.setFieldsValue(next);
      message.success('作品广场展示条件已保存');
      load(1);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '作品广场展示条件保存失败');
    } finally {
      setConfigSaving(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>作品广场</Typography.Title>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
      </div>

      {error ? (
        <Alert type="warning" showIcon message="作品广场暂不可用" description={error} />
      ) : null}

      {showConfigPanel ? (
        <Card>
          <Form
            form={configForm}
            layout="inline"
            disabled={configLoading}
            initialValues={{ minLeads: 0, minTraffic: 0, marketingMinLeads: 1, personaMinTraffic: 10000 }}
            onFinish={saveConfig}
          >
            <Form.Item label="展示条件" style={{ marginRight: 8 }}>
              <Typography.Text type="secondary">营销帖按客资过滤，人设帖按流量过滤</Typography.Text>
            </Form.Item>
            <Form.Item name="marketingMinLeads" label="营销帖客资不少于">
              <InputNumber min={0} precision={0} addonAfter="条" style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="personaMinTraffic" label="人设帖流量不少于">
              <InputNumber min={0} precision={0} addonAfter="次" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="minLeads" label="全部作品客资不少于">
              <InputNumber min={0} precision={0} addonAfter="条" style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="minTraffic" label="全部作品流量不少于">
              <InputNumber min={0} precision={0} addonAfter="次" style={{ width: 160 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={configSaving}>
                保存条件
              </Button>
            </Form.Item>
          </Form>
        </Card>
      ) : null}

      <Card loading={loading}>
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
            value={getGalleryTypeSelectValue(filters.postType)}
            options={GALLERY_TYPE_OPTIONS}
            onChange={(value) => applyFilter('postType', value || undefined)}
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
          <Select
            allowClear
            showSearch
            aria-label="筛选运营员工"
            placeholder="全部员工"
            optionFilterProp="label"
            style={{ width: 140 }}
            value={filters.employeeId || undefined}
            options={employees.map((e) => ({ label: e.name, value: e.id }))}
            onChange={(value) => applyFilter('employeeId', value || undefined)}
          />
          <DatePicker.RangePicker
            allowClear
            value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
            style={{ width: 260 }}
            onChange={handleDateRangeChange}
          />
          <NumberRangeInput
            minValue={filters.likesMin}
            maxValue={filters.likesMax}
            minPlaceholder="最低点赞"
            maxPlaceholder="最高点赞"
            onBlur={(min, max) => {
              setFilters((prev) => {
                const next = { ...prev, likesMin: min, likesMax: max };
                load(1, next);
                return next;
              });
            }}
          />
          <NumberRangeInput
            minValue={filters.leadsMin}
            maxValue={filters.leadsMax}
            minPlaceholder="最低客资"
            maxPlaceholder="最高客资"
            onBlur={(min, max) => {
              setFilters((prev) => {
                const next = { ...prev, leadsMin: min, leadsMax: max };
                load(1, next);
                return next;
              });
            }}
          />
        </Space>

        <div style={{ marginBottom: 12, color: '#888', fontSize: 13 }}>
          共 <strong>{total}</strong> 条作品
        </div>

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
                    <LazyImage
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
                    <Tag>赞 {post.metrics.likes}</Tag>
                    <Tag>评 {post.metrics.comments}</Tag>
                    <Tag>藏 {post.metrics.favorites}</Tag>
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
                    {allowFavoriteActions ? (
                      <Button
                        size="small"
                        type={post.isFavorited ? 'primary' : 'default'}
                        icon={post.isFavorited ? <StarFilled /> : <HeartOutlined />}
                        onClick={(e) => toggleFavorite(post, e)}
                      >
                        {post.isFavorited ? '已收藏' : '收藏'}
                      </Button>
                    ) : null}
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
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {(detailModal.post.coverThumbUrl || detailModal.post.coverImageUrl) && (
              <LazyImage
                src={detailModal.post.coverThumbUrl || detailModal.post.coverImageUrl}
                alt={detailModal.post.title}
                style={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 8 }}
              />
            )}

            <Typography.Text strong style={{ fontSize: 18 }}>{detailModal.post.title}</Typography.Text>

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

            <div>
              <Typography.Text type="secondary">主管建议：</Typography.Text>
              <Typography.Paragraph
                style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}
                ellipsis={{ rows: 4, expandable: true }}
              >
                {detailModal.post.supervisorSuggestion || '暂无主管建议'}
              </Typography.Paragraph>
            </div>

            {/* T8: 运营主管端角色展示敏感信息 */}
            <SensitiveInfoSection
              userRole={typeof window !== 'undefined' ? readAuthenticatedUser()?.role : undefined}
              sensitiveInfo={sensitiveInfo}
              loading={sensitiveLoading}
            />
          </Space>
        )}
      </Modal>
    </Space>
  );
}

// T8: 敏感信息展示区
function SensitiveInfoSection({
  userRole,
  sensitiveInfo,
  loading,
}: {
  userRole: string | undefined;
  sensitiveInfo: PostSensitiveInfo | null;
  loading: boolean;
}) {
  if (!userRole || !['supervisor', 'admin', 'owner'].includes(userRole)) {
    return (
      <Alert
        type="info"
        showIcon={false}
        message="敏感信息仅主管/管理员可见"
        style={{ fontSize: 12 }}
      />
    );
  }

  return (
    <Spin spinning={loading}>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 客资信息 */}
        <div>
          <Typography.Text strong>客户联系方式 / 销售分配</Typography.Text>
          {sensitiveInfo?.leads && sensitiveInfo.leads.length > 0 ? (
            <Space direction="vertical" size={4} style={{ marginTop: 8, width: '100%' }}>
              {sensitiveInfo.leads.map((lead) => {
                const intentionMeta =
                  INTENTION_LEVEL_META[(lead.intentionLevel as IntentionLevelCode) ?? 'pending'] ??
                  { label: lead.intentionLevel || '待判断', color: 'default' };
                return (
                  <Card key={lead.id} size="small" style={{ width: '100%' }}>
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Typography.Text>
                        联系方式：{lead.contactInfo || '-'}
                      </Typography.Text>
                      {lead.wechat && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          微信：{lead.wechat}
                        </Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        销售分配：{lead.salesUserName || lead.assignedSalesUserId || '-'}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        状态：{getStatusLabel(lead.status as any) || lead.status || '-'}
                      </Typography.Text>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          意向程度：
                          <Tag color={intentionMeta.color}>{intentionMeta.label}</Tag>
                        </Typography.Text>
                        <Link href={`/sales/leads/${lead.id}`} target="_blank">
                          <Button size="small" type="link" style={{ padding: 0 }}>
                            查看客资详情
                          </Button>
                        </Link>
                      </div>
                    </Space>
                  </Card>
                );
              })}
            </Space>
          ) : (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              暂无客资信息
            </Typography.Paragraph>
          )}
        </div>

        {/* 成交信息 */}
        <div>
          <Typography.Text strong>成交信息</Typography.Text>
          {sensitiveInfo?.orders && sensitiveInfo.orders.length > 0 ? (
            <Space direction="vertical" size={4} style={{ marginTop: 8, width: '100%' }}>
              {sensitiveInfo.orders.map((order) => (
                <Card key={order.id} size="small" style={{ width: '100%' }}>
                  <Space direction="vertical" size={2}>
                    <Typography.Text>
                      客户：{order.customerName || '-'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      金额：{order.amount ? `¥${order.amount}` : '-'}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      付款状态：{order.paidStatus}
                    </Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      订单状态：{order.orderStatus}
                    </Typography.Text>
                    {order.paymentStage && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        付款阶段：{order.paymentStage}
                      </Typography.Text>
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          ) : (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              暂无成交信息
            </Typography.Paragraph>
          )}
        </div>
      </Space>
    </Spin>
  );
}
