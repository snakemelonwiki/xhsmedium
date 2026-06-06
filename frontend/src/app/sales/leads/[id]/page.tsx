'use client';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Timeline,
  Typography,
  message,
} from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

import {
  closeLeadDeal,
  createCollaborationTask,
  createLeadFollowRecord,
  getLeadDetail,
  listCollaborationTasks,
  listLeadFollowRecords,
  updateLeadBoard,
  updateLeadDealStatus,
  updateLeadIntentionLevel,
  type CloseLeadDealPayload,
} from '@/shared/api/leads';
import { listOrders } from '@/shared/api/orders';
import { LeadTimeline } from '@/shared/components/leads';
import { StatusTag } from '@/shared/components/status';
import { ReminderButton } from '@/shared/components/notifications/ReminderButton';
import { handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import {
  LeadAddStatus,
  LeadProcessStatus,
  LeadStatus,
  CollaborationStatus,
} from '@/shared/constants/lead-status-enums';
import { getStatusMeta } from '@/shared/constants/status';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import { formatDateTime } from '@/shared/utils/date-format';
import type { DealStatusCode, IntentionLevelCode, LeadTimelineItem, SalesLead } from '@/shared/types/leads';
import type { OrderItem } from '@/shared/types/orders';

const FOLLOW_TYPE_OPTIONS = [
  { label: '电话沟通', value: 'phone' },
  { label: '微信沟通', value: 'wechat' },
  { label: '添加好友', value: 'add_friend' },
  { label: '发资料', value: 'send_material' },
  { label: '报价', value: 'quote' },
  { label: '其他', value: 'other' },
];

const DEAL_STATUS_META: Record<DealStatusCode, { label: string; color: string }> = {
  not_deal: { label: '未成交', color: 'default' },
  deal_pending: { label: '待成交', color: 'orange' },
  deal_done: { label: '已成交', color: 'green' },
  refunded: { label: '已退款', color: 'magenta' },
  invalid: { label: '无效', color: 'red' },
};

const INTENTION_META: Record<IntentionLevelCode, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  mid: { label: '中', color: 'orange' },
  low: { label: '低', color: 'blue' },
  invalid: { label: '无效', color: 'default' },
  pending: { label: '待判断', color: 'default' },
};

type CloseDealFormValues = {
  amount?: number | string;
  serviceType?: string;
  productType?: string;
  guaranteeType?: string;
  paymentStage?: string;
  clientRequirementNote?: string;
  remark?: string;
};

type FollowFormValues = {
  clientDegree?: string;
  clientMajorResearch?: string;
  clientTimeRequirement?: string;
  objectionPoint?: string;
  intentionLevel?: IntentionLevelCode;
  followAction?: string;
  content?: string;
  nextFollowTime?: Dayjs | string | null;
};

type DealStatusFormValues = {
  dealStatus: DealStatusCode;
  dealAmount?: number | string;
};

type IntentionFormValues = {
  intentionLevel: IntentionLevelCode;
};

export default function SalesLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = String(params.id);
  const [lead, setLead] = useState<SalesLead>();
  const [timeline, setTimeline] = useState<LeadTimelineItem[]>([]);
  const [order, setOrder] = useState<OrderItem>();
  const [form] = Form.useForm<FollowFormValues>();
  const [dealStatusForm] = Form.useForm<DealStatusFormValues>();
  const [intentionForm] = Form.useForm<IntentionFormValues>();
  const [collaborationForm] = Form.useForm();
  const [closeDealForm] = Form.useForm<CloseDealFormValues>();
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [closeDealOpen, setCloseDealOpen] = useState(false);
  const [dealStatusOpen, setDealStatusOpen] = useState(false);
  const [intentionOpen, setIntentionOpen] = useState(false);
  const { submitting, run } = useSubmitLock();

  async function loadDetail() {
    const [detail, records, collaborations] = await Promise.all([
      getLeadDetail(leadId),
      listLeadFollowRecords(leadId).catch(() => []),
      listCollaborationTasks({ scope: 'requester', leadId, pageSize: 50 })
        .then((result) => result.items)
        .catch(() => []),
    ]);
    setLead(detail);
    setTimeline([...records, ...collaborations].sort(sortTimelineDesc));
    try {
      const result = await listOrders({ scope: 'sales', pageSize: 20 });
      const matched = result.items.filter((o) => String(o.leadId) === leadId);
      setOrder(matched[0] ?? undefined);
    } catch {
      setOrder(undefined);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // v1.3 / SA-12: 当客资已"已添加通过"时，自动滚动到订单跟进区；
  // 销售填写完"标记成交"后 lead 状态推进到 ADDED_SUCCESS，后端 / 订单列表页会同步刷新。
  useEffect(() => {
    if (!lead) return;
    if (lead.status === LeadStatus.ADDED_SUCCESS) {
      // 找到订单/教务交付区作为锚点（Descriptions 中 orderInfo 行）
      const target = document.querySelector('[data-anchor="order-followup"]');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [lead?.status, lead?.id]);

  async function submitFollow(values: FollowFormValues) {
    await run(async () => {
      try {
        const nextFollowTime = values.nextFollowTime
          ? typeof values.nextFollowTime === 'string'
            ? values.nextFollowTime
            : (values.nextFollowTime as Dayjs).toISOString()
          : undefined;
        await createLeadFollowRecord(leadId, {
          content: values.content,
          clientDegree: values.clientDegree || null,
          clientMajorResearch: values.clientMajorResearch || null,
          clientTimeRequirement: values.clientTimeRequirement || null,
          objectionPoint: values.objectionPoint || null,
          followAction: values.followAction || null,
          followActionAt: new Date().toISOString(),
          intentionLevel: values.intentionLevel,
          nextFollowTime,
        });
        message.success('跟进记录已保存');
        form.resetFields();
        await loadDetail();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '跟进记录保存失败');
      }
    });
  }

  async function requestCollaboration(values: { type: string; reason: string; remark?: string; urgency?: string }) {
    await run(async () => {
      try {
        await createCollaborationTask({ leadId, ...values });
        await updateLeadBoard(leadId, {
          status: LeadStatus.IN_COLLABORATION,
          collaborationStatus: CollaborationStatus.PENDING,
          followNote: values.reason,
        }).catch(() => undefined);
        message.success('已发起运营协同');
        setCollaborationOpen(false);
        collaborationForm.resetFields();
        await loadDetail();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '协同申请提交失败');
      }
    });
  }

  async function submitCloseDeal(values: CloseDealFormValues) {
    await run(async () => {
      try {
        const result = await closeLeadDeal(leadId, {
          amount: values.amount ?? null,
          serviceType: values.serviceType ?? null,
          productType: values.productType ?? null,
          guaranteeType: values.guaranteeType ?? null,
          paymentStage: values.paymentStage ?? null,
          clientRequirementNote: values.clientRequirementNote ?? null,
          remark: values.remark ?? null,
        });
        message.success(`已标记成交，订单编号 ${result.orderCode || result.orderId || ''}`);
        setCloseDealOpen(false);
        closeDealForm.resetFields();
        await loadDetail();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '标记成交失败');
      }
    });
  }

  async function submitDealStatus() {
    const values = await dealStatusForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await updateLeadDealStatus(leadId, {
        dealStatus: values.dealStatus,
        dealAmount: values.dealAmount ?? null,
      });
      message.success('成交状态已更新');
      setDealStatusOpen(false);
      dealStatusForm.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新成交状态失败');
    }
  }

  async function submitIntention() {
    const values = await intentionForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await updateLeadIntentionLevel(leadId, { intentionLevel: values.intentionLevel });
      message.success('意向程度已更新');
      setIntentionOpen(false);
      intentionForm.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新意向程度失败');
    }
  }

  const canCloseDeal = useMemo(() => {
    if (!lead) return false;
    return lead.status === LeadStatus.IN_FOLLOWUP || lead.addStatus === LeadAddStatus.ADDED;
  }, [lead]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>客资详情</Typography.Title>
          <Typography.Paragraph type="secondary">查看客户来源、销售跟进和运营协同记录。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button onClick={() => router.push('/sales/leads')}>返回列表</Button>
          <Button onClick={() => router.push(`/sales/collaboration?leadId=${leadId}`)}>打开协同页</Button>
          <Button onClick={() => setIntentionOpen(true)}>更新意向程度</Button>
          <Button onClick={() => setDealStatusOpen(true)}>更新成交状态</Button>
          {lead?.sales?.id ? (
            <ReminderButton
              recipientId={String(lead.sales.id)}
              recipientRole="operation"
              relatedType="lead"
              relatedId={leadId}
              content={`客资 ${lead?.customerName || leadId} 需要运营协助`}
            >
              提醒运营
            </ReminderButton>
          ) : null}
          <Tooltip
            title={canCloseDeal ? '请填写成交金额、产品类型与交付要求' : '仅在跟进中或已添加通过的客资可标记成交'}
          >
            <Button
              type="primary"
              ghost
              disabled={!canCloseDeal}
              onClick={() => setCloseDealOpen(true)}
            >
              标记成交
            </Button>
          </Tooltip>
          <Button type="primary" onClick={() => setCollaborationOpen(true)} loading={submitting}>申请运营协同</Button>
        </Space>
      </div>

      <Card>
        {lead ? (
          <Alert
            showIcon
            type={lead.status === LeadStatus.OPERATION_HANDLED || lead.collaborationStatus === CollaborationStatus.HANDLED ? 'warning' : 'info'}
            message={`下一步：${nextAction(lead)}`}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Descriptions
          bordered
          column={{ xs: 1, md: 2 }}
          items={[
            { key: 'id', label: '客资 ID', children: leadId },
            { key: 'name', label: '客户', children: lead?.customerName ?? '详情接口待补齐' },
            { key: 'contact', label: '联系方式', children: lead?.contact ?? '-' },
            { key: 'ipRegion', label: 'IP / 地区', children: lead?.ip ?? '-' },
            // v1.3 / CROSS-2 销售写跟进回写的客户画像字段
            { key: 'clientDegree', label: '客户学历', children: lead?.clientDegree || '-' },
            { key: 'clientMajorResearch', label: '专业 / 研究方向', children: lead?.clientMajorResearch || '-' },
            { key: 'requirementNote', label: '客户需求', children: lead?.requirementNote ?? '-' },
            { key: 'clientTimeRequirement', label: '时间要求', children: lead?.clientTimeRequirement || '-' },
            { key: 'objectionPoint', label: '异议点', children: lead?.objectionPoint || '-' },
            { key: 'followAction', label: '跟进措施', children: lead?.followAction || '-' },
            { key: 'intentionLevel', label: '意向程度', children: lead?.intentionLevel ? (
              <Tag color={INTENTION_META[lead.intentionLevel as IntentionLevelCode]?.color || 'default'}>
                {INTENTION_META[lead.intentionLevel as IntentionLevelCode]?.label || lead.intentionLevel}
              </Tag>
            ) : '-' },
            { key: 'dealStatus', label: '成交状态', children: lead?.dealStatus ? (
              <Tag color={DEAL_STATUS_META[lead.dealStatus as DealStatusCode]?.color || 'default'}>
                {DEAL_STATUS_META[lead.dealStatus as DealStatusCode]?.label || lead.dealStatus}
              </Tag>
            ) : '-' },
            { key: 'dealAmount', label: '成交金额', children: lead?.dealAmount ? `¥ ${lead.dealAmount}` : '-' },
            { key: 'supervisorNote', label: '主管备注', children: lead?.supervisorNote ?? '-' },
            {
              key: 'orderInfo',
              label: '订单 / 教务交付进度',
              // v1.3 / SA-12: 锚点 — "已添加"状态时滚到此处
              labelStyle: { background: '#fafafa' },
              children: (
                <div data-anchor="order-followup">
                  {order
                    ? [
                        order.serviceType ? `产品：${order.serviceType}` : null,
                        order.amount ? `金额：${order.amount}元` : null,
                        order.paidStatus ? `付款：${paidStatusMeta(order.paidStatus).label}` : null,
                        order.orderStatus ? `订单状态：${orderStatusMeta(order.orderStatus).label}` : null,
                        order.handoverStatus ? `交接：${handoverStatusMeta(order.handoverStatus).label}` : null,
                      ]
                        .filter(Boolean)
                        .join(' | ')
                    : '暂无订单'}
                </div>
              ),
            },
            { key: 'status', label: '客资状态', children: <StatusTag kind="leadStatus" code={lead?.status ?? LeadStatus.ASSIGNED} /> },
            { key: 'addStatus', label: '添加状态', children: <StatusTag kind="addStatus" code={lead?.addStatus ?? LeadAddStatus.NOT_ADDED} /> },
            { key: 'processStatus', label: '处理状态', children: <StatusTag kind="processStatus" code={lead?.processStatus ?? 'not_contacted'} /> },
            { key: 'collaborationStatus', label: '协同状态', children: <StatusTag kind="collaborationStatus" code={lead?.collaborationStatus ?? 'none'} /> },
            { key: 'note', label: '运营备注', children: lead?.note ?? '-' },
            {
              key: 'captureImageUrl',
              label: '引流截图',
              children: lead?.captureImageUrl ? <Image src={lead.captureImageUrl} alt="引流截图" width={120} /> : '-',
            },
            {
              key: 'latestFollow',
              label: '最近跟进',
              children: lead?.latestFollowAt
                ? `${formatDateTime(lead.latestFollowAt)}${lead.latestFollowNote ? ` · ${lead.latestFollowNote}` : ''}`
                : lead?.latestFollowNote ?? '-',
            },
          ]}
        />
      </Card>

      <Tabs
        items={[
          {
            key: 'follow',
            label: '写跟进',
            children: (
              <Card>
                <Form<FollowFormValues>
                  form={form}
                  layout="vertical"
                  onFinish={submitFollow}
                  initialValues={{
                    clientDegree: lead?.clientDegree,
                    clientMajorResearch: lead?.clientMajorResearch,
                    clientTimeRequirement: lead?.clientTimeRequirement,
                    objectionPoint: lead?.objectionPoint,
                    followAction: lead?.followAction,
                    intentionLevel: (lead?.intentionLevel as IntentionLevelCode) || undefined,
                    nextFollowTime: lead?.nextFollowAt ? dayjs(lead.nextFollowAt) : null,
                  }}
                >
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
                  <Button type="primary" htmlType="submit" loading={submitting}>保存跟进</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'timeline',
            label: '跟进时间线',
            children: (
              <Card>
                {timeline.length > 0 ? (
                  <Timeline
                    items={timeline.map((item) => ({
                      dot: item.kind === 'collaboration' ? undefined : undefined,
                      children: (
                        <div>
                          <Typography.Text strong>{item.title}</Typography.Text>
                          <div className="timeline-meta">
                            {item.actorName ? `${item.actorName} · ` : ''}
                            {formatDateTime(item.occurredAt)}
                          </div>
                          {item.content ? <Typography.Paragraph className="timeline-content">{item.content}</Typography.Paragraph> : null}
                        </div>
                      ),
                    }))}
                  />
                ) : (
                  <LeadTimeline items={timeline} />
                )}
                {timeline.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录" /> : null}
              </Card>
            ),
          },
        ]}
      />
      <Modal
        title="申请运营协同"
        open={collaborationOpen}
        onCancel={() => setCollaborationOpen(false)}
        footer={null}
        destroyOnClose={false}
      >
        <Form form={collaborationForm} layout="vertical" onFinish={requestCollaboration} preserve>
          <Form.Item name="type" label="协同类型" initialValue="remind_customer" rules={[{ required: true, message: '请选择协同类型' }]}>
            <Select
              options={[
                { label: '提醒客户', value: 'remind_customer' },
                { label: '补充来源', value: 'supplement_info' },
                { label: '确认身份', value: 'verify_identity' },
                { label: '二次触达', value: 'second_touch' },
              ]}
            />
          </Form.Item>
          <Form.Item name="urgency" label="紧急程度" initialValue="normal" rules={[{ required: true, message: '请选择紧急程度' }]}>
            <Select
              options={[
                { label: '普通', value: 'normal' },
                { label: '紧急', value: 'urgent' },
                { label: '特急', value: 'critical' },
              ]}
            />
          </Form.Item>
          <Form.Item name="reason" label="协同原因" rules={[{ required: true, message: '请输入协同原因' }]}>
            <Input.TextArea rows={3} placeholder="说明需要运营协助的背景和期望结果" />
          </Form.Item>
          <Form.Item name="remark" label="补充备注">
            <Input.TextArea rows={2} placeholder="可补充客户上下文、已尝试动作或沟通口径" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>提交协同</Button>
            <Button onClick={() => setCollaborationOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Modal>

      <Modal
        title="标记成交"
        open={closeDealOpen}
        onCancel={() => setCloseDealOpen(false)}
        footer={null}
        destroyOnClose={false}
        width={680}
      >
        <Form<CloseDealFormValues> form={closeDealForm} layout="vertical" onFinish={submitCloseDeal} preserve>
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
            <Form.Item
              name="amount"
              label="成交金额（元）"
              rules={[
                { required: true, message: '请输入成交金额' },
                {
                  validator: (_rule, value) => {
                    if (value === undefined || value === null || value === '') {
                      return Promise.reject(new Error('请输入成交金额'));
                    }
                    const num = Number(value);
                    if (!Number.isFinite(num)) {
                      return Promise.reject(new Error('成交金额必须为数字'));
                    }
                    if (num <= 0) {
                      return Promise.reject(new Error('订单金额必填且必须大于0'));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item name="paymentStage" label="付款阶段" className="full-row">
              <Input placeholder="如：定金 / 中期 / 尾款" />
            </Form.Item>
            <Form.Item name="remark" label="成交备注" className="full-row">
              <Input.TextArea rows={2} placeholder="可补充成交背景、客户特殊要求等" />
            </Form.Item>
          </div>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>提交成交</Button>
            <Button onClick={() => setCloseDealOpen(false)}>取消</Button>
          </Space>
        </Form>
      </Modal>

      {/* 更新成交状态（SA-3） */}
      <Modal
        title="更新成交状态"
        open={dealStatusOpen}
        onCancel={() => { setDealStatusOpen(false); dealStatusForm.resetFields(); }}
        onOk={submitDealStatus}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<DealStatusFormValues> form={dealStatusForm} layout="vertical" preserve={false} initialValues={{ dealStatus: (lead?.dealStatus as DealStatusCode) || 'not_deal' }}>
          <Form.Item name="dealStatus" label="成交状态" rules={[{ required: true, message: '请选择成交状态' }]}>
            <Select
              options={[
                { label: '未成交', value: 'not_deal' },
                { label: '待成交', value: 'deal_pending' },
                { label: '已成交', value: 'deal_done' },
                { label: '已退款', value: 'refunded' },
                { label: '无效', value: 'invalid' },
              ]}
            />
          </Form.Item>
          <Form.Item name="dealAmount" label="成交金额（元）">
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 更新意向程度（SA-3） */}
      <Modal
        title="更新意向程度"
        open={intentionOpen}
        onCancel={() => { setIntentionOpen(false); intentionForm.resetFields(); }}
        onOk={submitIntention}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form<IntentionFormValues> form={intentionForm} layout="vertical" preserve={false} initialValues={{ intentionLevel: (lead?.intentionLevel as IntentionLevelCode) || 'pending' }}>
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
    </Space>
  );
}

function sortTimelineDesc(a: LeadTimelineItem, b: LeadTimelineItem) {
  return toTime(b.occurredAt) - toTime(a.occurredAt);
}

function toTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function nextAction(lead: SalesLead) {
  if (lead.collaborationStatus === CollaborationStatus.PENDING || lead.status === LeadStatus.IN_COLLABORATION) return '等待运营处理协同，必要时补充协同原因';
  if (lead.status === LeadStatus.OPERATION_HANDLED || lead.collaborationStatus === CollaborationStatus.HANDLED) return '查看协同结果并继续跟进客户';
  if (lead.status === LeadStatus.ASSIGNED) return '首次联系客户并记录跟进';
  if (lead.addStatus === LeadAddStatus.NOT_PASSED) return '发起运营提醒或二次触达协同';
  if (lead.addStatus === LeadAddStatus.ADDED) return '推进沟通、报价或成交';
  return getStatusMeta('processStatus', lead.processStatus).actionHint;
}
