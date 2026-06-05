'use client';

import {
  EditOutlined,
  FileTextOutlined,
  FireOutlined,
  ReloadOutlined,
  SearchOutlined,
  TagOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
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
  updateLeadDealStatus,
  updateLeadIntentionLevel,
  type CloseLeadDealPayload,
} from '@/shared/api/leads';
import { ReminderButton } from '@/shared/components/notifications/ReminderButton';
import { StatusTag } from '@/shared/components/status';
import { formatDateTime } from '@/shared/utils/date-format';
import {
  LeadAddStatus,
  LeadProcessStatus,
  LeadStatus,
} from '@/shared/constants/lead-status-enums';
import type { DealStatusCode, IntentionLevelCode, SalesLead } from '@/shared/types/leads';

const { RangePicker } = DatePicker;

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '新分配', value: LeadStatus.ASSIGNED },
  { label: '跟进中', value: LeadStatus.IN_FOLLOWUP },
  { label: '已成交', value: 'deal_done' },
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

const dealStatusOptions: { label: string; value: DealStatusCode }[] = [
  { label: '未成交', value: 'not_deal' },
  { label: '待成交', value: 'deal_pending' },
  { label: '已成交', value: 'deal_done' },
  { label: '已退款', value: 'refunded' },
  { label: '无效', value: 'invalid' },
];

const dealStatusMeta: Record<DealStatusCode, { label: string; color: string }> = {
  not_deal: { label: '未成交', color: 'default' },
  deal_pending: { label: '待成交', color: 'orange' },
  deal_done: { label: '已成交', color: 'green' },
  refunded: { label: '已退款', color: 'magenta' },
  invalid: { label: '无效', color: 'red' },
};

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
  startDate: string;
  endDate: string;
  search: string;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  addStatus: '',
  intentionLevel: '',
  startDate: '',
  endDate: '',
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

type DealStatusFormValues = {
  dealStatus: DealStatusCode;
  dealAmount?: number | string | null;
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
  const [dealStatusOpen, setDealStatusOpen] = useState<SalesLead | null>(null);
  const [intentionOpen, setIntentionOpen] = useState<SalesLead | null>(null);
  const [closeDealOpen, setCloseDealOpen] = useState<SalesLead | null>(null);

  const [followForm] = Form.useForm<FollowFormValues>();
  const [dealStatusForm] = Form.useForm<DealStatusFormValues>();
  const [intentionForm] = Form.useForm<IntentionFormValues>();
  const [closeDealForm] = Form.useForm<CloseLeadDealPayload & { clientRequirementNote?: string }>();

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
  }, [filters.status, filters.addStatus, filters.intentionLevel, filters.startDate, filters.endDate, filters.search]);

  const sortedItems = useMemo(() => {
    // 今日未添加置顶
    return [...items].sort((a, b) => {
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

  function openDealStatus(lead: SalesLead) {
    setDealStatusOpen(lead);
    dealStatusForm.setFieldsValue({
      dealStatus: (lead.dealStatus as DealStatusCode) || 'not_deal',
      dealAmount: lead.dealAmount || undefined,
    });
  }

  async function submitDealStatus() {
    if (!dealStatusOpen) return;
    const values = await dealStatusForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await updateLeadDealStatus(String(dealStatusOpen.id), {
        dealStatus: values.dealStatus,
        dealAmount: values.dealAmount ?? null,
      });
      message.success('成交状态已更新');
      setDealStatusOpen(null);
      dealStatusForm.resetFields();
      await loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新成交状态失败');
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

  function openCloseDeal(lead: SalesLead) {
    setCloseDealOpen(lead);
    closeDealForm.resetFields();
  }

  async function submitCloseDeal() {
    if (!closeDealOpen) return;
    const values = await closeDealForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      const { closeLeadDeal } = await import('@/shared/api/leads');
      const result = await closeLeadDeal(String(closeDealOpen.id), values);
      message.success(`已标记成交，订单号 ${result.orderCode || result.orderId || ''}`);
      setCloseDealOpen(null);
      closeDealForm.resetFields();
      await loadLeads();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '成交提交失败');
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo<TableColumnsType<SalesLead>>(() => [
    {
      title: '客户',
      key: 'customer',
      width: 200,
      fixed: 'left',
      render: (_v, lead) => (
        <Space direction="vertical" size={0}>
          <Space size={6}>
            <Typography.Text strong>{lead.customerName}</Typography.Text>
            {isTodayNotAdded(lead) ? (
              <Tag color="red" icon={<FireOutlined />}>今日未添加</Tag>
            ) : null}
          </Space>
          <Typography.Text type="secondary">{lead.contact || '暂无联系方式'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'IP / 地区',
      dataIndex: 'ip',
      key: 'ip',
      width: 120,
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
      render: (_v, lead) => lead.clientTimeRequirement || '-',
    },
    {
      title: '异议点',
      key: 'objectionPoint',
      width: 160,
      ellipsis: true,
      render: (_v, lead) => lead.objectionPoint || '-',
    },
    {
      title: '意向程度',
      key: 'intentionLevel',
      width: 90,
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
      render: (_v, lead) => lead.followAction || '-',
    },
    {
      title: '下次跟进',
      key: 'nextFollow',
      width: 150,
      render: (_v, lead) => lead.nextFollowAt ? formatDateTime(lead.nextFollowAt) : '-',
    },
    {
      title: '最近跟进',
      key: 'latestFollow',
      width: 150,
      render: (_v, lead) => lead.latestFollowAt ? formatDateTime(lead.latestFollowAt) : '-',
    },
    {
      title: '添加状态',
      key: 'addStatus',
      width: 110,
      render: (_v, lead) => <StatusTag kind="addStatus" code={lead.addStatus ?? LeadAddStatus.NOT_ADDED} />,
    },
    {
      title: '处理状态',
      key: 'processStatus',
      width: 100,
      render: (_v, lead) => <StatusTag kind="processStatus" code={lead.processStatus ?? LeadProcessStatus.NOT_CONTACTED} />,
    },
    {
      title: '订单状态',
      key: 'dealStatus',
      width: 100,
      render: (_v, lead) => {
        const code = (lead.dealStatus as DealStatusCode) || 'not_deal';
        const meta = dealStatusMeta[code] || { label: code, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      fixed: 'right',
      render: (_v, lead) => (
        <Space size={4} wrap>
          <Tooltip title="查看客资详情">
            <Button size="small" onClick={() => router.push(`/sales/leads/${lead.id}`)}>详情</Button>
          </Tooltip>
          <Button
            size="small"
            type="primary"
            ghost
            icon={<FileTextOutlined />}
            onClick={() => openFollow(lead)}
          >
            写跟进
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openDealStatus(lead)}
          >
            成交状态
          </Button>
          <Button
            size="small"
            icon={<TagOutlined />}
            onClick={() => openIntention(lead)}
          >
            意向程度
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => openCloseDeal(lead)}
            disabled={lead.dealStatus === 'deal_done'}
          >
            标记成交
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
              scroll={{ x: 1700 }}
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

      {/* 更新成交状态（SA-3） */}
      <Modal
        title={dealStatusOpen ? `更新成交状态 · ${dealStatusOpen.customerName}` : '更新成交状态'}
        open={Boolean(dealStatusOpen)}
        onCancel={() => { setDealStatusOpen(null); dealStatusForm.resetFields(); }}
        onOk={submitDealStatus}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={dealStatusForm} layout="vertical" preserve={false}>
          <Form.Item name="dealStatus" label="成交状态" rules={[{ required: true, message: '请选择成交状态' }]}>
            <Select options={dealStatusOptions} />
          </Form.Item>
          <Form.Item name="dealAmount" label="成交金额（元）">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
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

      {/* 成交弹窗（SA-8） */}
      <Modal
        title={closeDealOpen ? `标记成交 · ${closeDealOpen.customerName}` : '标记成交'}
        open={Boolean(closeDealOpen)}
        onCancel={() => { setCloseDealOpen(null); closeDealForm.resetFields(); }}
        onOk={submitCloseDeal}
        confirmLoading={submitting}
        width={680}
        destroyOnClose
        okText="提交成交"
      >
        <Form form={closeDealForm} layout="vertical" preserve={false}>
          <div className="form-grid">
            <Form.Item name="clientRequirementNote" label="客户要求备注" className="full-row">
              <Input.TextArea rows={2} placeholder="客户原始诉求、特殊情况等" />
            </Form.Item>
            <Form.Item name="productType" label="产品类型" rules={[{ required: true, message: '请选择产品类型' }]}>
              <Select
                placeholder="选择产品类型"
                options={[
                  { label: '专利', value: '专利' },
                  { label: '期刊论文', value: '期刊论文' },
                  { label: '硕士毕业论文', value: '硕士毕业论文' },
                  { label: '博士毕业论文', value: '博士毕业论文' },
                  { label: '基金', value: '基金' },
                  { label: 'EI 会议', value: 'EI会议' },
                  { label: '普刊', value: '普刊' },
                  { label: '国际会议', value: '国际会议' },
                ]}
              />
            </Form.Item>
            <Form.Item name="serviceType" label="服务类型" rules={[{ required: true, message: '请选择服务类型' }]}>
              <Select
                placeholder="选择服务类型"
                options={[
                  { label: '辅导', value: '辅导' },
                  { label: '全流程', value: '全流程' },
                  { label: '润色', value: '润色' },
                  { label: '返修', value: '返修' },
                  { label: '代投', value: '代投' },
                ]}
              />
            </Form.Item>
            <Form.Item name="guaranteeType" label="保障类型">
              <Select
                allowClear
                placeholder="选择保障类型"
                options={[
                  { label: '保录', value: '保录' },
                  { label: '保盲审', value: '保盲审' },
                  { label: '不保', value: '不保' },
                ]}
              />
            </Form.Item>
            <Form.Item name="amount" label="成交金额（元）" rules={[{ required: true, message: '请输入成交金额' }]}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="paymentStage" label="付款阶段" className="full-row">
              <Input placeholder="如：定金 / 中期 / 尾款" />
            </Form.Item>
          </div>
          <Alert
            type="info"
            showIcon
            message="订单编号（ORD-YYYYMMDD-XXXXX）由系统自动生成，无需手动填写。"
          />
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
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    search: filters.search || undefined,
  };
}
