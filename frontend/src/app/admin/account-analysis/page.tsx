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
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { getAccountTimeseries, getAllAccountsTimeseries } from '@/shared/api/content';
import type { AccountInfo } from '@/shared/api/content';
import { ACCOUNT_ANALYSIS_LEGEND } from '@/shared/constants/account-analysis';
import type { AccountTimeseries, AccountTimeseriesDay, AccountTimeseriesPost } from '@/shared/types/content';
import { mapPlatformToKey } from '@/shared/utils/platform-key';

type Account = {
  id: string;
  employeeId: string;
  platform: string;
  accountName: string;
  postingPlan?: string | null;
};

type Employee = {
  id: string;
  name: string;
  employeeCode?: string;
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

const MAX_VISIBLE_DAYS = 30;

/**
 * 主管端 — 账号分析
 * 顶部员工选择器 → 选择后复用账号分析组件（传 employeeId 到后端）。
 */
export default function AdminAccountAnalysisPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [platform, setPlatform] = useState<PlatformFilter>('');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [days, setDays] = useState<number>(30);
  const [sort, setSort] = useState<AccountAnalysisSort>('leadCount');
  const [timeseries, setTimeseries] = useState<AccountTimeseries | undefined>();
  const [allAccountsData, setAllAccountsData] = useState<{ accounts: AccountInfo[]; items: AccountTimeseries[] } | undefined>();
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState<string>();

  // 加载员工列表
  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const payload = await apiClient.get<any>('/employees', { query: { limit: 500, offset: 0, role: 'staff' } });
      const data = payload?.items ?? payload ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  // 加载当前选中员工的账号列表
  const loadAccounts = useCallback(async () => {
    if (!selectedEmployeeId) {
      setAccounts([]);
      return;
    }
    setLoadingAccounts(true);
    setError(undefined);
    try {
      const query: Record<string, string | number> = { pageSize: 200, employeeId: selectedEmployeeId };
      if (platform) {
        query.platform = platform;
      }
      const payload = await apiClient.get<any>('/accounts', { query });
      const items = (payload?.items ?? payload ?? []) as Account[];
      const list = Array.isArray(items) ? items : [];
      setAccounts(list);
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
  }, [selectedEmployeeId, platform]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  // 加载时间序列
  const loadTimeseries = useCallback(async () => {
    if (!selectedEmployeeId) {
      setTimeseries(undefined);
      setAllAccountsData(undefined);
      return;
    }
    if (viewMode === 'single' && !selectedAccountId) {
      setTimeseries(undefined);
      setAllAccountsData(undefined);
      return;
    }
    setLoadingSeries(true);
    setError(undefined);
    try {
      if (viewMode === 'all') {
        const data = await getAllAccountsTimeseries({ days, platform: platform || undefined, sort, employeeId: selectedEmployeeId });
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
  }, [viewMode, selectedAccountId, days, platform, sort, selectedEmployeeId]);

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

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedEmployeeId),
    [employees, selectedEmployeeId],
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 员工选择器 */}
      <Card size="small">
        <Space wrap size={12} align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap size={8} align="center">
            <Typography.Text type="secondary">选择员工</Typography.Text>
            <Select
              showSearch
              allowClear
              placeholder="选择员工查看其账号分析"
              style={{ width: 280 }}
              value={selectedEmployeeId}
              onChange={setSelectedEmployeeId}
              optionFilterProp="label"
              loading={loadingEmployees}
              options={employees.map((e) => ({
                label: `${e.name || e.id}${e.employeeCode ? `（${e.employeeCode}）` : ''}`,
                value: e.id,
              }))}
              notFoundContent={loadingEmployees ? <Spin size="small" /> : '暂无员工'}
            />
            {selectedEmployee ? <Tag color="purple">{selectedEmployee.name}</Tag> : null}
          </Space>
        </Space>
      </Card>

      {/* 账号分析主体 */}
      {selectedEmployeeId ? (
        <>
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
                  <Badge color={ACCOUNT_ANALYSIS_LEGEND.leadPost.color} text={ACCOUNT_ANALYSIS_LEGEND.leadPost.text} />
                  <Badge color={ACCOUNT_ANALYSIS_LEGEND.personaPost.color} text={ACCOUNT_ANALYSIS_LEGEND.personaPost.text} />
                  <Badge color={ACCOUNT_ANALYSIS_LEGEND.empty.color} text={ACCOUNT_ANALYSIS_LEGEND.empty.text} />
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
                          <Badge color={ACCOUNT_ANALYSIS_LEGEND.leadPost.color} text={ACCOUNT_ANALYSIS_LEGEND.leadPost.text} />
                          <Badge color={ACCOUNT_ANALYSIS_LEGEND.personaPost.color} text={ACCOUNT_ANALYSIS_LEGEND.personaPost.text} />
                          <Badge color={ACCOUNT_ANALYSIS_LEGEND.empty.color} text={ACCOUNT_ANALYSIS_LEGEND.empty.text} />
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
        </>
      ) : (
        <Empty description="请先选择一名员工" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
    </Space>
  );
}

// ── 以下组件与运营端 account-analysis/page.tsx 共用 ──

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
                  position: 'relative',
                }}
              >
                {d.leadCount > 0 ? (
                  <span
                    title="有客资"
                    style={{
                      position: 'absolute',
                      right: 4,
                      bottom: 4,
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: '#ff2442',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.78)',
                    }}
                  />
                ) : null}
                <div style={{ fontWeight: 600 }}>{d.date.slice(5)}</div>
                <div style={{ fontSize: 11, opacity: 0.9 }}>
                  {d.postCount > 0 ? `×${d.postCount}` : '—'}
                </div>
                <div style={{ fontSize: 10, opacity: 0.85, minHeight: 12 }}>
                  {d.leadCount > 0 ? `${d.leadCount}客` : ''}
                </div>
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
  const key = mapPlatformToKey(platform);
  if (key === 'xiaohongshu') return '#ff2442';
  if (key === 'douyin') return '#161616';
  if (platform.includes('xhslink')) return '#ff2442';
  if (platform.includes('iesdouyin')) return '#161616';
  return '#bfbfbf';
}

const POST_TYPE_GROUPS: { type: string; label: string; color: string }[] = [
  { type: '获客贴', label: '获客贴', color: '#fa8c16' },
  { type: '话题贴', label: '话题贴', color: '#1677ff' },
  { type: '素人贴', label: '素人贴', color: '#52c41a' },
];

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
