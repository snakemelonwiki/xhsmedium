'use client';

import {
  BellOutlined,
  CheckOutlined,
  DashboardOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FundProjectionScreenOutlined,
  IdcardOutlined,
  LineChartOutlined,
  OrderedListOutlined,
  PieChartOutlined,
  RiseOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TrophyOutlined,
  UserSwitchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  Badge,
  Button,
  Card,
  Col,
  Dropdown,
  Empty,
  List,
  Row,
  Segmented,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  message as antdMessage,
} from 'antd';
import dayjs from 'dayjs';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getSupervisorExtended, getSupervisorOverview, type SupervisorExtended, type SupervisorOverview } from '@/shared/api/admin';
import { listNotifications } from '@/shared/api/notifications';
import { getReminderUnreadCount, markReminderRead } from '@/shared/api/reminders';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { useEchartsChart, useEchartsRender } from '@/shared/components/dashboard/useEchartsChart';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotifications } from '@/shared/contexts/NotificationContext';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';
import type { NotificationItem } from '@/shared/types/notifications';
import { formatDateTime } from '@/shared/utils/date-format';
import { isPresetMatch } from '@/shared/utils/date-range';

// echarts 通过 layout.tsx 注入的 CDN script 暴露为 window.echarts，
// 它的加载晚于组件首次渲染，需要在 useEffect 内等 ready 后再 init，
// 避免 dev 模式 HMR 偶发丢失全局变量导致 ReferenceError。
// 参考 admin/analytics/page.tsx 的 EChart 容器实现；初始化 / dispose 已在 useEchartsChart 中集中。
// eslint-disable-next-line @typescript-eslint/no-var-requires
declare const echarts: any;

const OVERVIEW_PRESETS = [
  { key: 'today', label: '今日', unit: 'day' as const, n: 1, mode: 'calendar' as const },
  { key: 'thisWeek', label: '本周', unit: 'week' as const, n: 1, mode: 'calendar' as const },
  { key: 'thisMonth', label: '本月', unit: 'month' as const, n: 1, mode: 'calendar' as const },
];

type DataCard = {
  key: keyof Pick<SupervisorOverview, 'postCount' | 'leadCount' | 'likes' | 'effectiveAccountCount'>;
  title: string;
  icon: React.ReactNode;
  accent: string;
  description: string;
};

const DATA_CARDS: DataCard[] = [
  {
    key: 'postCount',
    title: '作品数',
    icon: <OrderedListOutlined />,
    accent: '#1677ff',
    description: '统计周期内发布的作品总数',
  },
  {
    key: 'leadCount',
    title: '客资数',
    icon: <UserSwitchOutlined />,
    accent: '#13c2c2',
    description: '统计周期内新增的客资数量',
  },
  {
    key: 'likes',
    title: '点赞数',
    icon: <FileSearchOutlined />,
    accent: '#722ed1',
    description: '统计周期内作品获得的点赞总和',
  },
  {
    key: 'effectiveAccountCount',
    title: '有效账号数',
    icon: <IdcardOutlined />,
    accent: '#eb2f96',
    description: '统计周期内有更新的账号数量',
  },
];

type ExceptionCard = {
  key: keyof SupervisorOverview['riskReminders'];
  title: string;
  icon: React.ReactNode;
  accent: string;
  href: string;
  description: string;
};

const EXCEPTION_CARDS: ExceptionCard[] = [
  {
    key: 'collaborationTimeout',
    title: '协同超时数',
    icon: <WarningOutlined />,
    accent: '#f5222d',
    href: '/admin/collaboration',
    description: '待处理协同任务中有超时风险的项',
  },
  {
    key: 'leadBacklog',
    title: '客资积压数',
    icon: <UserSwitchOutlined />,
    accent: '#fa8c16',
    href: '/admin/leads',
    description: '未成交客资中需要跟进的项',
  },
  {
    key: 'lowUpdateEmployees',
    title: '员工低更新数',
    icon: <TeamOutlined />,
    accent: '#faad14',
    href: '/admin/personal',
    description: '本周无作品更新的员工数量',
  },
  {
    key: 'abnormalAccounts',
    title: '账号异常数',
    icon: <SafetyCertificateOutlined />,
    accent: '#f5222d',
    href: '/admin/accounts',
    description: '账号状态异常需要处理的数量',
  },
];

const QUICK_ENTRIES = [
  {
    title: '员工管理',
    description: '维护员工资料、账号分配和在职状态。',
    href: '/admin/employees',
    icon: <TeamOutlined />,
  },
  {
    title: '账号管理',
    description: '管理运营账号、平台绑定与定位信息。',
    href: '/admin/accounts',
    icon: <IdcardOutlined />,
  },
  {
    title: '导出中心',
    description: '创建并下载作品、客资、排行榜和账号数据。',
    href: '/admin/exports',
    icon: <DashboardOutlined />,
  },
];

export default function AdminDashboardPage() {
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: dayjs().startOf('day'), end: dayjs() });
  const [overview, setOverview] = useState<SupervisorOverview | undefined>();
  // T1.3 总览扩展数据（7 个新区域）
  const [extended, setExtended] = useState<SupervisorExtended | undefined>();
  // 趋势图时间桶切换：日/周/月
  const [trendPeriod, setTrendPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [loading, setLoading] = useState(true);
  const [loadingExtended, setLoadingExtended] = useState(true);
  const { unreadCount } = useNotifications();
  const user = typeof window === 'undefined' ? undefined : readAuthenticatedUser();

  // v1.3 SUP-3: 主管端顶部"消息中心"（跨端口提醒）
  // - GET /api/reminders/unread-count → 红点 + 未读数
  // - /api/notifications?type=reminder → 列表
  // - PATCH /api/reminders/:id/read → 标记已读
  // - Socket.IO 监听 reminder.created（与 notification.created 复用同一通道），
  //   收到推送后立即刷新计数与列表
  const token =
    typeof window === 'undefined' ? null : window.localStorage.getItem('xhsmedium.token');
  const { onMessage: onSocketMessage } = useNotificationSocket({
    token,
    userId: user?.id ?? null,
  });
  const [reminderUnread, setReminderUnread] = useState(0);
  const [reminderItems, setReminderItems] = useState<NotificationItem[]>([]);
  const [reminderLoading, setReminderLoading] = useState(false);

  const fetchOverview = useCallback((range: DateRangeValue) => {
    setLoading(true);
    setLoadingExtended(true);
    const from = range ? range.start.format('YYYY-MM-DD') : dayjs().startOf('day').format('YYYY-MM-DD');
    const to = range ? range.end.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
    // T1.1 修复：根据当前 dateRange 反查匹配的 preset key，作为 period 上报。
    // 之前硬编码 'today' 会让 URL 失去语义、缓存命中错误，且让后端 period.code 字段始终是 'today'。
    // 自定义区间（无 preset 匹配）时退回到 'custom'，后端按 from/to 走自定义分支。
    const matched = OVERVIEW_PRESETS.find((p) => isPresetMatch(range, p.unit, p.n, p.mode));
    const period = matched ? matched.key : 'custom';
    getSupervisorOverview(period, from, to)
      .then(setOverview)
      .catch(() => setOverview(undefined))
      .finally(() => setLoading(false));
    // T1.3 同步拉取扩展数据（趋势/平台分布/三类作品占比/获客效率/获客帖效率）
    getSupervisorExtended(period, from, to, trendPeriod)
      .then(setExtended)
      .catch(() => setExtended(undefined))
      .finally(() => setLoadingExtended(false));
  }, [trendPeriod]);

  // 拉取提醒未读数 + 列表
  const loadReminders = useCallback(async () => {
    setReminderLoading(true);
    try {
      const [unread, list] = await Promise.all([
        getReminderUnreadCount().catch(() => ({ unreadCount: 0 })),
        listNotifications({ pageSize: 8, type: 'reminder' }).catch(() => ({ items: [] as NotificationItem[] })),
      ]);
      setReminderUnread(Number(unread.unreadCount || 0));
      setReminderItems(Array.isArray(list.items) ? list.items : []);
    } finally {
      setReminderLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(dateRange);
  }, [dateRange, fetchOverview]);

  useEffect(() => {
    void loadReminders();
  }, [loadReminders]);

  // 监听 Socket.IO 推送：reminder.created 事件（新提醒到达时刷新）
  useEffect(() => {
    const unsubscribe = onSocketMessage((raw) => {
      const type =
        String(
          (raw as any).typeCode ??
            (raw as any).notificationType ??
            (raw as any).type ??
            '',
        ).toLowerCase();
      if (type === 'reminder') {
        void loadReminders();
      }
    });
    return unsubscribe;
  }, [onSocketMessage, loadReminders]);

  // 标记单条已读
  const handleMarkReminderRead = useCallback(
    async (id: string | number) => {
      try {
        await markReminderRead(String(id));
        setReminderItems((prev) =>
          prev.map((it) => (String(it.id) === String(id) ? { ...it, unread: false } : it)),
        );
        setReminderUnread((n) => Math.max(0, n - 1));
      } catch (err) {
        antdMessage.warning(err instanceof Error ? err.message : '标记已读失败');
      }
    },
    [],
  );

  // 消息中心下拉内容
  const reminderDropdown = (
    <div
      style={{
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
        padding: 12,
        width: 360,
        maxHeight: 420,
        overflow: 'auto',
      }}
    >
      <Space
        style={{ width: '100%', justifyContent: 'space-between', marginBottom: 8 }}
        align="center"
      >
        <Typography.Text strong>消息中心 - 跨端口提醒</Typography.Text>
        <Badge count={reminderUnread} size="small" overflowCount={99}>
          <Tag color={reminderUnread > 0 ? 'cyan' : 'default'}>未读 {reminderUnread}</Tag>
        </Badge>
      </Space>
      {reminderLoading && reminderItems.length === 0 ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : reminderItems.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无提醒" />
      ) : (
        <List
          size="small"
          dataSource={reminderItems}
          renderItem={(item) => (
            <List.Item
              style={{ padding: '6px 0' }}
              actions={
                item.unread
                  ? [
                      <Button
                        key="read"
                        type="link"
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={() => void handleMarkReminderRead(item.id)}
                      >
                        标记已读
                      </Button>,
                    ]
                  : []
              }
            >
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Space size={4} align="center">
                  {item.unread ? <Badge status="processing" /> : null}
                  <Typography.Text strong={Boolean(item.unread)}>{item.title}</Typography.Text>
                </Space>
                {item.content ? (
                  <Typography.Text type="secondary" ellipsis={{ tooltip: item.content }}>
                    {item.content}
                  </Typography.Text>
                ) : null}
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {formatDateTime(item.createdAt)}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      )}
      <div style={{ marginTop: 8, textAlign: 'right' }}>
        <Link href="/admin/messages">
          <Button type="link" size="small">
            查看全部 <RightOutlined />
          </Button>
        </Link>
      </div>
    </div>
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* Toolbar */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管总览</Typography.Title>
          <Typography.Paragraph type="secondary">
            从全局视角监控作品、客资、流量与运营风险。
          </Typography.Paragraph>
        </div>
        <Space size={12} wrap align="center">
          <QuickRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={OVERVIEW_PRESETS}
            variant="buttons"
            presetSize="middle"
          />
          <Tag color="purple" icon={<TeamOutlined />}>
            {user?.name ?? '主管'}
          </Tag>
          {/* v1.3 SUP-3: 顶部消息中心 — 红点为 reminder 未读数；点击展开提醒列表并支持标记已读 */}
          <Dropdown
            popupRender={() => reminderDropdown}
            trigger={['click']}
            placement="bottomRight"
          >
            <Badge count={reminderUnread} offset={[-2, 6]} overflowCount={99}>
              <Tag
                color={reminderUnread > 0 ? 'cyan' : 'default'}
                icon={<BellOutlined />}
                style={{ cursor: 'pointer' }}
              >
                消息中心
              </Tag>
            </Badge>
          </Dropdown>
          <Link href="/admin/messages">
            <Badge count={unreadCount} offset={[-2, 6]} overflowCount={99}>
              <Tag color={unreadCount > 0 ? 'red' : 'default'} icon={<BellOutlined />}>
                未读消息
              </Tag>
            </Badge>
          </Link>
        </Space>
      </div>

      {/* 4 Data Cards */}
      <Skeleton loading={loading} active paragraph={{ rows: 3 }}>
        <Row gutter={[16, 16]}>
          {DATA_CARDS.map((card) => {
            const value = overview ? overview[card.key] : 0;
            return (
              <Col xs={24} sm={12} lg={6} key={card.key}>
                <Card>
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 20 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Statistic value={value} valueStyle={{ color: card.accent }} />
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                      {dateRange ? `${dateRange.start.format('M/D')} - ${dateRange.end.format('M/D')}` : ''}：{card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Skeleton>

      {/* T1.3 总览扩展 7 个区域 */}
      <ExtendedSections extended={extended} loading={loadingExtended} trendPeriod={trendPeriod} onTrendPeriodChange={setTrendPeriod} />

      {/* 4 Exception Cards */}
      <div>
        <Typography.Title level={4}>
          <ExclamationCircleOutlined style={{ color: '#f5222d', marginRight: 8 }} />
          异常提醒
        </Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {EXCEPTION_CARDS.map((card) => {
          const value = overview?.riskReminders[card.key] ?? 0;
          return (
            <Col xs={24} sm={12} lg={6} key={card.key}>
              <Link href={card.href}>
                <Card
                  hoverable
                  styles={{ body: { padding: 16 } }}
                  style={{
                    borderColor: value > 0 ? card.accent : undefined,
                    borderWidth: value > 0 ? 2 : 1,
                  }}
                >
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space size={8} align="center">
                      <span style={{ color: card.accent, fontSize: 18 }}>{card.icon}</span>
                      <Typography.Text strong>{card.title}</Typography.Text>
                    </Space>
                    <Statistic
                      value={value}
                      valueStyle={{ color: value > 0 ? card.accent : undefined }}
                    />
                    <Typography.Paragraph
                      type="secondary"
                      style={{ marginBottom: 0, fontSize: 12 }}
                    >
                      {card.description}
                    </Typography.Paragraph>
                  </Space>
                </Card>
              </Link>
            </Col>
          );
        })}
      </Row>

      {/* 3 Quick Entries */}
      <div>
        <Typography.Title level={4}>快捷入口</Typography.Title>
      </div>
      <Row gutter={[16, 16]}>
        {QUICK_ENTRIES.map((entry) => (
          <Col xs={24} md={8} key={entry.href}>
            <Link href={entry.href}>
              <Card hoverable>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Typography.Title level={5} style={{ margin: 0 }}>
                      <Space>
                        {entry.icon}
                        {entry.title}
                      </Space>
                    </Typography.Title>
                    <RightOutlined />
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                    {entry.description}
                  </Typography.Paragraph>
                </Space>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </Space>
  );
}

// ============================================================
// T1.3 总览扩展 7 个区域
//   1. 双平台分布（小红书 / 抖音，3 个饼图：作品 / 流量 / 客资）
//   2. 作品量趋势（按日/周/月聚合的双平台折线）
//   3. 三类作品占比（人设贴 / 讨论贴 / 获客帖 饼图）
//   4. 获客趋势（小红书 / 抖音 / 总和 三条曲线）
//   5. 流量趋势（小红书 / 抖音 / 总和 三条曲线）
//   6. 获客效率（小红书 / 抖音 / 双平台综合 三个值）
//   7. 获客帖效率（小红书 / 抖音 / 双平台综合 三个值）
// ============================================================

function ExtendedSections({
  extended,
  loading,
  trendPeriod,
  onTrendPeriodChange,
}: {
  extended?: SupervisorExtended;
  loading: boolean;
  trendPeriod: 'day' | 'week' | 'month';
  onTrendPeriodChange: (next: 'day' | 'week' | 'month') => void;
}) {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {/* 1. 双平台分布 + 2. 作品量趋势 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          <Card size="small" title={<><PieChartOutlined /> 双平台分布</>}>
            <PlatformDistPies extended={extended} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} md={14}>
          <Card
            size="small"
            title={
              <Space size={4} align="center">
                <LineChartOutlined />
                <Typography.Text strong>作品量趋势</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {trendPeriod === 'day' ? '按日' : trendPeriod === 'week' ? '按周' : '按月'}
                </Typography.Text>
              </Space>
            }
            extra={
              <Segmented
                size="small"
                value={trendPeriod}
                onChange={(v) => onTrendPeriodChange(v as 'day' | 'week' | 'month')}
                options={[
                  { label: '日', value: 'day' },
                  { label: '周', value: 'week' },
                  { label: '月', value: 'month' },
                ]}
              />
            }
          >
            <PostVolumeTrendChart extended={extended} loading={loading} />
          </Card>
        </Col>
      </Row>

      {/* 3. 三类作品占比 + 4. 获客效率 + 7. 获客帖效率 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card size="small" title={<><PieChartOutlined /> 三类作品占比</>}>
            <PostTypeSharePie extended={extended} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" title={<><ThunderboltOutlined /> 获客效率（客/作）</>}>
            <EfficiencyValues extended={extended} loading={loading} kind="leadEfficiency" />
          </Card>
        </Col>
        <Col xs={24} md={6}>
          <Card size="small" title={<><TrophyOutlined /> 获客帖效率（客/获客贴）</>}>
            <EfficiencyValues extended={extended} loading={loading} kind="leadPostEfficiency" />
          </Card>
        </Col>
      </Row>

      {/* 4. 获客趋势 + 5. 流量趋势 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card size="small" title={<><RiseOutlined /> 获客趋势（小红书 / 抖音 / 总和）</>}>
            <LeadTrendChart extended={extended} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={<><FundProjectionScreenOutlined /> 流量趋势（小红书 / 抖音 / 总和）</>}>
            <TrafficTrendChart extended={extended} loading={loading} />
          </Card>
        </Col>
      </Row>
    </Space>
  );
}

// ----- 1. 双平台分布（3 个饼图：作品 / 流量 / 客资）-----
function PlatformDistPies({ extended, loading }: { extended?: SupervisorExtended; loading: boolean }) {
  const items = extended?.platformDistribution ?? [];
  const dataPost = items.map((it) => ({ name: it.platform, value: it.postCount }));
  const dataTraffic = items.map((it) => ({ name: it.platform, value: it.traffic }));
  const dataLead = items.map((it) => ({ name: it.platform, value: it.leadCount }));
  return (
    <Row gutter={8}>
      <Col span={8}>
        <PieBlock data={dataPost} title="作品占比" color={['#fa8c16', '#1677ff']} loading={loading} />
      </Col>
      <Col span={8}>
        <PieBlock data={dataTraffic} title="流量占比" color={['#fa541c', '#13c2c2']} loading={loading} />
      </Col>
      <Col span={8}>
        <PieBlock data={dataLead} title="客资占比" color={['#52c41a', '#722ed1']} loading={loading} />
      </Col>
    </Row>
  );
}

function PieBlock({
  data,
  title,
  color,
  loading,
}: {
  data: { name: string; value: number }[];
  title: string;
  color: string[];
  loading: boolean;
}) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.every((it) => it.value === 0),
    emptyHTML: '<div style="height:140px;display:flex;align-items:center;justify-content:center;color:#999;">暂无数据</div>',
    buildOption: (d) => ({
      title: { text: title, textStyle: { fontSize: 13, fontWeight: 'normal' }, left: 'center', top: 4 },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      color,
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          data: d.filter((it) => it.value > 0),
          label: { show: true, formatter: '{b}\n{d}%', fontSize: 10 },
        },
      ],
    }),
    deps: [data, loading, echartsReady, containerRef, chartRef],
  });
  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} style={{ height: 140 }} />
    </Skeleton>
  );
}

// ----- 2. 作品量趋势 -----
function PostVolumeTrendChart({ extended, loading }: { extended?: SupervisorExtended; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const data = extended?.postVolumeTrend ?? [];
  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.length === 0 || d.every((p) => p.xiaohongshuCount === 0 && p.douyinCount === 0),
    emptyHTML: '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:#999;">暂无数据</div>',
    buildOption: (d) => {
      const dates = d.map((p) => p.date);
      const xhs = d.map((p) => p.xiaohongshuCount);
      const dy = d.map((p) => p.douyinCount);
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        legend: { data: ['小红书', '抖音'], bottom: 0 },
        color: ['#fa8c16', '#1677ff'],
        grid: { left: 40, right: 16, top: 24, bottom: 36 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0, fontSize: 11 } },
        yAxis: { type: 'value', name: '作品数' },
        series: [
          { name: '小红书', type: 'line', data: xhs, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
          { name: '抖音', type: 'line', data: dy, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
        ],
      };
    },
    deps: [data, loading, echartsReady, containerRef, chartRef],
  });
  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} style={{ height: 200 }} />
    </Skeleton>
  );
}

// ----- 3. 三类作品占比（人设贴 / 讨论贴 / 获客帖）-----
function PostTypeSharePie({ extended, loading }: { extended?: SupervisorExtended; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const items = extended?.postTypeDistribution ?? [];
  const colors = ['#1890ff', '#fa541c', '#52c41a'];
  const data = items.map((it, idx) => ({ name: it.type, value: it.count, color: colors[idx] || '#999' }));
  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.every((it) => it.value === 0),
    emptyHTML: '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:#999;">暂无数据</div>',
    buildOption: (d) => ({
      title: { text: '人设贴 / 讨论贴 / 获客帖', textStyle: { fontSize: 13, fontWeight: 'normal' }, left: 'center', top: 4 },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => `${p.name}：${p.value}（${p.percent}%）`,
      },
      legend: { bottom: 0 },
      color: d.map((it) => it.color),
      series: [
        {
          type: 'pie',
          radius: ['45%', '70%'],
          data: d.filter((it) => it.value > 0),
          label: { show: true, formatter: '{b}\n{c}' },
        },
      ],
    }),
    deps: [data, loading, echartsReady, containerRef, chartRef],
  });
  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} style={{ height: 200 }} />
    </Skeleton>
  );
}

// ----- 4. 获客趋势（小红书 / 抖音 / 总和）-----
function LeadTrendChart({ extended, loading }: { extended?: SupervisorExtended; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const data = useMemo(() => {
    const arr = extended?.leadTrend ?? [];
    return arr.map((p) => ({ date: p.date, xhs: p.xiaohongshuLeads, dy: p.douyinLeads }));
  }, [extended?.leadTrend]);
  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.length === 0 || d.every((p) => p.xhs === 0 && p.dy === 0),
    emptyHTML: '<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#999;">暂无数据</div>',
    buildOption: (d) => {
      const dates = d.map((p) => p.date);
      const xhs = d.map((p) => p.xhs);
      const dy = d.map((p) => p.dy);
      const total = d.map((p) => p.xhs + p.dy);
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        legend: { data: ['小红书', '抖音', '总和'], bottom: 0 },
        color: ['#fa8c16', '#1677ff', '#52c41a'],
        grid: { left: 40, right: 16, top: 24, bottom: 36 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0, fontSize: 11 } },
        yAxis: { type: 'value', name: '获客数' },
        series: [
          { name: '小红书', type: 'line', data: xhs, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
          { name: '抖音', type: 'line', data: dy, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
          { name: '总和', type: 'line', data: total, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
        ],
      };
    },
    deps: [data, loading, echartsReady, containerRef, chartRef],
  });
  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} style={{ height: 220 }} />
    </Skeleton>
  );
}

// ----- 5. 流量趋势（小红书 / 抖音 / 总和）-----
function TrafficTrendChart({ extended, loading }: { extended?: SupervisorExtended; loading: boolean }) {
  const { containerRef, chartRef, echartsReady } = useEchartsChart();
  const data = useMemo(() => {
    const arr = extended?.trafficTrend ?? [];
    return arr.map((p) => ({ date: p.date, xhs: p.xiaohongshuTraffic, dy: p.douyinTraffic }));
  }, [extended?.trafficTrend]);
  useEchartsRender<typeof data>({
    ready: echartsReady,
    containerRef,
    chartRef,
    data,
    isEmpty: (d) => d.length === 0 || d.every((p) => p.xhs === 0 && p.dy === 0),
    emptyHTML: '<div style="height:220px;display:flex;align-items:center;justify-content:center;color:#999;">暂无数据</div>',
    buildOption: (d) => {
      const dates = d.map((p) => p.date);
      const xhs = d.map((p) => p.xhs);
      const dy = d.map((p) => p.dy);
      const total = d.map((p) => p.xhs + p.dy);
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'line' } },
        legend: { data: ['小红书', '抖音', '总和'], bottom: 0 },
        color: ['#fa8c16', '#1677ff', '#13c2c2'],
        grid: { left: 50, right: 16, top: 24, bottom: 36 },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: dates.length > 8 ? 30 : 0, fontSize: 11 } },
        yAxis: { type: 'value', name: '流量' },
        series: [
          { name: '小红书', type: 'line', data: xhs, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
          { name: '抖音', type: 'line', data: dy, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
          { name: '总和', type: 'line', data: total, smooth: true, symbol: 'circle', symbolSize: 5, lineStyle: { width: 2 } },
        ],
      };
    },
    deps: [data, loading, echartsReady, containerRef, chartRef],
  });
  return (
    <Skeleton loading={loading} active>
      <div ref={containerRef} style={{ height: 220 }} />
    </Skeleton>
  );
}

// ----- 6. 7. 效率值（小红书 / 抖音 / 双平台综合 三个值）-----
function EfficiencyValues({
  extended,
  loading,
  kind,
}: {
  extended?: SupervisorExtended;
  loading: boolean;
  kind: 'leadEfficiency' | 'leadPostEfficiency';
}) {
  const values = extended?.[kind] ?? { xiaohongshu: 0, douyin: 0, total: 0 };
  const unit = kind === 'leadEfficiency' ? '客/作' : '客/获客贴';
  return (
    <Skeleton loading={loading} active paragraph={{ rows: 2 }}>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">小红书</Typography.Text>
          <Tooltip title={`小红书 ${unit}`}>
            <Typography.Text strong style={{ fontSize: 16 }}>{values.xiaohongshu.toFixed(2)}</Typography.Text>
          </Tooltip>
        </Space>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">抖音</Typography.Text>
          <Tooltip title={`抖音 ${unit}`}>
            <Typography.Text strong style={{ fontSize: 16 }}>{values.douyin.toFixed(2)}</Typography.Text>
          </Tooltip>
        </Space>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text type="secondary">双平台综合</Typography.Text>
          <Tooltip title={`双平台综合 ${unit}`}>
            <Typography.Text strong style={{ fontSize: 18, color: '#1677ff' }}>{values.total.toFixed(2)}</Typography.Text>
          </Tooltip>
        </Space>
      </Space>
    </Skeleton>
  );
}
