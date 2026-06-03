'use client';

import {
  AppstoreOutlined,
  BlockOutlined,
  CommentOutlined,
  DownloadOutlined,
  EyeOutlined,
  HeartOutlined,
  LikeOutlined,
  StarOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Image,
  message,
  Modal,
  Pagination,
  Row,
  Segmented,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TabsProps } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createExport } from '@/shared/api/exports';
import { apiClient } from '@/shared/api/apiClient';
import { getPostDetail, listGalleryPosts, togglePostFavorite } from '@/shared/api/content';
import type { ContentPost } from '@/shared/types/content';

type StudyPeriod = '7' | '14' | '30';
type StudyTab = 'posts' | 'accounts';

interface LearningPost {
  id: string;
  employeeId?: string;
  employeeName?: string;
  accountId?: string;
  accountName?: string;
  platform: string;
  title: string;
  copywriting?: string;
  coverImageUrl?: string;
  postUrl?: string;
  postType?: string;
  likes: number;
  comments: number;
  favorites: number;
  shares: number;
  traffic: number;
  leadCount: number;
  leadsCount: number;
  publishedAt?: string;
  isFavorited?: boolean;
}

interface AccountStat {
  accountId: string;
  accountName: string;
  platform: string;
  employeeId?: string;
  employeeName?: string;
  postCount: number;
  leadsCount: number;
  avgLeadsPerPost: number;
  topPostId?: string;
  topPostTitle?: string;
  topPostLeads?: number;
}

const PERIOD_OPTIONS = [
  { label: '近 7 天', value: '7' },
  { label: '近 14 天', value: '14' },
  { label: '近 30 天', value: '30' },
];

const TAB_OPTIONS: TabsProps['items'] = [
  { key: 'posts', label: '优秀作品榜', icon: <StarOutlined /> },
  { key: 'accounts', label: '优秀账号榜', icon: <AppstoreOutlined /> },
];

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLearningPost(raw: Record<string, unknown>): LearningPost {
  const leadsCount = numberValue(raw.leadsCount ?? raw.leadCount ?? raw.leads_count);
  return {
    id: String(raw.id ?? ''),
    employeeId: String(raw.employeeId ?? raw.employee_id ?? ''),
    employeeName: String(raw.employeeName ?? raw.employee_name ?? ''),
    accountId: String(raw.accountId ?? raw.account_id ?? ''),
    accountName: String(raw.accountName ?? raw.account_name ?? ''),
    platform: String(raw.platform ?? '未知平台'),
    title: String(raw.title ?? '未命名作品'),
    copywriting: String(raw.copywriting ?? ''),
    coverImageUrl: String(raw.coverImageUrl ?? raw.cover_image_url ?? ''),
    postUrl: String(raw.postUrl ?? raw.post_url ?? ''),
    postType: String(raw.postType ?? raw.post_type ?? ''),
    likes: numberValue(raw.likes),
    comments: numberValue(raw.comments),
    favorites: numberValue(raw.favorites),
    shares: numberValue(raw.shares),
    traffic: numberValue(raw.traffic),
    leadCount: leadsCount,
    leadsCount,
    publishedAt: String(raw.publishedAt ?? raw.published_at ?? ''),
    isFavorited: Boolean(raw.isFavorited ?? raw.is_favorited),
  };
}

export default function StudyRankingsPage() {
  const [period, setPeriod] = useState<StudyPeriod>('7');
  const [tab, setTab] = useState<StudyTab>('posts');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [posts, setPosts] = useState<LearningPost[]>([]);
  const [accounts, setAccounts] = useState<AccountStat[]>([]);
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadPosts = useCallback(async (days: number) => {
    setLoading(true);
    setError(undefined);
    try {
      const payload = await apiClient.get<unknown[]>('/rankings/learning-posts', {
        query: { days },
      });
      const rows = Array.isArray(payload) ? payload : [];
      setPosts(rows.map((item) => mapLearningPost(item as Record<string, unknown>)));
      // 根据作品聚合账号统计数据
      aggregateAccounts(rows as Record<string, unknown>[]);
    } catch (err) {
      setPosts([]);
      setAccounts([]);
      setError(err instanceof Error ? err.message : '学习榜单加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  function aggregateAccounts(rows: Record<string, unknown>[]) {
    const accountMap = new Map<string, AccountStat>();
    for (const row of rows) {
      const accountId = String(row.accountId ?? row.account_id ?? '');
      const accountName = String(row.accountName ?? row.account_name ?? '');
      const platform = String(row.platform ?? '');
      const employeeId = String(row.employeeId ?? row.employee_id ?? '');
      const employeeName = String(row.employeeName ?? row.employee_name ?? '');
      const leadsCount = numberValue(row.leadsCount ?? row.leadCount ?? row.leads_count);
      const title = String(row.title ?? '');
      const postId = String(row.id ?? '');

      if (!accountId) continue;

      if (!accountMap.has(accountId)) {
        accountMap.set(accountId, {
          accountId,
          accountName,
          platform,
          employeeId,
          employeeName,
          postCount: 0,
          leadsCount: 0,
          avgLeadsPerPost: 0,
          topPostId: postId,
          topPostTitle: title,
          topPostLeads: leadsCount,
        });
      }
      const stat = accountMap.get(accountId)!;
      stat.postCount++;
      stat.leadsCount += leadsCount;
      if (leadsCount > (stat.topPostLeads ?? 0)) {
        stat.topPostId = postId;
        stat.topPostTitle = title;
        stat.topPostLeads = leadsCount;
      }
    }
    // 计算平均客资
    for (const stat of accountMap.values()) {
      stat.avgLeadsPerPost = stat.postCount > 0 ? stat.leadsCount / stat.postCount : 0;
    }
    setAccounts(Array.from(accountMap.values()).sort((a, b) => b.leadsCount - a.leadsCount));
  }

  useEffect(() => {
    void loadPosts(Number(period));
  }, [period, loadPosts]);

  function changePeriod(nextPeriod: StudyPeriod) {
    setPeriod(nextPeriod);
  }

  async function handleExport() {
    setExporting(true);
    try {
      await createExport({
        exportType: 'rankings',
        filter: { type: 'study', period: `${period}d` },
      });
      message.success('已创建学习榜单导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '导出创建失败');
    } finally {
      setExporting(false);
    }
  }

  async function toggleFavorite(post: LearningPost) {
    try {
      const result = await togglePostFavorite(post.id);
      setPosts((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, isFavorited: result.isFavorited } : item
        )
      );
      message.success(result.isFavorited ? '已收藏' : '已取消收藏');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '收藏操作失败');
    }
  }

  async function openOriginalPost(post: LearningPost) {
    if (post.postUrl) {
      window.open(post.postUrl, '_blank', 'noopener,noreferrer');
    }
  }

  async function viewSimilarPosts(post: LearningPost) {
    try {
      const result = await listGalleryPosts({
        page: 1,
        pageSize: 12,
        platform: post.platform === '小红书' ? 'xiaohongshu' : 'douyin',
        postType: post.postType,
      });
      if (result.items.length > 0) {
        // 打开画廊页面查看同类作品
        const params = new URLSearchParams({
          platform: post.platform === '小红书' ? '小红书' : '抖音',
          postType: post.postType || '',
        });
        window.location.href = `/operation/gallery?${params.toString()}`;
      } else {
        message.info('暂无同类作品');
      }
    } catch {
      message.error('查看同类作品失败');
    }
  }

  async function viewPostDetail(post: LearningPost) {
    setDetailVisible(true);
    setDetailLoading(true);
    try {
      const detail = await getPostDetail(post.id);
      setSelectedPost(detail);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '作品详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }

  // 优秀作品榜列配置
  const postColumns = useMemo(() => [
    {
      title: '排名',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: '作品',
      width: 280,
      render: (_: unknown, record: LearningPost) => (
        <Space direction="vertical" size={4}>
          <Typography.Text strong ellipsis style={{ maxWidth: 260 }}>
            {record.title}
          </Typography.Text>
          <Space wrap>
            <Tag color={record.platform.includes('抖') ? 'blue' : 'red'}>{record.platform}</Tag>
            <Tag>{record.postType || '未分类'}</Tag>
          </Space>
          {record.copywriting && (
            <Typography.Paragraph
              type="secondary"
              ellipsis={{ rows: 2 }}
              style={{ marginBottom: 0, fontSize: 12 }}
            >
              {record.copywriting}
            </Typography.Paragraph>
          )}
        </Space>
      ),
    },
    {
      title: '封面',
      width: 100,
      render: (_: unknown, record: LearningPost) =>
        record.coverImageUrl ? (
          <Image
            src={record.coverImageUrl}
            alt={record.title}
            width={80}
            height={60}
            style={{ objectFit: 'cover', borderRadius: 4 }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无封面" />
        ),
    },
    {
      title: '互动指标',
      width: 180,
      render: (_: unknown, record: LearningPost) => (
        <Space wrap size={[4, 4]}>
          <Tag icon={<LikeOutlined />}>赞 {record.likes}</Tag>
          <Tag icon={<CommentOutlined />}>评 {record.comments}</Tag>
          <Tag icon={<HeartOutlined />}>藏 {record.favorites}</Tag>
          <Tag icon={<BlockOutlined />}>转 {record.shares}</Tag>
        </Space>
      ),
    },
    {
      title: '客资数',
      width: 80,
      render: (_: unknown, record: LearningPost) => (
        <Typography.Text strong type="success">{record.leadsCount}</Typography.Text>
      ),
    },
    {
      title: '账号/运营',
      width: 140,
      render: (_: unknown, record: LearningPost) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>{record.accountName || '未知账号'}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.employeeName || '未知运营'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 200,
      render: (_: unknown, record: LearningPost) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewPostDetail(record)}>
            详情
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => openOriginalPost(record)} disabled={!record.postUrl}>
            原帖
          </Button>
          <Button size="small" icon={<AppstoreOutlined />} onClick={() => viewSimilarPosts(record)}>
            同类
          </Button>
          <Button
            size="small"
            type={record.isFavorited ? 'primary' : 'default'}
            icon={<HeartOutlined />}
            onClick={() => toggleFavorite(record)}
          >
            {record.isFavorited ? '已收藏' : '收藏'}
          </Button>
        </Space>
      ),
    },
  ], []);

  // 优秀账号榜列配置
  const accountColumns = useMemo(() => [
    {
      title: '排名',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      width: 160,
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 100,
      render: (platform: string) => (
        <Tag color={platform.includes('抖') ? 'blue' : 'red'}>{platform}</Tag>
      ),
    },
    {
      title: '所属运营',
      dataIndex: 'employeeName',
      width: 120,
      render: (name: string) => name || '-',
    },
    {
      title: '发帖数',
      dataIndex: 'postCount',
      width: 100,
      sorter: (a: AccountStat, b: AccountStat) => a.postCount - b.postCount,
    },
    {
      title: '客资数',
      dataIndex: 'leadsCount',
      width: 100,
      sorter: (a: AccountStat, b: AccountStat) => a.leadsCount - b.leadsCount,
      render: (val: number) => <Typography.Text strong type="success">{val}</Typography.Text>,
    },
    {
      title: '平均客资/作品',
      dataIndex: 'avgLeadsPerPost',
      width: 130,
      sorter: (a: AccountStat, b: AccountStat) => a.avgLeadsPerPost - b.avgLeadsPerPost,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: '最高获客作品',
      width: 200,
      render: (_: unknown, record: AccountStat) =>
        record.topPostTitle ? (
          <Space direction="vertical" size={0}>
            <Typography.Text ellipsis style={{ maxWidth: 180 }}>
              {record.topPostTitle}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              客资: {record.topPostLeads}
            </Typography.Text>
          </Space>
        ) : (
          '-'
        ),
    },
  ], []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>学习榜单</Typography.Title>
          <Typography.Paragraph type="secondary">
            浏览优秀作品和账号，学习获客技巧和内容策略。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            options={PERIOD_OPTIONS}
            value={period}
            onChange={(val) => changePeriod(val as StudyPeriod)}
          />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出
          </Button>
        </Space>
      </div>

      {/* 主管点评入口 - 占位 */}
      <Alert
        type="info"
        showIcon
        message="主管点评"
        description="运营主管可在此处添加优秀作品点评，帮助团队学习。"
        action={
          <Button size="small" disabled>
            敬请期待
          </Button>
        }
      />

      {error ? (
        <Alert type="warning" showIcon message="学习榜单暂不可用" description={error} />
      ) : (
        <Card loading={loading}>
          <Tabs
            activeKey={tab}
            onChange={(key) => setTab(key as StudyTab)}
            items={TAB_OPTIONS}
            onTabClick={() => {}}
          />
          {tab === 'posts' ? (
            <>
              <Table
                rowKey="id"
                columns={postColumns}
                dataSource={posts}
                pagination={false}
                scroll={{ x: 1000 }}
                locale={{ emptyText: <Empty description="暂无优秀作品" /> }}
              />
              <Pagination
                total={posts.length}
                pageSize={20}
                style={{ marginTop: 16, textAlign: 'right' }}
              />
            </>
          ) : (
            <>
              <Table
                rowKey="accountId"
                columns={accountColumns}
                dataSource={accounts}
                pagination={false}
                locale={{ emptyText: <Empty description="暂无账号数据" /> }}
              />
              <Pagination
                total={accounts.length}
                pageSize={20}
                style={{ marginTop: 16, textAlign: 'right' }}
              />
            </>
          )}
        </Card>
      )}

      {/* 作品详情弹窗 */}
      <Modal
        title="作品详情"
        open={detailVisible}
        onCancel={() => {
          setDetailVisible(false);
          setSelectedPost(null);
        }}
        footer={null}
        width={800}
      >
        {detailLoading ? (
          <Typography.Text type="secondary">加载中...</Typography.Text>
        ) : selectedPost ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {selectedPost.coverImageUrl && (
              <img
                src={selectedPost.coverImageUrl}
                alt={selectedPost.title}
                style={{ width: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8 }}
              />
            )}
            <Typography.Title level={4}>{selectedPost.title}</Typography.Title>
            <Space wrap>
              <Tag color={selectedPost.platform.includes('抖') ? 'blue' : 'red'}>
                {selectedPost.platform}
              </Tag>
              <Tag>{selectedPost.postType || '未分类'}</Tag>
              {selectedPost.publishedAt && (
                <Typography.Text type="secondary">
                  发布时间: {selectedPost.publishedAt}
                </Typography.Text>
              )}
            </Space>
            {selectedPost.copywriting && (
              <Typography.Paragraph>{selectedPost.copywriting}</Typography.Paragraph>
            )}
            <Row gutter={16}>
              <Col span={6}>
                <Typography.Text type="secondary">点赞</Typography.Text>
                <Typography.Text strong style={{ display: 'block', fontSize: 18 }}>
                  {selectedPost.metrics.likes}
                </Typography.Text>
              </Col>
              <Col span={6}>
                <Typography.Text type="secondary">评论</Typography.Text>
                <Typography.Text strong style={{ display: 'block', fontSize: 18 }}>
                  {selectedPost.metrics.comments}
                </Typography.Text>
              </Col>
              <Col span={6}>
                <Typography.Text type="secondary">收藏</Typography.Text>
                <Typography.Text strong style={{ display: 'block', fontSize: 18 }}>
                  {selectedPost.metrics.favorites}
                </Typography.Text>
              </Col>
              <Col span={6}>
                <Typography.Text type="secondary">客资</Typography.Text>
                <Typography.Text strong type="success" style={{ display: 'block', fontSize: 18 }}>
                  {selectedPost.metrics.leadsCount}
                </Typography.Text>
              </Col>
            </Row>
            <Space>
              {selectedPost.postUrl && (
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={() => window.open(selectedPost!.postUrl, '_blank', 'noopener,noreferrer')}
                >
                  打开原帖
                </Button>
              )}
              <Button
                icon={<HeartOutlined />}
                type={selectedPost.isFavorited ? 'primary' : 'default'}
                onClick={async () => {
                  if (!selectedPost) return;
                  try {
                    const result = await togglePostFavorite(selectedPost.id);
                    setSelectedPost((prev: ContentPost | null) => prev ? { ...prev, isFavorited: result.isFavorited } : null);
                    message.success(result.isFavorited ? '已收藏' : '已取消收藏');
                  } catch {
                    message.error('操作失败');
                  }
                }}
              >
                {selectedPost.isFavorited ? '已收藏' : '收藏学习'}
              </Button>
            </Space>
          </Space>
        ) : (
          <Typography.Text type="secondary">暂无数据</Typography.Text>
        )}
      </Modal>
    </Space>
  );
}
