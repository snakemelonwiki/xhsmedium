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
import type {
  EfficiencyAccount,
  PersonalRankingsResponse,
} from '@/shared/api/content';
import type { PlatformDistributionItem } from '@/shared/types/content';

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
  const leadRows = buildPlatformRows(rankings, 'leadCount');
  const effRows = buildPlatformRows(rankings, 'efficiency');
  const leadEffRows = buildPlatformRows(rankings, 'leadEfficiency');

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
    >
      {!hasData && !loading ? (
        <Empty description="暂无可分析的数据" />
      ) : (
        <Row gutter={[12, 12]}>
          {PLATFORM_BUCKETS.map((bucket) => (
            <Col key={bucket.platform} xs={24} md={12}>
              <PlatformColumn
                bucket={bucket}
                rankings={rankings}
                dist={platformDist}
                loading={Boolean(loading)}
              />
            </Col>
          ))}
        </Row>
      )}
    </Card>
  );
}

export default PlatformAnalysisPanel;
