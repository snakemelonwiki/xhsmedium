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
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { apiClient } from '@/shared/api/apiClient';
import { getPostDetail, togglePostFavorite } from '@/shared/api/content';
import type { ContentPost } from '@/shared/types/content';

type StudyPeriod = '7' | '14' | '30';
type StudyTab = 'posts' | 'accounts' | 'picks';
/** v1.3 OP-8：学习榜单维度切换 */
type StudyDimension = 'traffic' | 'leads' | 'composite';

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
  /** OP-8 维度分值（仅在调用 learning-board 时存在） */
  trafficScore?: number;
  compositeScore?: number;
  score?: number;
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
  /** 维度切换支持：基于 traffic / leads / composite 计算的得分 */
  score: number;
  topPostId?: string;
  topPostTitle?: string;
  topPostLeads?: number;
}

const PERIOD_OPTIONS = [
  { label: '近 7 天', value: '7' },
  { label: '近 14 天', value: '14' },
  { label: '近 30 天', value: '30' },
];

/** v1.3 OP-8：维度切换器 */
const DIMENSION_OPTIONS: Array<{ label: string; value: StudyDimension }> = [
  { label: '流量优先', value: 'traffic' },
  { label: '客资优先', value: 'leads' },
  { label: '综合', value: 'composite' },
];

const TAB_OPTIONS: TabsProps['items'] = [
  { key: 'posts', label: '优秀作品榜', icon: <StarOutlined /> },
  { key: 'accounts', label: '优秀账号榜', icon: <AppstoreOutlined /> },
  /** v1.3 OP-10：主管推荐板块 */
  { key: 'picks', label: '主管推荐', icon: <StarOutlined /> },
];

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** v1.3 OP-8：根据维度计算作品得分 */
function scoreForDimension(
  record: LearningPost,
  dimension: StudyDimension,
): number {
  if (dimension === 'traffic') {
    return numberValue(record.trafficScore ?? record.likes + record.comments + record.favorites);
  }
  if (dimension === 'leads') {
    return numberValue(record.leadsCount);
  }
  return numberValue(record.compositeScore ?? record.trafficScore ?? 0) + numberValue(record.leadsCount) * 50;
}

function mapLearningPost(raw: Record<string, unknown>): LearningPost {
  const likes = numberValue(raw.likes);
  const comments = numberValue(raw.comments);
  const favorites = numberValue(raw.favorites);
  const leadsCount = numberValue(raw.leadsCount ?? raw.leadCount ?? raw.leads_count);
  const trafficScore = numberValue(raw.trafficScore ?? raw.traffic_score ?? likes + comments + favorites);
  const compositeScore = numberValue(raw.compositeScore ?? raw.composite_score ?? trafficScore + leadsCount * 50);
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
    likes,
    comments,
    favorites,
    shares: numberValue(raw.shares),
    traffic: numberValue(raw.traffic),
    leadCount: leadsCount,
    leadsCount,
    publishedAt: String(raw.publishedAt ?? raw.published_at ?? ''),
    isFavorited: Boolean(raw.isFavorited ?? raw.is_favorited),
    trafficScore,
    compositeScore,
    score: numberValue(raw.score),
  };
}

export default function StudyRankingsPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<StudyPeriod>('7');
  const [dimension, setDimension] = useState<StudyDimension>('composite');
  const [tab, setTab] = useState<StudyTab>('posts');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [posts, setPosts] = useState<LearningPost[]>([]);
  const [accounts, setAccounts] = useState<AccountStat[]>([]);
  const [picks, setPicks] = useState<LearningPost[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [picksError, setPicksError] = useState<string>();
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  /**
   * v1.3 OP-8: 拉取学习榜单数据。
   * 主路径：GET /api/posts/learning-board?dimension=...&days=...
   * 该接口已包含 trafficScore / leadsCount / compositeScore 字段，
   * 前端按 dimension 排序即可。
   */
  const loadPosts = useCallback(async (days: number, dim: StudyDimension) => {
    setLoading(true);
    setError(undefined);
    try {
      const payload = await apiClient.get<{ items?: LearningPost[]; dimension?: string }>('/posts/learning-board', {
        query: { dimension: dim, days, limit: 30 },
      });
      const rawRows: unknown[] = Array.isArray(payload?.items) ? (payload.items as unknown[]) : [];
      const rows = rawRows.map((item) => mapLearningPost(item as Record<string, unknown>));
      setPosts(rows);
      // 客户端二次按 dimension 排序，确保前端切换维度即时生效
      setPosts((prev) => [...prev].sort((a, b) => scoreForDimension(b, dim) - scoreForDimension(a, dim)));
      aggregateAccounts(rawRows, dim);
    } catch (err) {
      // 回退到旧版 /rankings/learning-posts（保持可用性）
      try {
        const fallback = await apiClient.get<unknown[]>('/rankings/learning-posts', {
          query: { days },
        });
        const rawRows: unknown[] = Array.isArray(fallback) ? fallback : [];
        const rows = rawRows.map((item) => mapLearningPost(item as Record<string, unknown>));
        setPosts(rows);
        setPosts((prev) => [...prev].sort((a, b) => scoreForDimension(b, dim) - scoreForDimension(a, dim)));
        aggregateAccounts(rawRows, dim);
      } catch (err2) {
        setPosts([]);
        setAccounts([]);
        setError(err2 instanceof Error ? err2.message : '学习榜单加载失败');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * v1.3 OP-10: 加载主管推荐板块（GET /api/posts/supervisor-picks）
   */
  const loadPicks = useCallback(async (limit: number = 30) => {
    setPicksLoading(true);
    setPicksError(undefined);
    try {
      const payload = await apiClient.get<{ items?: unknown[] }>('/posts/supervisor-picks', {
        query: { limit },
      });
      const rows = Array.isArray(payload?.items) ? payload.items : [];
      setPicks(rows.map((item) => mapLearningPost(item as Record<string, unknown>)));
    } catch (err) {
      setPicks([]);
      setPicksError(err instanceof Error ? err.message : '主管推荐加载失败');
    } finally {
      setPicksLoading(false);
    }
  }, []);

  /**
   * v1.3 OP-8: 按账号聚合统计。账号榜单的排序口径根据当前 dimension 切换：
   * - traffic: 账号下所有作品的 likes+comments+favorites 之和
   * - leads:   账号下所有作品的 leadsCount 之和
   * - composite: 综合分
   */
  function aggregateAccounts(rows: unknown[], dim: StudyDimension) {
    const accountMap = new Map<string, AccountStat>();
    for (const rowRaw of rows) {
      const row = rowRaw as Record<string, unknown>;
      const accountId = String(row.accountId ?? row.account_id ?? '');
      const accountName = String(row.accountName ?? row.account_name ?? '');
      const platform = String(row.platform ?? '');
      const employeeId = String(row.employeeId ?? row.employee_id ?? '');
      const employeeName = String(row.employeeName ?? raw_employee_name(row) ?? '');
      const leadsCount = numberValue(row.leadsCount ?? row.leadCount ?? row.leads_count);
      const trafficScore = numberValue(row.trafficScore ?? row.traffic_score ?? (numberValue(row.likes) + numberValue(row.comments) + numberValue(row.favorites)));
      const compositeScore = numberValue(row.compositeScore ?? row.composite_score ?? trafficScore + leadsCount * 50);
      const title = String(row.title ?? '');
      const postId = String(row.id ?? '');

      if (!accountId) continue;

      const scoreForRow = dim === 'traffic' ? trafficScore : dim === 'leads' ? leadsCount : compositeScore;

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
          score: 0,
          topPostId: postId,
          topPostTitle: title,
          topPostLeads: leadsCount,
        });
      }
      const stat = accountMap.get(accountId)!;
      stat.postCount++;
      stat.leadsCount += leadsCount;
      stat.score += scoreForRow;
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
    setAccounts(
      Array.from(accountMap.values()).sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.leadsCount !== a.leadsCount) return b.leadsCount - a.leadsCount;
        return b.postCount - a.postCount;
      }),
    );
  }

  useEffect(() => {
    void loadPosts(Number(period), dimension);
  }, [period, dimension, loadPosts]);

  useEffect(() => {
    void loadPicks(30);
  }, [loadPicks]);

  function changePeriod(nextPeriod: StudyPeriod) {
    setPeriod(nextPeriod);
  }

  function changeDimension(nextDim: StudyDimension) {
    setDimension(nextDim);
  }

  async function handleExport() {
    setExporting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const result = await createExport({
        exportType: 'rankings',
        filter: { type: 'study', period: `${period}d`, dimension },
      });

      if (!result?.id) {
        hide();
        message.warning('导出任务已创建，请在导出中心查看进度');
        return;
      }

      // 轮询导出状态，最多等待30秒
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);
        if (exportTask.status === 'completed' || exportTask.status === 'success') {
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
          item.id === post.id ? { ...item, isFavorited: result.isFavorited } : item,
        ),
      );
      setPicks((current) =>
        current.map((item) =>
          item.id === post.id ? { ...item, isFavorited: result.isFavorited } : item,
        ),
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

  /**
   * v1.3 OP-9: 跳转到指定账号的全部作品列表（复用作品广场按账号筛选）。
   * 走 /operation/posts?accountId=... 路由，运营端可按账号过滤作品。
   */
  function viewAccountPosts(post: LearningPost) {
    if (!post.accountId) {
      message.warning('该作品未关联账号');
      return;
    }
    router.push(`/operation/posts?accountId=${encodeURIComponent(post.accountId)}`);
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
  const postColumns: ColumnsType<LearningPost> = useMemo(() => [
    {
      title: '排名',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: dimension === 'leads' ? '客资数' : dimension === 'traffic' ? '流量' : '综合分',
      width: 100,
      render: (_: unknown, record: LearningPost) => (
        <Typography.Text strong type={dimension === 'leads' ? 'success' : 'warning'}>
          {scoreForDimension(record, dimension)}
        </Typography.Text>
      ),
    },
    {
      title: '作品',
      width: 240,
      render: (_: unknown, record: LearningPost) => (
        <Space direction="vertical" size={4}>
          <Typography.Text strong ellipsis style={{ maxWidth: 220 }}>
            {record.title}
          </Typography.Text>
          <Space wrap>
            <Tag color={record.platform.includes('抖') ? 'blue' : 'red'}>{record.platform}</Tag>
            <Tag>{record.postType || '未分类'}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '封面',
      width: 90,
      render: (_: unknown, record: LearningPost) =>
        record.coverImageUrl ? (
          <Image
            src={record.coverImageUrl}
            alt={record.title}
            width={72}
            height={54}
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
      width: 240,
      render: (_: unknown, record: LearningPost) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewPostDetail(record)}>
            详情
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => openOriginalPost(record)} disabled={!record.postUrl}>
            原帖
          </Button>
          {/** v1.3 OP-9: 替换原"查看同类作品"按钮，改为"查看账号" */}
          <Button size="small" icon={<AppstoreOutlined />} onClick={() => viewAccountPosts(record)} disabled={!record.accountId}>
            查看账号
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
  ], [dimension, router]);

  // 优秀账号榜列配置
  const accountColumns: ColumnsType<AccountStat> = useMemo(() => [
    {
      title: '排名',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: dimension === 'leads' ? '客资数' : dimension === 'traffic' ? '流量' : '综合分',
      dataIndex: 'score',
      width: 100,
      sorter: (a: AccountStat, b: AccountStat) => a.score - b.score,
      render: (val: number) => (
        <Typography.Text strong type={dimension === 'leads' ? 'success' : 'warning'}>
          {val}
        </Typography.Text>
      ),
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      width: 160,
      render: (name: string, record: AccountStat) => (
        <Button type="link" size="small" onClick={() => router.push(`/operation/posts?accountId=${encodeURIComponent(record.accountId)}`)}>
          {name}
        </Button>
      ),
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
  ], [dimension, router]);

  // 主管推荐板块列配置（v1.3 OP-10）
  const pickColumns: ColumnsType<LearningPost> = useMemo(() => [
    {
      title: '排名',
      width: 70,
      render: (_: unknown, __: unknown, index: number) => index + 1,
    },
    {
      title: '作品',
      width: 240,
      render: (_: unknown, record: LearningPost) => (
        <Space direction="vertical" size={4}>
          <Typography.Text strong ellipsis style={{ maxWidth: 220 }}>
            {record.title}
          </Typography.Text>
          <Space wrap>
            <Tag color="gold">主管推荐</Tag>
            <Tag color={record.platform.includes('抖') ? 'blue' : 'red'}>{record.platform}</Tag>
            <Tag>{record.postType || '未分类'}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: '封面',
      width: 90,
      render: (_: unknown, record: LearningPost) =>
        record.coverImageUrl ? (
          <Image
            src={record.coverImageUrl}
            alt={record.title}
            width={72}
            height={54}
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
      width: 240,
      render: (_: unknown, record: LearningPost) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewPostDetail(record)}>
            详情
          </Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => openOriginalPost(record)} disabled={!record.postUrl}>
            原帖
          </Button>
          <Button size="small" icon={<AppstoreOutlined />} onClick={() => viewAccountPosts(record)} disabled={!record.accountId}>
            查看账号
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
  ], [router]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>学习榜单</Typography.Title>
          <Typography.Paragraph type="secondary">
            浏览优秀作品、账号与主管推荐，学习获客技巧和内容策略。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          {/** v1.3 OP-8: 维度切换器（流量优先 / 客资优先 / 综合） */}
          <Segmented
            options={DIMENSION_OPTIONS}
            value={dimension}
            onChange={(val) => changeDimension(val as StudyDimension)}
          />
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
                scroll={{ x: 1100 }}
                locale={{ emptyText: <Empty description="暂无优秀作品" /> }}
              />
              <Pagination
                total={posts.length}
                pageSize={20}
                style={{ marginTop: 16, textAlign: 'right' }}
              />
            </>
          ) : tab === 'accounts' ? (
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
          ) : (
            /** v1.3 OP-10: 主管推荐板块 */
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {picksError ? (
                <Alert type="warning" showIcon message="主管推荐暂不可用" description={picksError} />
              ) : null}
              <Table
                rowKey="id"
                loading={picksLoading}
                columns={pickColumns}
                dataSource={picks}
                pagination={false}
                scroll={{ x: 1100 }}
                locale={{ emptyText: <Empty description="暂无主管推荐作品" /> }}
              />
              <Pagination
                total={picks.length}
                pageSize={20}
                style={{ marginTop: 16, textAlign: 'right' }}
              />
            </Space>
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

/** 内部小工具：处理 raw 字段映射里的 employee_name 回退 */
function raw_employee_name(row: Record<string, unknown>): string {
  return String(row.employeeName ?? row.employee_name ?? '');
}
