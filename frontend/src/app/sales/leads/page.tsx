'use client';

import {
  CheckCircleOutlined,
  FileTextOutlined,
  FireOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  TagOutlined,
} from '@ant-design/icons';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  listSalesLeads,
  markLeadContactAdded,
  reassignLead,
  updateLeadIntentionLevel,
} from '@/shared/api/leads';
import { apiClient } from '@/shared/api/apiClient';
import { getCapacityStatus, toggleCapacityPaused } from '@/shared/api/catalog';
import { ReminderButton } from '@/shared/components/notifications/ReminderButton';
import { StatusTag } from '@/shared/components/status';
import { formatDateTime } from '@/shared/utils/date-format';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { buildOperationReminderTarget } from './leadReminderTarget';
import { buildTodayDateRange } from '@/shared/utils/default-date-range';
import {
  LeadAddStatus,
  LeadProcessStatus,
  LeadStatus,
} from '@/shared/constants/lead-status-enums';
import type { IntentionLevelCode, SalesLead } from '@/shared/types/leads';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '新分配', value: LeadStatus.ASSIGNED },
  { label: '跟进中', value: LeadStatus.IN_FOLLOWUP },
  { label: '无效', value: LeadStatus.INVALID },
];

const addStatusOptions = [
  { label: '全部添加状态', value: '' },
  { label: '未添加', value: LeadAddStatus.NOT_ADDED },
  { label: '已申请添加', value: LeadAddStatus.APPLIED },
  { label: '客户未通过', value: LeadAddStatus.NOT_PASSED },
  { label: '运营已提醒', value: LeadAddStatus.OPERATION_REMINDED },
  { label: '已添加通过', value: LeadAddStatus.ADDED },
];

const intentionLevelOptions = [
  { label: '全部意向度', value: '' },
  { label: '高', value: 'high' },
  { label: '中', value: 'mid' },
  { label: '低', value: 'low' },
  { label: '无效', value: 'invalid' },
  { label: '待判断', value: 'pending' },
];

const intentionLevelMeta: Record<IntentionLevelCode, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  mid: { label: '中', color: 'orange' },
  low: { label: '低', color: 'blue' },
  invalid: { label: '无效', color: 'default' },
  pending: { label: '待判断', color: 'default' },
};

type Filters = {
  status: string;
  addStatus: string;
  intentionLevel: string;
  dateRange: DateRangeValue;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  addStatus: '',
  intentionLevel: '',
  dateRange: null,
  search: '',
};

function buildDefaultFilters(): Filters {
  return { ...EMPTY_FILTERS, dateRange: buildTodayDateRange() };
}

type FollowFormValues = {
  clientDegree?: string;
  clientMajorResearch?: string;
  clientTimeRequirement?: string;
  objectionPoint?: string;
  intentionLevel?: IntentionLevelCode;
  invalidReason?: string;
  followAction?: string;
  content?: string;
  nextFollowTime?: Dayjs | null;
};

type IntentionFormValues = {
  intentionLevel: IntentionLevelCode;
  invalidReason?: string;
};

function isTodayNotAdded(lead: SalesLead): boolean {
  if (lead.addStatus !== LeadAddStatus.NOT_ADDED) return false;
  if (!lead.assignedAt) return false;
  const today = new Date();
  const assigned = new Date(lead.assignedAt);
  return (
    assigned.getFullYear() === today.getFullYear() &&
    assigned.getMonth() === today.getMonth() &&
    assigned.getDate() === today.getDate()
  );
}

export default function SalesLeadsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [filters, setFilters] = useState<Filters>(() => buildDefaultFilters());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 行内操作
  const [followOpen, setFollowOpen] = useState<SalesLead | null>(null);
  const [intentionOpen, setIntentionOpen] = useState<SalesLead | null>(null);
  const [reassignOpen, setReassignOpen] = useState<SalesLead | null>(null);
  const [reassignForm] = Form.useForm<{ newAssigneeId: string; reason?: string }>();
  const [reassignCandidates, setReassignCandidates] = useState<Array<{ id: string; name: string }>>([]);

  const [followForm] = Form.useForm<FollowFormValues>();
  const [intentionForm] = Form.useForm<IntentionFormValues>();

  const [submitting, setSubmitting] = useState(false);

  // 客资容量上限状态
  const [capacityPaused, setCapacityPaused] = useState(false);
  const [capacityPausedAt, setCapacityPausedAt] = useState<string | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [remainSeconds, setRemainSeconds] = useState(0);

  async function loadLeads(nextPage = page, nextPageSize = pageSize, nextFilters: Filters = filters) {
    setLoading(true);
    setError('');
    try {
      const result = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        ...buildListQuery(nextFilters),
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '客资列表加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  // WebSocket 实时刷新：通知过来时刷新客资列表
  const sockToken = typeof window !== 'undefined' ? window.localStorage.getItem('xhsmedium.token') : null;
  const sockUser = typeof window !== 'undefined' ? readAuthenticatedUser() : undefined;
  const { onMessage, connected } = useNotificationSocket({ token: sockToken, userId: sockUser?.id ?? null });
  const loadRef = useRef(loadLeads);
  loadRef.current = loadLeads;
  useEffect(() => {
    const unsubscribe = onMessage(() => {
      loadRef.current();
    });
    return unsubscribe;
  }, [onMessage]);

  // Socket 重新连上时刷新一次：补偿断线期间遗漏的分配通知
  useEffect(() => {
    if (connected) {
      loadRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // 浏览器标签切回时自动刷新：补偿 WebSocket 断线期间遗漏的分配通知
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // 短轮询兜底：WebSocket 不可靠或断线时，每 10 秒刷新一次
  useEffect(() => {
    const timer = window.setInterval(() => {
      loadRef.current();
    }, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    loadLeads(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.addStatus, filters.intentionLevel, filters.dateRange?.start.valueOf(), filters.dateRange?.end.valueOf(), filters.search]);

  // 加载客资容量上限状态
  useEffect(() => {
    getCapacityStatus()
      .then((result) => {
        setCapacityPaused(result.capacityPaused);
        setCapacityPausedAt(result.capacityPausedAt);
      })
      .catch(() => {
        // 静默失败，不影响主流程
      });
  }, [connected, loading]);

  // 倒计时：已达上限后显示剩余自动恢复时间
  useEffect(() => {
    if (!capacityPaused || !capacityPausedAt) {
      setRemainSeconds(0);
      return;
    }
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const pausedAt = new Date(capacityPausedAt).getTime();

    function tick() {
      const elapsed = Date.now() - pausedAt;
      const remain = Math.max(0, Math.ceil((ONE_HOUR_MS - elapsed) / 1000));
      setRemainSeconds(remain);
      if (remain <= 0) {
        // 自动恢复
        setCapacityPaused(false);
        setCapacityPausedAt(null);
      }
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [capacityPaused, capacityPausedAt]);

  const sortedItems = useMemo(() => {
    // 「我的客资」= 待处理客资（未添加 + 中间态），已添加的（addStatus=added）应去「客资跟进」。
    // 后端 findFilteredPaged 在 sales scope 下不强制过滤 addStatus=added，
    // 这里前端做一次 client-side 过滤，避免已添加客资混在"我的客资"里。
    const visible = items.filter((lead) => lead.addStatus !== LeadAddStatus.ADDED);
    // 今日未添加置顶
    return [...visible].sort((a, b) => {
      const aT = isTodayNotAdded(a) ? 1 : 0;
      const bT = isTodayNotAdded(b) ? 1 : 0;
      if (aT !== bT) return bT - aT;
      // 然后按更新时间倒序
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [items]);

  function openFollow(lead: SalesLead) {
    setFollowOpen(lead);
    followForm.setFieldsValue({
      clientDegree: lead.clientDegree || undefined,
      clientMajorResearch: lead.clientMajorResearch || undefined,
      clientTimeRequirement: lead.clientTimeRequirement || undefined,
      objectionPoint: lead.objectionPoint || undefined,
      intentionLevel: (lead.intentionLevel as IntentionLevelCode) || undefined,
      invalidReason: lead.invalidReason || undefined,
      followAction: lead.followAction || undefined,
      content: undefined,
      nextFollowTime: lead.nextFollowAt ? dayjs(lead.nextFollowAt) : null,
    });
  }

  async function submitFollow() {
    if (!followOpen) return;
    const values = await followForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      // 先写跟进记录（同时回写 leads 字段）
      await import('@/shared/api/leads').then(({ createLeadFollowRecord }) =>
        createLeadFollowRecord(String(followOpen.id), {
          content: values.content || '',
          clientDegree: values.clientDegree || null,
          clientMajorResearch: values.clientMajorResearch || null,
          clientTimeRequirement: values.clientTimeRequirement || null,
          objectionPoint: values.objectionPoint || null,
          followAction: values.followAction || null,
          followActionAt: new Date().toISOString(),
          intentionLevel: values.intentionLevel || followOpen.intentionLevel,
          invalidReason: (values.intentionLevel || followOpen.intentionLevel) === 'invalid' ? (values.invalidReason || null) : null,
          nextFollowTime: values.nextFollowTime ? values.nextFollowTime.toISOString() : undefined,
        }),
      );
      message.success('跟进记录已保存');
      setFollowOpen(null);
      followForm.resetFields();
      await loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '跟进保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openIntention(lead: SalesLead) {
    setIntentionOpen(lead);
    intentionForm.setFieldsValue({
      intentionLevel: (lead.intentionLevel as IntentionLevelCode) || 'pending',
      invalidReason: lead.invalidReason || undefined,
    });
  }

  async function submitIntention() {
    if (!intentionOpen) return;
    const values = await intentionForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      const result = await updateLeadIntentionLevel(String(intentionOpen.id), {
        intentionLevel: values.intentionLevel,
        invalidReason: values.intentionLevel === 'invalid' ? (values.invalidReason || null) : null,
      });
      if (result.lead) {
        setItems((prev) => prev.map((item) => (
          String(item.id) === String(intentionOpen.id) ? { ...item, ...result.lead } : item
        )));
      }
      message.success('意向程度已更新');
      setIntentionOpen(null);
      intentionForm.resetFields();
      await loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新意向程度失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function copyWechat(lead: SalesLead) {
    const value = (lead.contact || '').trim();
    if (!value) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      message.success('微信已复制');
      // 复制成功后更新处理状态为"待通过"（如果当前是"未联系"）
      if (lead.processStatus === 'not_contacted') {
        try {
          await apiClient.request(`/leads/${lead.id}/status`, {
            method: 'PATCH',
            body: { processStatus: 'waiting_pass' },
          });
          await loadLeads(page, pageSize, filters);
        } catch {
          // 静默失败，不影响复制体验
        }
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '复制失败');
    }
  }

  function openReassign(lead: SalesLead) {
    setReassignOpen(lead);
    reassignForm.resetFields();
    // Fetch candidates list lazily (filter out current assignee)
    void (async () => {
      try {
        const { listReassignCandidates } = await import('@/shared/api/leads');
        const list = await listReassignCandidates();
        const filtered = list.filter((u) => String(u.id) !== String(lead.sales?.id || ''));
        setReassignCandidates(filtered);
      } catch (err) {
        message.warning(err instanceof Error ? err.message : '加载可选销售失败');
        setReassignCandidates([]);
      }
    })();
  }

  async function submitReassign() {
    if (!reassignOpen) return;
    const values = await reassignForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await reassignLead(String(reassignOpen.id), {
        newAssigneeId: values.newAssigneeId,
        reason: values.reason,
      });
      message.success('改派成功');
      setReassignOpen(null);
      reassignForm.resetFields();
      await loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '改派失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkContactAdded(lead: SalesLead) {
    try {
      await markLeadContactAdded(String(lead.id));
      message.success('已添加联系方式', 1.5);
      await loadLeads(page, pageSize, filters);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function handleToggleCapacity() {
    setCapacityLoading(true);
    try {
      const result = await toggleCapacityPaused();
      setCapacityPaused(result.capacityPaused);
      setCapacityPausedAt(result.capacityPausedAt);
      message.success(result.capacityPaused ? '已标记为已达上限，1小时后自动恢复' : '已恢复为可接客资');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setCapacityLoading(false);
    }
  }

  function formatRemainTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const columns = useMemo<TableColumnsType<SalesLead>>(() => [
    {
      title: '客户',
      key: 'customer',
      render: (_v, lead) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Typography.Text strong>
              {lead.customerName}
              {lead.salesRemark ? (
                <Typography.Text type="secondary" style={{ fontSize: 13 }}> ({lead.salesRemark})</Typography.Text>
              ) : null}
            </Typography.Text>
            {isTodayNotAdded(lead) ? (
              <Tag color="red" icon={<FireOutlined />}>今日未添加</Tag>
            ) : null}
          </Space>
          {(lead.contact || '').trim() ? (
            <Typography.Text
              type="secondary"
              copyable={{ tooltips: ['复制联系方式', '已复制'], onCopy: () => copyWechat(lead) }}
              style={{ cursor: 'pointer' }}
            >
              {lead.contact}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">暂无联系方式</Typography.Text>
          )}
          {lead.wechat ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              微信: {lead.wechat}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '运营',
      key: 'operator',
      width: 100,
      render: (_v, lead) => lead.operator?.name || '-',
    },
    {
      title: 'IP / 地区',
      dataIndex: 'ip',
      key: 'ip',
      width: 120,
      // 我的客资以协同加好友为主，IP/地区挪到详情查看
      hidden: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '客户学历',
      key: 'clientDegree',
      width: 100,
      render: (_v, lead) => lead.clientDegree || '-',
    },
    {
      title: '客户需求',
      key: 'requirement',
      width: 200,
      ellipsis: true,
      render: (_v, lead) => lead.requirementNote || lead.note || '-',
    },
    {
      title: '专业/研究方向',
      key: 'major',
      width: 180,
      ellipsis: true,
      render: (_v, lead) => lead.clientMajorResearch || '-',
    },
    {
      title: '时间要求',
      key: 'timeRequirement',
      width: 140,
      ellipsis: true,
      // 我的客资以协同加好友为主，时间要求挪到详情查看
      hidden: true,
      render: (_v, lead) => lead.clientTimeRequirement || '-',
    },
    {
      title: '异议点',
      key: 'objectionPoint',
      width: 160,
      ellipsis: true,
      // 我的客资以协同加好友为主，异议点挪到详情查看
      hidden: true,
      render: (_v, lead) => lead.objectionPoint || '-',
    },
    {
      title: '意向程度',
      key: 'intentionLevel',
      render: (_v, lead) => {
        const code = (lead.intentionLevel as IntentionLevelCode) || 'pending';
        const meta = intentionLevelMeta[code] || { label: code, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '跟进措施',
      key: 'followAction',
      width: 180,
      ellipsis: true,
      // v1.3 / SA-13: 精简客资列表 — 暂时隐藏 "跟进措施"，需要时从详情查看
      hidden: true,
      render: (_v, lead) => lead.followAction || '-',
    },
    {
      title: '下次跟进',
      key: 'nextFollow',
      width: 150,
      // v1.3 / SA-13: 精简 — 暂时隐藏
      hidden: true,
      render: (_v, lead) => lead.nextFollowAt ? formatDateTime(lead.nextFollowAt) : '-',
    },
    {
      title: '最近跟进',
      key: 'latestFollow',
      width: 150,
      // v1.3 / SA-13: 精简 — 暂时隐藏
      hidden: true,
      render: (_v, lead) => lead.latestFollowAt ? formatDateTime(lead.latestFollowAt) : '-',
    },
    {
      title: '添加状态',
      key: 'addStatus',
      render: (_v, lead) => <StatusTag kind="addStatus" code={lead.addStatus ?? LeadAddStatus.NOT_ADDED} />,
    },
    {
      title: '处理状态',
      key: 'processStatus',
      render: (_v, lead) => <StatusTag kind="processStatus" code={lead.processStatus ?? LeadProcessStatus.NOT_CONTACTED} />,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_v, lead) => {
        const reminderTarget = buildOperationReminderTarget(lead);
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space size={4} wrap>
              <Tooltip title="查看客资详情">
                <Button size="small" onClick={() => router.push(`/sales/leads/${lead.id}`)}>详情</Button>
              </Tooltip>
              {/* 「我的客资」页不开放"写跟进"按钮（写跟进统一去「客资跟进」页操作）。 */}
              {/* 已添加联系方式：仅对 addStatus=not_added 的客资显示，
                  点击后 addStatus=added，客资从「我的客资」消失并出现在「客资跟进」。 */}
              {lead.addStatus === LeadAddStatus.NOT_ADDED ? (
                <Button
                  size="small"
                  type="primary"
                  onClick={() => handleMarkContactAdded(lead)}
                >
                  已添加联系方式
                </Button>
              ) : null}
            </Space>
            <Space size={4} wrap>
              <Button
                size="small"
                icon={<TagOutlined />}
                onClick={() => openIntention(lead)}
              >
                意向程度
              </Button>
              {/* v1.3 / SA-12: 改派 — 调整当前销售归属（主管/销售本人都可发起） */}
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => openReassign(lead)}
              >
                改派
              </Button>
              {reminderTarget.recipientId ? (
                <ReminderButton
                  size="small"
                  recipientId={reminderTarget.recipientId}
                  recipientName={reminderTarget.recipientName}
                  recipientRole="operation"
                  relatedType="lead"
                  relatedId={String(lead.id)}
                  relatedTitle={lead.customerName || lead.leadCode}
                  content={`客资 ${lead.customerName || lead.id} 需要运营协助`}
                >
                  提醒
                </ReminderButton>
              ) : null}
            </Space>
          </Space>
        );
      },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [router]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 容量上限状态横幅：仅在"已达上限"时显示 */}
      {capacityPaused ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px',
            background: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
          }}
        >
          <Space size={8}>
            <PauseCircleOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            <Typography.Text strong style={{ color: '#ff4d4f' }}>
              当前已达客资上限，运营端将看到红色提示
            </Typography.Text>
            {remainSeconds > 0 ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {formatRemainTime(remainSeconds)} 后自动恢复
              </Typography.Text>
            ) : null}
          </Space>
          <Button
            danger
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={capacityLoading}
            onClick={handleToggleCapacity}
          >
            恢复接客资
          </Button>
        </div>
      ) : null}

      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>我的客资</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看分配给当前销售的客资，进入详情继续跟进；今日未添加的客资会红标置顶。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Input
            prefix={<SearchOutlined />}
            placeholder="按微信昵称/微信号搜索"
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={filters.status}
            options={statusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value }))}
            style={{ width: 140 }}
            placeholder="状态"
          />
          <Select
            value={filters.addStatus}
            options={addStatusOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, addStatus: value }))}
            style={{ width: 150 }}
            placeholder="添加状态"
          />
          <Select
            value={filters.intentionLevel}
            options={intentionLevelOptions}
            onChange={(value) => setFilters((prev) => ({ ...prev, intentionLevel: value }))}
            style={{ width: 130 }}
            placeholder="意向度"
          />
          <QuickRangePicker
            value={filters.dateRange}
            onChange={(range) => {
              const next = { ...filters, dateRange: range ?? buildTodayDateRange() };
              setFilters(next);
              loadLeads(1, pageSize, next);
            }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadLeads()} loading={loading}>
            刷新
          </Button>
          <Button
            type={capacityPaused ? 'default' : 'primary'}
            icon={capacityPaused ? <CheckCircleOutlined /> : <PauseCircleOutlined />}
            loading={capacityLoading}
            onClick={handleToggleCapacity}
            style={
              !capacityPaused
                ? { borderColor: '#52c41a', color: '#52c41a' }
                : undefined
            }
          >
            {capacityPaused ? '可接客资' : '已达上限'}
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {sortedItems.length ? (
            <Table<SalesLead>
              rowKey="id"
              columns={columns}
              dataSource={sortedItems}
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="middle"
            />
          ) : (
            <Empty description="暂无客资" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => loadLeads(nextPage, nextPageSize, filters)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>

      {/* 写跟进弹窗（SA-1） */}
      <Modal
        title={followOpen ? `写跟进 · ${followOpen.customerName}` : '写跟进'}
        open={Boolean(followOpen)}
        onCancel={() => { setFollowOpen(null); followForm.resetFields(); }}
        onOk={submitFollow}
        confirmLoading={submitting}
        width={720}
        destroyOnClose
        okText="保存跟进"
      >
        <Form form={followForm} layout="vertical" preserve={false}>
          <div className="form-grid">
            <Form.Item name="clientDegree" label="客户学历">
              <AutoComplete
                allowClear
                placeholder="本科/硕士/博士..."
                maxLength={10}
                options={[
                  { value: '本科' },
                  { value: '硕士' },
                  { value: '博士' },
                  { value: '大专' },
                  { value: '在职' },
                ]}
              />
            </Form.Item>
            <Form.Item name="clientMajorResearch" label="专业 / 研究方向">
              <Input placeholder="如：计算机科学与技术 · 人工智能方向" />
            </Form.Item>
            <Form.Item name="clientTimeRequirement" label="时间要求">
              <Input placeholder="如：2 个月内、年底前" />
            </Form.Item>
            <Form.Item name="objectionPoint" label="异议点">
              <Input placeholder="如：价格太贵 / 导师不同意" />
            </Form.Item>
            <Form.Item name="intentionLevel" label="意向程度">
              <Select
                allowClear
                options={[
                  { label: '高', value: 'high' },
                  { label: '中', value: 'mid' },
                  { label: '低', value: 'low' },
                  { label: '无效', value: 'invalid' },
                  { label: '待判断', value: 'pending' },
                ]}
              />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.intentionLevel !== next.intentionLevel}>
              {({ getFieldValue }) => (
                getFieldValue('intentionLevel') === 'invalid' ? (
                  <Form.Item name="invalidReason" label="无效原因" rules={[{ required: true, message: '请输入无效原因' }]}>
                    <Input.TextArea rows={2} placeholder="请输入无效原因" />
                  </Form.Item>
                ) : null
              )}
            </Form.Item>
            <Form.Item name="followAction" label="具体跟进措施">
              <Input placeholder="如：明天下午 3 点发修改方案" />
            </Form.Item>
            <Form.Item name="nextFollowTime" label="下次跟进时间" className="full-row">
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="content" label="跟进备注" className="full-row" rules={[{ required: true, message: '请输入跟进内容' }]}>
              <Input.TextArea rows={3} placeholder="记录本次沟通重点和下一步动作" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 更新意向程度（SA-3） */}
      <Modal
        title={intentionOpen ? `更新意向程度 · ${intentionOpen.customerName}` : '更新意向程度'}
        open={Boolean(intentionOpen)}
        onCancel={() => { setIntentionOpen(null); intentionForm.resetFields(); }}
        onOk={submitIntention}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={intentionForm} layout="vertical" preserve={false}>
          <Form.Item name="intentionLevel" label="意向程度" rules={[{ required: true, message: '请选择意向程度' }]}>
            <Select
              options={[
                { label: '高', value: 'high' },
                { label: '中', value: 'mid' },
                { label: '低', value: 'low' },
                { label: '无效', value: 'invalid' },
                { label: '待判断', value: 'pending' },
              ]}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.intentionLevel !== next.intentionLevel}>
            {({ getFieldValue }) => (
              getFieldValue('intentionLevel') === 'invalid' ? (
                <Form.Item name="invalidReason" label="无效原因" rules={[{ required: true, message: '请输入无效原因' }]}>
                  <Input.TextArea rows={2} placeholder="请输入无效原因" />
                </Form.Item>
              ) : null
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 改派（SA-12） */}
      <Modal
        title={reassignOpen ? `改派客资 · ${reassignOpen.customerName}` : '改派客资'}
        open={Boolean(reassignOpen)}
        onCancel={() => { setReassignOpen(null); reassignForm.resetFields(); }}
        onOk={submitReassign}
        confirmLoading={submitting}
        destroyOnClose
        okText="确认改派"
      >
        <Form form={reassignForm} layout="vertical" preserve={false}>
          <Form.Item name="newAssigneeId" label="新归属销售" rules={[{ required: true, message: '请选择新销售' }]}>
            <Select
              showSearch
              placeholder="选择接手的销售"
              optionFilterProp="label"
              options={reassignCandidates.map((u) => ({ label: u.name, value: u.id }))}
            />
          </Form.Item>
          <Form.Item name="reason" label="改派原因">
            <Input.TextArea rows={3} placeholder="可选：说明改派背景（将写入操作日志）" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}

function buildListQuery(filters: Filters) {
  return {
    status: filters.status || undefined,
    addStatus: filters.addStatus || undefined,
    intentionLevel: filters.intentionLevel || undefined,
    // 用 YYYY-MM-DD 本地日期字符串，让后端 normalizeDayBoundary 补成 00:00:00 / 23:59:59，避免 ISO 时区偏差
    from: filters.dateRange ? filters.dateRange.start.startOf('day').format('YYYY-MM-DD') : undefined,
    to: filters.dateRange ? filters.dateRange.end.endOf('day').format('YYYY-MM-DD') : undefined,
    search: filters.search || undefined,
  };
}
