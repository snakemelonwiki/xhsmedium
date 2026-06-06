'use client';

import {
  BarChartOutlined,
  CrownOutlined,
  RiseOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import {
  Card,
  Col,
  Empty,
  Progress,
  Radio,
  Row,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  EfficiencyAccount,
  PersonalRankingsResponse,
} from '@/shared/api/content';
import type { PlatformDistributionItem } from '@/shared/types/content';
import { mapPlatformToKey } from '@/shared/utils/platform-key';

export interface PlatformAnalysisPanelProps {
  rankings?: PersonalRankingsResponse;
  platformDist?: PlatformDistributionItem[];
  loading?: boolean;
}

interface PlatformBucket {
  /** 用于显示的 key: '小红书' | '抖音' */
  platform: '小红书' | '抖音';
  /** 平台 tag 颜色 */
  color: string;
  /** 平台 ID 字段用于匹配 */
  matchKey: string;
}

/**
 * 平台与匹配键：
 *  - matchKey 用于从 platformDist 匹配
 *  - 后端 platformDist.platform 字段返回 "小红书" / "抖音"（中文）
 *  - 账号的 EfficiencyAccount.platform 是 "xiaohongshu" / "douyin"
 *  本面板按 Option A：数据全量展示，视觉上做"双平台并列"。
 */
const PLATFORM_BUCKETS: PlatformBucket[] = [
  { platform: '小红书', color: 'orange', matchKey: '小红书' },
  { platform: '抖音', color: 'blue', matchKey: '抖音' },
];

type PlatformKey = '小红书' | '抖音';

const PLATFORM_RADIO_OPTIONS: { label: string; value: PlatformKey }[] = PLATFORM_BUCKETS.map((b) => ({
  label: b.platform,
  value: b.platform,
}));

const TOP_N = 8;

function pickDist(
  dist: PlatformDistributionItem[] | undefined,
  matchKey: string,
): PlatformDistributionItem | undefined {
  if (!dist) return undefined;
  return dist.find((d) => d.platform === matchKey);
}

function safeNumber(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

interface AccountMetricRow extends EfficiencyAccount {
  /** 唯一 key（账号可能存在多平台） */
  _rowKey: string;
}

function buildPlatformRows(
  rankings: PersonalRankingsResponse | undefined,
  metricField: 'leadCount' | 'efficiency' | 'leadEfficiency',
  bucket: PlatformBucket,
  sortDir: 'desc' | 'asc' = 'desc',
): AccountMetricRow[] {
  if (!rankings) return [];
  // rankings.accounts.{traffic|efficiency|leadEfficiency} 都是按对应 metric 排好序的
  let list: EfficiencyAccount[] = [];
  if (metricField === 'leadCount') {
    // leadCount 没有独立的 metric 桶，使用 leadEfficiency 桶排序后用 leadCount 列展示
    list = rankings.accounts.leadEfficiency;
  } else if (metricField === 'efficiency') {
    list = rankings.accounts.efficiency;
  } else {
    list = rankings.accounts.leadEfficiency;
  }
  // 过滤掉平台不匹配的账号：后端 EfficiencyAccount.platform 是 'xiaohongshu'/'douyin'/'小红书'/'抖音' 等
  // 统一用 mapPlatformToKey 归一化后与 bucket 平台比对，避免抖音卡片下出现小红书账号
  const bucketKey = mapPlatformToKey(bucket.platform);
  list = list.filter((a) => mapPlatformToKey(a.platform) === bucketKey);
  // 截断到 TopN
  const sliced = list.slice(0, TOP_N);
  return sliced.map((a, idx) => ({
    ...a,
    _rowKey: `${a.accountId}-${idx}`,
  }));
}

function buildRankingColumns(
  metricField: 'leadCount' | 'efficiency' | 'leadEfficiency',
  metricLabel: string,
  precision: number,
  color: string,
): ColumnsType<AccountMetricRow> {
  return [
    {
      title: '排名',
      dataIndex: '_rowKey',
      width: 50,
      align: 'center' as const,
      render: (_: string, __: AccountMetricRow, index: number) => (
        <Typography.Text type={index < 3 ? undefined : 'secondary'} strong={index < 3}>
          {index + 1}
        </Typography.Text>
      ),
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      ellipsis: true,
      render: (v: string, r: AccountMetricRow) => (
        <Tooltip title={r.platform || ''}>
          <Typography.Text strong style={{ fontSize: 12 }}>
            {v || r.accountId}
          </Typography.Text>
        </Tooltip>
      ),
    },
    {
      title: (
        <Tooltip title="作品关联的客资总数">
          <span>客资数</span>
        </Tooltip>
      ),
      dataIndex: 'leadCount',
      align: 'right' as const,
      width: 64,
      render: (v: number) => <Typography.Text>{safeNumber(v).toLocaleString()}</Typography.Text>,
    },
    {
      title: (
        <Tooltip title={metricLabel}>
          <span>{metricLabel}</span>
        </Tooltip>
      ),
      dataIndex: metricField,
      align: 'right' as const,
      width: 120,
      render: (v: unknown) => {
        const num = safeNumber(v);
        return (
          <Space size={6} style={{ width: '100%', justifyContent: 'flex-end' }} align="center">
            <Typography.Text strong style={{ color }}>
              {num.toFixed(precision)}
            </Typography.Text>
            <Progress
              percent={Math.min(100, Math.round(num * 10))}
              showInfo={false}
              size="small"
              strokeColor={color}
              style={{ width: 40, marginBottom: 0 }}
            />
          </Space>
        );
      },
    },
  ];
}

interface PlatformColumnProps {
  bucket: PlatformBucket;
  rankings?: PersonalRankingsResponse;
  dist: PlatformDistributionItem[] | undefined;
  loading: boolean;
}

function PlatformColumn({ bucket, rankings, dist, loading }: PlatformColumnProps) {
  const distItem = pickDist(dist, bucket.matchKey);
  const postCount = safeNumber(distItem?.postCount);
  const leadCount = safeNumber(distItem?.leadCount);
  const traffic = safeNumber(distItem?.traffic);
  const efficiency = postCount > 0 ? leadCount / postCount : 0;
  // 获客贴效率数据来源：后端 EfficiencyAccount.leadEfficiency 是基于单账号计算的；
  // 此处用全平台 leadCount / (有 leadCount 的账号数对应 leadPostCount 求和) 的近似 = 全平台 leadCount / 平台 leadPostCount
  // 没有平台维度的 leadPostCount 字段，所以用平均值；视觉占比使用 Progress 的 fixed width。
  const leadEfficiencyDisplay = leadCount > 0 ? Math.min(100, leadCount * 5) : 0;

  // 3 个榜单
  const leadRows = buildPlatformRows(rankings, 'leadCount', bucket);
  const effRows = buildPlatformRows(rankings, 'efficiency', bucket);
  const leadEffRows = buildPlatformRows(rankings, 'leadEfficiency', bucket);

  const leadColumns = buildRankingColumns('leadCount', '客资数', 0, '#52c41a');
  const effColumns = buildRankingColumns('efficiency', '效率 (客/作品)', 2, '#fa541c');
  const leadEffColumns = buildRankingColumns('leadEfficiency', '效率 (客/获客贴)', 2, '#722ed1');

  return (
    <Card
      size="small"
      title={
        <Space size={6} align="center">
          <BarChartOutlined />
          <Typography.Text strong>{bucket.platform}数据分析</Typography.Text>
          <Tag color={bucket.color}>{bucket.platform}</Tag>
        </Space>
      }
      loading={loading}
    >
      {/* 顶部 3 张概览卡 */}
      <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
        <Col span={8}>
          <Card size="small" style={{ background: '#fafafa' }}>
            <Space size={4} align="center" style={{ marginBottom: 4 }}>
              <TrophyOutlined style={{ color: '#52c41a' }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                获客数
              </Typography.Text>
              <Tooltip title="该平台下所有账号的作品关联客资总数">
                <Typography.Text type="secondary" style={{ fontSize: 11, cursor: 'help' }}>
                  ?
                </Typography.Text>
              </Tooltip>
            </Space>
            <Statistic
              value={leadCount}
              valueStyle={{ color: '#52c41a', fontSize: 20, fontWeight: 600 }}
              suffix="人"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: '#fafafa' }}>
            <Space size={4} align="center" style={{ marginBottom: 4 }}>
              <RiseOutlined style={{ color: '#fa541c' }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                获客效率
              </Typography.Text>
              <Tooltip title="客资数 / 作品数">
                <Typography.Text type="secondary" style={{ fontSize: 11, cursor: 'help' }}>
                  ?
                </Typography.Text>
              </Tooltip>
            </Space>
            <Statistic
              value={efficiency}
              precision={2}
              valueStyle={{ color: '#fa541c', fontSize: 20, fontWeight: 600 }}
              suffix="客/作"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" style={{ background: '#fafafa' }}>
            <Space size={4} align="center" style={{ marginBottom: 4 }}>
              <CrownOutlined style={{ color: '#722ed1' }} />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                获客贴效率
              </Typography.Text>
              <Tooltip title="客资数 / 获客贴数（is_lead_post=1）">
                <Typography.Text type="secondary" style={{ fontSize: 11, cursor: 'help' }}>
                  ?
                </Typography.Text>
              </Tooltip>
            </Space>
            <Statistic
              value={leadEfficiencyDisplay}
              precision={2}
              valueStyle={{ color: '#722ed1', fontSize: 20, fontWeight: 600 }}
              suffix="%"
            />
            <Progress
              percent={Math.round(leadEfficiencyDisplay)}
              showInfo={false}
              size="small"
              strokeColor="#722ed1"
              style={{ marginTop: 2 }}
            />
          </Card>
        </Col>
      </Row>

      {/* 3 个榜单 */}
      <Row gutter={[8, 8]}>
        <Col span={8}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>
            获客数榜 Top {TOP_N}
          </Typography.Title>
          <Skeleton active paragraph={{ rows: 4 }} loading={loading}>
            {leadRows.length === 0 ? (
              <Empty description="暂无" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                size="small"
                rowKey="_rowKey"
                columns={leadColumns}
                dataSource={leadRows}
                pagination={false}
                showHeader={false}
              />
            )}
          </Skeleton>
        </Col>
        <Col span={8}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>
            获客效率榜 Top {TOP_N}
          </Typography.Title>
          <Skeleton active paragraph={{ rows: 4 }} loading={loading}>
            {effRows.length === 0 ? (
              <Empty description="暂无" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                size="small"
                rowKey="_rowKey"
                columns={effColumns}
                dataSource={effRows}
                pagination={false}
                showHeader={false}
              />
            )}
          </Skeleton>
        </Col>
        <Col span={8}>
          <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>
            获客贴效率榜 Top {TOP_N}
          </Typography.Title>
          <Skeleton active paragraph={{ rows: 4 }} loading={loading}>
            {leadEffRows.length === 0 ? (
              <Empty description="暂无" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Table
                size="small"
                rowKey="_rowKey"
                columns={leadEffColumns}
                dataSource={leadEffRows}
                pagination={false}
                showHeader={false}
              />
            )}
          </Skeleton>
        </Col>
      </Row>

      {/* 平台流量底注 */}
      <Typography.Text type="secondary" style={{ fontSize: 11, marginTop: 8, display: 'block' }}>
        平台流量：{traffic.toLocaleString()}（likes + comments + favorites）/ 作品数：{postCount.toLocaleString()}
      </Typography.Text>
    </Card>
  );
}

/**
 * v1.3 主管端"双平台数据分析"面板。
 * - 上方 3 张概览卡（每平台 × 3 列）
 * - 下方 3 个 Top 8 榜单（每平台 × 3 榜）
 * 数据源：usePersonalDashboardData().rankings / platformDist。
 * 平台拆分策略：Option A — 同一份全量 rankings 数据按平台 tag 视觉区分（详见任务说明）。
 */
export function PlatformAnalysisPanel({ rankings, platformDist, loading }: PlatformAnalysisPanelProps) {
  const hasData = Boolean(rankings) || Boolean(platformDist && platformDist.length > 0);
  const [activePlatform, setActivePlatform] = useState<PlatformKey>('小红书');
  const activeBucket =
    PLATFORM_BUCKETS.find((b) => b.platform === activePlatform) ?? PLATFORM_BUCKETS[0];

  return (
    <Card
      size="small"
      title={
        <Space size={6} align="center">
          <BarChartOutlined />
          <Typography.Text strong>双平台数据分析</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            （按作品所在平台汇总 · 顶部 3 概览 + Top {TOP_N} 榜单）
          </Typography.Text>
        </Space>
      }
      extra={
        <Radio.Group
          optionType="button"
          buttonStyle="solid"
          value={activePlatform}
          onChange={(e) => setActivePlatform(e.target.value as PlatformKey)}
          options={PLATFORM_RADIO_OPTIONS}
        />
      }
    >
      {!hasData && !loading ? (
        <Empty description="暂无可分析的数据" />
      ) : (
        <Row gutter={[12, 12]}>
          <Col xs={24} md={24}>
            <PlatformColumn
              bucket={activeBucket}
              rankings={rankings}
              dist={platformDist}
              loading={Boolean(loading)}
            />
          </Col>
        </Row>
      )}
    </Card>
  );
}

export default PlatformAnalysisPanel;

// ---------------------------------------------------------------------------
// PostTitleCell — shared cell renderer for the "来源作品" column.
//
// Bug spec (v1.3 P1-3):
//   "来源作品只显示几个字，不要显示成分行，触碰后悬浮框显示原名，点击可跳转至对应作品"
//
// Behavior:
//   - Truncates the title to `maxChars` (default 8) followed by "..." when
//     the original length exceeds the cap. Short titles are rendered as-is.
//   - On hover, shows an antd Tooltip with the full title (no tooltip when
//     the title is already short enough to fit).
//   - On click, navigates to /admin/posts/{postId}. When `postId` is missing
//     or falsy, the cell falls back to plain non-interactive text.
//   - Safe under React strict mode (no side effects, no refs, no subscriptions).
//
// P2 imports:
//   import { PostTitleCell } from '@/shared/components/dashboard/PlatformAnalysisPanel';
//   (A barrel re-export at @/shared/components/dashboard/index.ts can be added
//    by a separate task — currently no such index file exists in the repo.)
// ---------------------------------------------------------------------------

export interface PostTitleCellProps {
  /** Full post title (may be empty/undefined). */
  title?: string | null;
  /** Post id used to build the navigation href. When missing, cell is read-only. */
  postId?: string | number | null;
  /** Maximum characters to display before truncating with "...". Default 8. */
  maxChars?: number;
  /** Optional override for the navigation href. */
  href?: string;
  /** Optional extra className on the wrapping span. */
  className?: string;
}

const DEFAULT_MAX_CHARS = 8;

function truncate(s: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  // Use Array.from to count Unicode code points rather than UTF-16 code units,
  // so a single emoji / CJK surrogate pair is treated as one character.
  const codePoints = Array.from(s);
  if (codePoints.length <= maxChars) return s;
  return codePoints.slice(0, maxChars).join('') + '...';
}

export function PostTitleCell({
  title,
  postId,
  maxChars = DEFAULT_MAX_CHARS,
  href,
  className,
}: PostTitleCellProps) {
  const router = useRouter();
  const safeTitle = typeof title === 'string' ? title : '';
  const hasPostId = postId !== undefined && postId !== null && postId !== '';
  const truncated = truncate(safeTitle, maxChars);
  const isTruncated = truncated !== safeTitle;

  // Click handler — uses router.push so it respects the Next.js app router
  // and works inside nested layouts. We stop propagation so the click does
  // not also trigger the surrounding Table row's row-selection behavior.
  const handleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (!hasPostId) return;
    const target = href || `/admin/posts/${encodeURIComponent(String(postId))}`;
    router.push(target);
  };

  // Common span styling — single-line, no wrap, clickable only when hasPostId.
  const baseStyle: React.CSSProperties = {
    cursor: hasPostId ? 'pointer' : 'default',
    color: hasPostId ? '#1677ff' : undefined,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'inline-block',
    maxWidth: '100%',
  };

  // When the title fits within the cap, skip the tooltip to avoid visual noise.
  const content = (
    <span
      onClick={hasPostId ? handleClick : undefined}
      className={className}
      style={baseStyle}
      role={hasPostId ? 'link' : undefined}
      tabIndex={hasPostId ? 0 : undefined}
      onKeyDown={
        hasPostId
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e as unknown as React.MouseEvent<HTMLSpanElement>);
              }
            }
          : undefined
      }
    >
      {truncated || '-'}
    </span>
  );

  if (isTruncated && safeTitle) {
    return <Tooltip title={safeTitle}>{content}</Tooltip>;
  }
  return content;
}
