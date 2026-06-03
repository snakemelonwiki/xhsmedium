'use client';

import {
  CalendarOutlined,
  ReloadOutlined,
  TrophyOutlined,
  LineChartOutlined,
  RiseOutlined,
  FireOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  List,
  Row,
  Segmented,
  Space,
  Statistic,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

// ============ 类型定义 ============

type Period = 'today' | 'week' | 'month' | 'all';

type Overview = {
  postCount: number;
  leadCount: number;
  likes: number;
  activeAccountCount: number;
  accountCount: number;
  leadPostCount: number;
  nonLeadPostCount: number;
};

type AccountRanking = {
  accountId: string;
  accountName: string;
  postCount: number;
  leadPostCount: number;
  nonLeadPostCount: number;
  likes: number;
  leadCount: number;
  leadsPerPost: number;
};

type TrafficPost = {
  id: string;
  title: string;
  accountId: string;
  likes: number;
  postType: string;
};

type AccountCalendar = {
  date: string;
  accountId: string;
  accountName: string;
  postType: string;
  count: number;
};

type PersonalDashboardData = {
  period: { from: string; to: string };
  employeeId: string;
  overview: Overview;
  rankings: {
    leadAccounts: AccountRanking[];
    efficiencyAccounts: AccountRanking[];
    trafficPosts: TrafficPost[];
    nonLeadPostAccounts: AccountRanking[];
  };
  accountCalendar: AccountCalendar[];
};

type PersonalDashboardBoardProps = {
  employeeId?: string; // 不传时查当前运营，传 id 时查指定员工（主管查看员工）
  onAddSuggestion?: (type: 'account' | 'post', id: string) => void; // 主管可添加建议
  showRefreshButton?: boolean;
};

// ============ API 函数 ============

async function fetchPersonalDashboard(employeeId: string | undefined, from: string, to: string): Promise<PersonalDashboardData> {
  const path = employeeId
    ? `/dashboard/supervisor/employee/${encodeURIComponent(employeeId)}`
    : '/dashboard/personal';
  return apiClient.get<PersonalDashboardData>(path, {
    query: { from, to },
  });
}

function resolvePeriodRange(period: Period): { from: string; to: string } {
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
    case 'all':
    default:
      return { from: '1970-01-01', to: today };
  }
}

// ============ 组件 ============

function periodLabel(p: Period): string {
  const map: Record<Period, string> = {
    today: '今日',
    week: '本周',
    month: '本月',
    all: '累计',
  };
  return map[p];
}

function postTypeColor(type?: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('获客') || t.includes('营销')) return 'green';
  if (t.includes('话题')) return 'blue';
  if (t.includes('素人')) return 'orange';
  return 'default';
}

function renderCalendarView(calendar: AccountCalendar[]) {
  // 按日期分组，构建一个简易日历热力图
  const byDate = new Map<string, { accounts: AccountCalendar[]; total: number }>();
  for (const entry of calendar) {
    const day = entry.date?.slice(0, 10) || '';
    if (!day) continue;
    if (!byDate.has(day)) byDate.set(day, { accounts: [], total: 0 });
    const bucket = byDate.get(day)!;
    bucket.accounts.push(entry);
    bucket.total += entry.count;
  }

  const sortedDays = Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 30); // 最多展示 30 天

  if (sortedDays.length === 0) {
    return <Empty description="暂无账号日历数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <List
      size="small"
      dataSource={sortedDays}
      renderItem={([date, { accounts, total }]) => (
        <List.Item style={{ padding: '6px 0' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Typography.Text style={{ minWidth: 90, fontFamily: 'monospace' }}>
              {date}
            </Typography.Text>
            <Space size={4} wrap>
              {accounts.slice(0, 6).map((a) => (
                <Tag key={a.accountId} color={postTypeColor(a.postType)} style={{ margin: 0 }}>
                  {a.accountName} x{a.count}
                </Tag>
              ))}
              {accounts.length > 6 && (
                <Tag style={{ margin: 0 }}>+{accounts.length - 6}个账号</Tag>
              )}
            </Space>
            <Typography.Text strong style={{ minWidth: 40, textAlign: 'right' }}>
              {total}
            </Typography.Text>
          </Space>
        </List.Item>
      )}
    />
  );
}

function renderRankingTable(
  type: 'lead' | 'efficiency' | 'traffic' | 'nonLead',
  data: PersonalDashboardData['rankings'],
) {
  let items: Array<Record<string, unknown>> = [];
  let columns: Array<{ title: string; dataIndex: string; width?: number; render?: (v: unknown, r: Record<string, unknown>) => React.ReactNode }> = [];

  switch (type) {
    case 'lead':
      items = data.leadAccounts;
      columns = [
        { title: '账号', dataIndex: 'accountName' },
        { title: '作品数', dataIndex: 'postCount', width: 80 },
        { title: '客资数', dataIndex: 'leadCount', width: 80 },
      ];
      break;
    case 'efficiency':
      items = data.efficiencyAccounts;
      columns = [
        { title: '账号', dataIndex: 'accountName' },
        { title: '作品数', dataIndex: 'postCount', width: 80 },
        { title: '客资数', dataIndex: 'leadCount', width: 80 },
        { title: '效率(客/作品)', dataIndex: 'leadsPerPost', width: 120, render: (v: unknown) => Number(v).toFixed(2) },
      ];
      break;
    case 'traffic':
      items = data.trafficPosts as unknown as Array<Record<string, unknown>>;
      columns = [
        { title: '作品', dataIndex: 'title', render: (v: unknown, r: Record<string, unknown>) => <Typography.Text ellipsis style={{ maxWidth: 200 }}>{String(v)}</Typography.Text> },
        { title: '账号', dataIndex: 'accountId', width: 120 },
        { title: '点赞数', dataIndex: 'likes', width: 80 },
      ];
      break;
    case 'nonLead':
      items = data.nonLeadPostAccounts;
      columns = [
        { title: '账号', dataIndex: 'accountName' },
        { title: '非获客贴数', dataIndex: 'nonLeadPostCount', width: 100 },
      ];
      break;
  }

  if (items.length === 0) {
    return <Empty description="暂无榜单数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <List
      size="small"
      dataSource={items.slice(0, 10)}
      renderItem={(item, index) => (
        <List.Item style={{ padding: '4px 0' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <Typography.Text type="secondary" style={{ minWidth: 24 }}>{index + 1}.</Typography.Text>
              {columns.map((col) => (
                <Typography.Text key={col.dataIndex} ellipsis style={{ minWidth: col.width }}>
                  {col.render ? col.render(item[col.dataIndex], item) : String(item[col.dataIndex] ?? '-')}
                </Typography.Text>
              ))}
            </Space>
          </Space>
        </List.Item>
      )}
    />
  );
}

export function PersonalDashboardBoard({ employeeId, showRefreshButton = true }: PersonalDashboardBoardProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<PersonalDashboardData>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const range = resolvePeriodRange(period);
      const result = await fetchPersonalDashboard(employeeId, range.from, range.to);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
      setData(undefined);
    } finally {
      setLoading(false);
    }
  }, [employeeId, period]);

  useEffect(() => {
    void load();
  }, [load]);

  const ov = data?.overview;

  const statCards = [
    { title: '本月作品数', value: ov?.postCount ?? 0, icon: <FireOutlined />, color: '#1890ff' },
    { title: '本月客资数', value: ov?.leadCount ?? 0, icon: <TrophyOutlined />, color: '#52c41a' },
    { title: '本月点赞数', value: ov?.likes ?? 0, icon: <RiseOutlined />, color: '#fa8c16' },
    { title: '有效账号数', value: ov?.activeAccountCount ?? 0, icon: <LineChartOutlined />, color: '#722ed1' },
    { title: '获客贴数', value: ov?.leadPostCount ?? 0, icon: <TrophyOutlined />, color: '#13c2c2' },
    { title: '非获客贴数', value: ov?.nonLeadPostCount ?? 0, icon: <CalendarOutlined />, color: '#eb2f96' },
  ];

  const tabItems = [
    {
      key: 'lead',
      label: '获客数榜',
      children: data ? renderRankingTable('lead', data.rankings) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
    },
    {
      key: 'efficiency',
      label: '获客效率榜',
      children: data ? renderRankingTable('efficiency', data.rankings) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
    },
    {
      key: 'traffic',
      label: '流量榜',
      children: data ? renderRankingTable('traffic', data.rankings) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
    },
    {
      key: 'nonLead',
      label: '非获客贴数榜',
      children: data ? renderRankingTable('nonLead', data.rankings) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
    },
    {
      key: 'calendar',
      label: '账号日历',
      children: data ? renderCalendarView(data.accountCalendar) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 顶部工具栏 */}
      <Card size="small">
        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
          <Segmented
            value={period}
            onChange={(v) => setPeriod(v as Period)}
            options={(['today', 'week', 'month', 'all'] as Period[]).map((p) => ({
              label: periodLabel(p),
              value: p,
            }))}
          />
          {showRefreshButton && (
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
          )}
        </Space>
      </Card>

      {/* 错误提示 */}
      {error ? <Alert type="warning" showIcon message="看板数据暂不可用" description={error} /> : null}

      {/* 6 个统计卡片 */}
      <Row gutter={12}>
        {statCards.map((card) => (
          <Col key={card.title} span={4}>
            <Card size="small" loading={loading}>
              <Statistic
                title={card.title}
                value={card.value}
                valueStyle={{ color: card.color, fontSize: 20 }}
                suffix={<span style={{ fontSize: 14, color: '#888' }}>条</span>}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* 榜单 Tabs */}
      <Card>
        <Tabs items={tabItems} />
      </Card>
    </Space>
  );
}
