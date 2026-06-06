'use client';

import { CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Segmented,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { getAccountTimeseries, getAllAccountsTimeseries } from '@/shared/api/content';
import type { AccountInfo } from '@/shared/api/content';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import type { AccountTimeseries, AccountTimeseriesDay, AccountTimeseriesPost } from '@/shared/types/content';
import { mapPlatformToKey } from '@/shared/utils/platform-key';

type Account = {
  id: string;
  employeeId: string;
  platform: string;
  accountName: string;
  postingPlan?: string | null;
};

type PlatformFilter = '' | '小红书' | '抖音';
type ViewMode = 'all' | 'single';

const VIEW_MODE_OPTIONS: { label: string; value: ViewMode }[] = [
  { label: '全部账号', value: 'all' },
  { label: '单账号', value: 'single' },
];

const PLATFORM_OPTIONS: { label: string; value: PlatformFilter }[] = [
  { label: '全部平台', value: '' },
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const DAYS_OPTIONS: { label: string; value: number }[] = [
  { label: '近 7 天', value: 7 },
  { label: '近 14 天', value: 14 },
  { label: '近 30 天', value: 30 },
  { label: '近 60 天', value: 60 },
  { label: '近 90 天', value: 90 },
];

type AccountAnalysisSort = 'leadCount' | 'postCount' | 'traffic';

const SORT_OPTIONS: { label: string; value: AccountAnalysisSort }[] = [
  { label: '按获客数', value: 'leadCount' },
  { label: '按作品数', value: 'postCount' },
  { label: '按流量', value: 'traffic' },
];

const MAX_VISIBLE_DAYS = 30; // 日历视图最多展示 30 格（>30 时折叠）

export default function AccountAnalysisPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] = useState<PlatformFilter>('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [days, setDays] = useState<number>(30);
  // 全部账号视图排序：默认按获客数降序
  const [sort, setSort] = useState<AccountAnalysisSort>('leadCount');
  const [timeseries, setTimeseries] = useState<AccountTimeseries | undefined>();
  const [allAccountsData, setAllAccountsData] = useState<{ accounts: AccountInfo[]; items: AccountTimeseries[] } | undefined>();
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState<string>();

  // 加载当前运营的账号列表
  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    setError(undefined);
    try {
      const user = readAuthenticatedUser();
      const query: Record<string, string | number> = { pageSize: 200 };
      if (user?.employeeId) {
        query.employeeId = user.employeeId;
      }
      if (platform) {
        query.platform = platform;
      }
      const payload = await apiClient.get<any>('/accounts', { query });
      const items = (payload?.items ?? payload ?? []) as Account[];
      const list = Array.isArray(items) ? items : [];
      setAccounts(list);
      // 切换到 single 模式或选过的账号已不在列表里时回退到第一个
      setSelectedAccountId((prev) => {
        if (list.length === 0) return undefined;
        if (prev && list.some((a) => a.id === prev)) return prev;
        return list[0].id;
      });
    } catch (err) {
      setAccounts([]);
      setError(err instanceof Error ? err.message : '账号列表加载失败');
    } finally {
      setLoadingAccounts(false);
    }
  }, [platform]);

  // 加载时间序列：viewMode=all 调全账号接口（返回各账号独立数据）；viewMode=single 必须有 selectedAccountId
  const loadTimeseries = useCallback(async () => {
    if (viewMode === 'single' && !selectedAccountId) {
      setTimeseries(undefined);
      setAllAccountsData(undefined);
      return;
    }
    setLoadingSeries(true);
    setError(undefined);
    try {
      if (viewMode === 'all') {
        const data = await getAllAccountsTimeseries({ days, platform: platform || undefined, sort });
        setAllAccountsData(data);
        setTimeseries(undefined);
      } else {
        const data = await getAccountTimeseries(selectedAccountId as string, { days });
        setTimeseries(data);
        setAllAccountsData(undefined);
      }
    } catch (err) {
      setTimeseries(undefined);
      setAllAccountsData(undefined);
      setError(err instanceof Error ? err.message : '账号时间序列加载失败');
    } finally {
      setLoadingSeries(false);
    }
  }, [viewMode, selectedAccountId, days, platform, sort]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    void loadTimeseries();
  }, [loadTimeseries]);

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        label: `${a.accountName}${a.platform ? `（${a.platform}）` : ''}`,
        value: a.id,
      })),
    [accounts],
  );

  const currentAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>账号分析</Typography.Title>
          <Typography.Paragraph type="secondary">
            按账号查看流量与客资的时间波动，辅助调整发帖节奏。
          </Typography.Paragraph>
        </div>
        <Space wrap size={12} align="center">
          <Segmented
            value={viewMode}
            onChange={(v) => {
              setViewMode(v as ViewMode);
              // 切到 single 模式时给个默认账号，避免空白
              if (v === 'single' && !selectedAccountId && accounts.length > 0) {
                setSelectedAccountId(accounts[0].id);
              }
            }}
            options={VIEW_MODE_OPTIONS}
          />
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 120 }}
            value={platform}
            onChange={(v) => setPlatform(v as PlatformFilter)}
            options={PLATFORM_OPTIONS}
          />
          <Select
            value={selectedAccountId}
            onChange={(v) => setSelectedAccountId(v)}
            placeholder="选择账号"
            options={accountOptions}
            style={{ width: 240 }}
            loading={loadingAccounts}
            showSearch
            optionFilterProp="label"
            notFoundContent={loadingAccounts ? '加载中...' : '暂无账号'}
            disabled={viewMode === 'all' || accounts.length === 0}
          />
          <Segmented
            value={days}
            onChange={(v) => setDays(v as number)}
            options={DAYS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
          />
          {viewMode === 'all' ? (
            <Segmented
              value={sort}
              onChange={(v) => setSort(v as AccountAnalysisSort)}
              options={SORT_OPTIONS}
            />
          ) : null}
          <Button icon={<ReloadOutlined />} loading={loadingSeries} onClick={() => void loadTimeseries()}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message="账号分析数据暂不可用" description={error} /> : null}

      {viewMode === 'single' ? (
        <Card
          size="small"
          title={
            <Space size={8} align="center">
              <CalendarOutlined />
              <Typography.Text strong>
                {currentAccount?.accountName ?? '请选择账号'}
              </Typography.Text>
              {currentAccount?.platform ? <Tag color="blue">{currentAccount.platform}</Tag> : null}
              {currentAccount?.postingPlan ? <Tag color="orange">发帖规划</Tag> : null}
              {timeseries?.account?.positioning ? <Tag color="default">{timeseries.account.positioning}</Tag> : null}
              {timeseries ? (
                <Tag color="cyan">
                  近 {days} 天 · 作品 {timeseries.summary.postCount} / 客资 {timeseries.summary.leadCount} / 流量 {timeseries.summary.traffic}
                </Tag>
              ) : null}
            </Space>
          }
          extra={
            <Space size={8} wrap>
              <Badge color="#fa8c16" text="高获客" />
              <Badge color="#52c41a" text="有帖" />
              <Badge color="#d9d9d9" text="未发" />
              <span style={{ width: 1, height: 12, background: '#d9d9d9' }} />
              <Space size={4} align="center">
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff2442' }} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>小红书</Typography.Text>
              </Space>
              <Space size={4} align="center">
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#161616' }} />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>抖音</Typography.Text>
              </Space>
            </Space>
          }
        >
          <Skeleton loading={loadingSeries} active>
            {timeseries ? (
              <AccountCalendarGrid days={timeseries.days.slice(-MAX_VISIBLE_DAYS)} />
            ) : (
              <Empty description={selectedAccountId ? '暂无数据' : '请选择一个账号'} />
            )}
          </Skeleton>
        </Card>
      ) : (
        <Skeleton loading={loadingSeries} active>
          {allAccountsData && allAccountsData.items.length > 0 ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {allAccountsData.items.map((item) => (
                <Card
                  key={item.account.id}
                  size="small"
                  title={
                    <Space size={8} align="center">
                      <CalendarOutlined />
                      <Typography.Text strong>{item.account.accountName}</Typography.Text>
                      {item.account.platform ? <Tag color="blue">{item.account.platform}</Tag> : null}
                      {item.account.postingPlan ? <Tag color="orange">发帖规划</Tag> : null}
                      {item.account.positioning ? <Tag color="default">{item.account.positioning}</Tag> : null}
                      <Tag color="cyan">
                        近 {days} 天 · 作品 {item.summary.postCount} / 客资 {item.summary.leadCount} / 流量 {item.summary.traffic}
                      </Tag>
                    </Space>
                  }
                  extra={
                    <Space size={8} wrap>
                      <Badge color="#fa8c16" text="高获客" />
                      <Badge color="#52c41a" text="有帖" />
                      <Badge color="#d9d9d9" text="未发" />
                    </Space>
                  }
                >
                  <AccountCalendarGrid days={item.days.slice(-MAX_VISIBLE_DAYS)} />
                </Card>
              ))}
            </Space>
          ) : (
            <Empty description="暂无账号数据" />
          )}
        </Skeleton>
      )}

      {timeseries && timeseries.account?.postingPlan ? (
        <Card size="small" title="发帖规划">
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {timeseries.account.postingPlan}
          </Typography.Paragraph>
        </Card>
      ) : null}
    </Space>
  );
}

/**
 * 账号日历视图：横轴日期，颜色按 OP-23 编码
 * - 橙 = 当日有 is_lead_post=1 且 leads>=1（高获客）
 * - 绿 = 有帖但无高获客
 * - 灰 = 未发帖
 */
function AccountCalendarGrid({ days }: { days: AccountTimeseriesDay[] }) {
  if (!days || days.length === 0) {
    return <Empty description="暂无日期数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${days.length}, minmax(28px, 1fr))`,
          gap: 4,
          overflowX: 'auto',
        }}
      >
        {days.map((d) => {
          const color = pickDayColor(d);
          const isEmpty = d.postCount === 0;
          return (
            <Tooltip
              key={d.date}
              title={
                <PostGroupedTooltip date={d.date} posts={d.posts} postCount={d.postCount} leadCount={d.leadCount} traffic={d.traffic} />
              }
            >
              <div
                style={{
                  minHeight: 56,
                  borderRadius: 4,
                  background: color,
                  color: isEmpty ? '#999' : '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid #f0f0f0',
                  padding: '2px 0',
                }}
              >
                <div style={{ fontWeight: 600 }}>{d.date.slice(5)}</div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>
                  {d.postCount > 0 ? `×${d.postCount}` : '—'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.85, minHeight: 12 }}>
                  {d.leadCount > 0 ? `${d.leadCount}客` : ''}
                </div>
                {/* 平台点阵：每帖一点，红=小红书，黑=抖音；最多展示 8 个，超出折叠为 +N */}
                {d.posts.length > 0 ? (
                  <PlatformDots posts={d.posts} />
                ) : null}
              </div>
            </Tooltip>
          );
        })}
      </div>
      <Space wrap size={16} style={{ marginTop: 12 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          点击日期格子查看当日作品 / 客资 / 流量明细
        </Typography.Text>
      </Space>
    </div>
  );
}

function pickDayColor(d: AccountTimeseriesDay): string {
  if (d.postCount === 0) return '#d9d9d9';
  if (d.posts.some((p: AccountTimeseriesPost) => p.isLead && p.leadCount > 0)) return '#fa8c16';
  return '#52c41a';
}

/**
 * 平台点阵：每个作品一个圆点，红=小红书，黑=抖音。
 * 超过 MAX_VISIBLE 时折叠为 `+N` 占位。
 */
const MAX_VISIBLE_DOTS = 8;

function PlatformDots({ posts }: { posts: AccountTimeseriesPost[] }) {
  const visible = posts.slice(0, MAX_VISIBLE_DOTS);
  const overflow = posts.length - visible.length;
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        marginTop: 2,
        lineHeight: 0,
      }}
    >
      {visible.map((p) => (
        <span
          key={p.postId}
          title={p.platform || '未知平台'}
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: pickPlatformDotColor(p.platform),
            boxShadow: '0 0 0 1px rgba(255,255,255,0.6)',
          }}
        />
      ))}
      {overflow > 0 ? (
        <span style={{ fontSize: 9, color: '#fff', opacity: 0.85, marginLeft: 2 }}>+{overflow}</span>
      ) : null}
    </div>
  );
}

function pickPlatformDotColor(platform?: string): string {
  if (!platform) return '#bfbfbf';
  // 小红书：红；抖音：黑；中英文/dy/xhs 全部兼容（统一走 platform-key）
  const key = mapPlatformToKey(platform);
  if (key === 'xiaohongshu') return '#ff2442';
  if (key === 'douyin') return '#161616';
  // 兜底：URL 域名
  if (platform.includes('xhslink')) return '#ff2442';
  if (platform.includes('iesdouyin')) return '#161616';
  return '#bfbfbf';
}

// 作品录入可选的 3 种类型（与 frontend/src/app/operation/posts/new/page.tsx:331 保持一致）。
const POST_TYPE_GROUPS: { type: string; label: string; color: string }[] = [
  { type: '获客贴', label: '获客贴', color: '#fa8c16' },
  { type: '话题贴', label: '话题贴', color: '#1677ff' },
  { type: '素人贴', label: '素人贴', color: '#52c41a' },
];

/**
 * 鼠标悬停 tooltip：按"获客贴 / 话题贴 / 素人贴"三栏分组展示。
 * - 顶部仍保留日期 + 当日总作品/客资/流量 4 行汇总
 * - 下方三栏各列该类型作品，标题 · 平台 · 客资 · 流量；高获客作品 ⭐ 标记
 * - 未知类型归入"其他"以防遗漏
 */
function PostGroupedTooltip({
  date,
  posts,
  postCount,
  leadCount,
  traffic,
}: {
  date: string;
  posts: AccountTimeseriesPost[];
  postCount: number;
  leadCount: number;
  traffic: number;
}) {
  const known = new Set(POST_TYPE_GROUPS.map((g) => g.type));
  const otherPosts = posts.filter((p) => !known.has(p.type));
  const groups: { type: string; label: string; color: string; posts: AccountTimeseriesPost[] }[] = POST_TYPE_GROUPS
    .map((g) => ({ ...g, posts: posts.filter((p) => p.type === g.type) }))
    .filter((g) => g.posts.length > 0);
  if (otherPosts.length > 0) {
    groups.push({ type: '__other__', label: '其他', color: '#8c8c8c', posts: otherPosts });
  }
  return (
    <div style={{ minWidth: 200 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{date}</div>
      <div style={{ fontSize: 12 }}>作品：{postCount}</div>
      <div style={{ fontSize: 12 }}>客资：{leadCount}</div>
      <div style={{ fontSize: 12 }}>流量：{traffic}</div>
      {groups.length > 0 ? (
        <div style={{ marginTop: 6, borderTop: '1px dashed rgba(255,255,255,0.3)', paddingTop: 4 }}>
          {groups.map((g) => (
            <div key={g.type} style={{ marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: g.color }} />
                {g.label} · {g.posts.length} 篇
              </div>
              {g.posts.map((p) => (
                <div key={p.postId} style={{ fontSize: 11, paddingLeft: 12 }}>
                  · {p.title || p.postId}
                  {p.platform ? `（${p.platform}）` : ''}
                  {`（${p.leadCount}客 / ${p.traffic}流量）`}
                  {p.isLead ? ' ⭐' : ''}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
