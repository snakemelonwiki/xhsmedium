'use client';

import {
  FileTextOutlined,
  FireOutlined,
  ReloadOutlined,
  SearchOutlined,
  SwapOutlined,
  TagOutlined,
} from '@ant-design/icons';
import {
  Alert,
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
import { useEffect, useMemo, useState } from 'react';

import {
  listSalesLeads,
  markLeadContactAdded,
  reassignLead,
  updateLeadIntentionLevel,
} from '@/shared/api/leads';
import { ReminderButton } from '@/shared/components/notifications/ReminderButton';
import { StatusTag } from '@/shared/components/status';
import { formatDateTime } from '@/shared/utils/date-format';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import {
  LeadAddStatus,
  LeadProcessStatus,
  LeadStatus,
} from '@/shared/constants/lead-status-enums';
import type { IntentionLevelCode, SalesLead } from '@/shared/types/leads';

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

type FollowFormValues = {
  clientDegree?: string;
  clientMajorResearch?: string;
  clientTimeRequirement?: string;
  objectionPoint?: string;
  intentionLevel?: IntentionLevelCode;
  followAction?: string;
  content?: string;
  nextFollowTime?: Dayjs | null;
};

type IntentionFormValues = {
  intentionLevel: IntentionLevelCode;
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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
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

  useEffect(() => {
    loadLeads(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.addStatus, filters.intentionLevel, filters.dateRange?.start.valueOf(), filters.dateRange?.end.valueOf(), filters.search]);

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
    });
  }

  async function submitIntention() {
    if (!intentionOpen) return;
    const values = await intentionForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await updateLeadIntentionLevel(String(intentionOpen.id), {
        intentionLevel: values.intentionLevel,
      });
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

  const columns = useMemo<TableColumnsType<SalesLead>>(() => [
    {
      title: '客户',
      key: 'customer',
      render: (_v, lead) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Typography.Text strong>{lead.customerName}</Typography.Text>
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
        </Space>
      ),
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
      // 我的客资以协同加好友为主，学历信息挪到详情查看
      hidden: true,
      render: (_v, lead) => lead.clientDegree || '-',
    },
    {
      title: '客户需求',
      key: 'requirement',
      width: 200,
      ellipsis: true,
      // 我的客资以协同加好友为主，客户需求挪到详情查看
      hidden: true,
      render: (_v, lead) => lead.requirementNote || lead.note || '-',
    },
    {
      title: '专业/研究方向',
      key: 'major',
      width: 180,
      ellipsis: true,
      // 我的客资以协同加好友为主，专业方向挪到详情查看
      hidden: true,
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
      render: (_v, lead) => (
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
            {lead.sales?.id ? (
              <ReminderButton
                size="small"
                recipientId={String(lead.sales.id)}
                recipientName={lead.sales?.name}
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
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [router]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
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
            placeholder="按联系方式/客户姓名搜索"
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
            onChange={(range) => setFilters((prev) => ({ ...prev, dateRange: range }))}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadLeads()} loading={loading}>
            刷新
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
              <Select
                allowClear
                placeholder="本科/硕士/博士..."
                options={[
                  { label: '本科', value: '本科' },
                  { label: '硕士', value: '硕士' },
                  { label: '博士', value: '博士' },
                  { label: '大专', value: '大专' },
                  { label: '其他', value: '其他' },
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
    startDate: filters.dateRange ? filters.dateRange.start.startOf('day').toISOString() : undefined,
    endDate: filters.dateRange ? filters.dateRange.end.endOf('day').toISOString() : undefined,
    search: filters.search || undefined,
  };
}
