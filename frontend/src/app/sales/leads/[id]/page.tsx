'use client';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  closeLeadDeal,
  createCollaborationTask,
  createLeadFollowRecord,
  getLeadDetail,
  listCollaborationTasks,
  listLeadFollowRecords,
  updateLeadBoard,
  type CloseLeadDealPayload,
} from '@/shared/api/leads';
import { listOrders } from '@/shared/api/orders';
import { LeadTimeline } from '@/shared/components/leads';
import { StatusTag } from '@/shared/components/status';
import { LeadStatus, LeadAddStatus, LeadProcessStatus, CollaborationStatus } from '@/shared/constants/lead-status-enums';
import { getStatusMeta } from '@/shared/constants/status';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import { formatDateTime } from '@/shared/utils/date-format';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';
import type { OrderItem } from '@/shared/types/orders';

const FOLLOW_TYPE_OPTIONS = [
  { label: '电话沟通', value: 'phone' },
  { label: '微信沟通', value: 'wechat' },
  { label: '添加好友', value: 'add_friend' },
  { label: '发资料', value: 'send_material' },
  { label: '报价', value: 'quote' },
  { label: '其他', value: 'other' },
];

type CloseDealFormValues = {
  amount?: number | string;
  serviceType?: string;
  contractStatus?: 'unsigned' | 'signed' | 'pending';
  paidStatus?: 'unpaid' | 'partial' | 'paid';
  deliveryRequirement?: string;
  expectedHandleTime?: { format?: () => string; toISOString?: () => string } | string | null;
};

export default function SalesLeadDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = String(params.id);
  const [lead, setLead] = useState<SalesLead>();
  const [timeline, setTimeline] = useState<LeadTimelineItem[]>([]);
  const [order, setOrder] = useState<OrderItem>();
  const [form] = Form.useForm();
  const [collaborationForm] = Form.useForm();
  const [closeDealForm] = Form.useForm();
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [closeDealOpen, setCloseDealOpen] = useState(false);
  const { submitting, run } = useSubmitLock();

  async function loadDetail() {
    const [detail, records, collaborations] = await Promise.all([
      getLeadDetail(leadId),
      listLeadFollowRecords(leadId).catch(() => []),
      listCollaborationTasks({ scope: 'requester', leadId, pageSize: 50 }).then((result) => result.items).catch(() => []),
    ]);
    setLead(detail);
    setTimeline([...records, ...collaborations].sort(sortTimelineDesc));
    // 加载该 lead 关联的最新订单，用于展示订单/教务交付进度
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

  async function submitFollow(values: Record<string, unknown>) {
    await run(async () => {
      try {
        await createLeadFollowRecord(leadId, {
          ...values,
          nextFollowTime: values.nextFollowTime,
        });
        await updateLeadBoard(leadId, {
          processStatus: values.processStatus,
          addStatus: values.addStatus,
          followNote: values.content,
          intentionLevel: values.intentionLevel,
          nextFollowTime: values.nextFollowTime,
        });
        message.success('跟进记录已保存');
        form.resetFields();
        await loadDetail();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '跟进记录保存失败');
      }
    });
  }

  async function requestCollaboration(values: { type: string; urgency: 'normal' | 'urgent' | 'critical'; reason: string; remark?: string }) {
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
        const expectedHandleTime = normalizeExpectedHandleTime(values.expectedHandleTime);
        const payload: CloseLeadDealPayload = {
          amount: values.amount ?? null,
          serviceType: values.serviceType ?? null,
          contractStatus: values.contractStatus || undefined,
          paidStatus: values.paidStatus || undefined,
          deliveryRequirement: values.deliveryRequirement ?? null,
          expectedHandleTime,
        };
        await closeLeadDeal(leadId, payload);
        message.success('已标记成交，订单已创建');
        setCloseDealOpen(false);
        closeDealForm.resetFields();
        await loadDetail();
      } catch (err) {
        message.error(err instanceof Error ? err.message : '标记成交失败');
      }
    });
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
            { key: 'sourcePlatform', label: '来源平台', children: lead?.source?.platform ?? '-' },
            { key: 'sourceAccount', label: '来源账号', children: lead?.source?.accountName ?? lead?.source?.accountId ?? '-' },
            { key: 'sourcePost', label: '来源作品', children: lead?.source?.postTitle ?? lead?.source?.postId ?? '-' },
            { key: 'ipRegion', label: 'IP / 地区', children: lead?.ip ?? '-' },
            { key: 'requirementNote', label: '需求备注', children: lead?.requirementNote ?? '-' },
            { key: 'supervisorNote', label: '主管备注', children: lead?.supervisorNote ?? '-' },
            {
              key: 'orderInfo',
              label: '订单 / 教务交付进度',
              children: order
                ? [
                    order.serviceType ? `产品：${order.serviceType}` : null,
                    order.amount ? `金额：${order.amount}元` : null,
                    order.paidStatus ? `付款：${order.paidStatus}` : null,
                    order.orderStatus ? `订单状态：${order.orderStatus}` : null,
                    order.handoverStatus ? `交接：${order.handoverStatus}` : null,
                  ]
                    .filter(Boolean)
                    .join(' | ')
                : '暂无订单',
            },
            { key: 'status', label: '客资状态', children: <StatusTag kind="leadStatus" code={lead?.status ?? LeadStatus.ASSIGNED} /> },
            { key: 'addStatus', label: '添加状态', children: <StatusTag kind="addStatus" code={lead?.addStatus ?? LeadAddStatus.NOT_ADDED} /> },
            { key: 'processStatus', label: '处理状态', children: <StatusTag kind="processStatus" code={lead?.processStatus ?? 'not_contacted'} /> },
            { key: 'collaborationStatus', label: '协同状态', children: <StatusTag kind="collaborationStatus" code={lead?.collaborationStatus ?? 'none'} /> },
            { key: 'operator', label: '所属运营', children: lead?.operator?.name ?? '-' },
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
                <Form form={form} layout="vertical" onFinish={submitFollow}>
                  <div className="form-grid">
                    <Form.Item name="addStatus" label="添加状态" initialValue={LeadAddStatus.APPLIED}>
                      <Select
                        options={[
                          { label: '已申请添加', value: LeadAddStatus.APPLIED },
                          { label: '客户未通过', value: LeadAddStatus.NOT_PASSED },
                          { label: '已添加通过', value: LeadAddStatus.ADDED },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="processStatus" label="处理状态" initialValue={LeadProcessStatus.COMMUNICATING}>
                      <Select
                        options={[
                          { label: '待通过', value: LeadProcessStatus.WAITING_PASS },
                          { label: '沟通中', value: LeadProcessStatus.COMMUNICATING },
                          { label: '已报价', value: LeadProcessStatus.QUOTED },
                          { label: '待成交', value: LeadProcessStatus.DEAL_PENDING },
                          { label: '无效', value: LeadProcessStatus.INVALID },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="intentionLevel" label="意向度">
                      <Select
                        allowClear
                        placeholder="选择客户意向"
                        options={[
                          { label: '高意向', value: 'high' },
                          { label: '中意向', value: 'medium' },
                          { label: '低意向', value: 'low' },
                          { label: '待判断', value: 'unknown' },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="followType" label="跟进类型" initialValue="wechat">
                      <Select options={FOLLOW_TYPE_OPTIONS} placeholder="选择本次跟进的方式" />
                    </Form.Item>
                    <Form.Item name="nextFollowTime" label="下次跟进时间">
                      <Input type="datetime-local" />
                    </Form.Item>
                    <Form.Item className="full-row" name="content" label="跟进备注" rules={[{ required: true, message: '请输入跟进备注' }]}>
                      <Input.TextArea rows={4} placeholder="记录客户通过情况、沟通重点和下一步动作" />
                    </Form.Item>
                  </div>
                  <Button type="primary" htmlType="submit" loading={submitting}>保存跟进</Button>
                </Form>
              </Card>
            ),
          },
          {
            key: 'timeline',
            label: '跟进/协同时间线',
            children: (
              <Card>
                <LeadTimeline items={timeline} />
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
      >
        <Form form={closeDealForm} layout="vertical" onFinish={submitCloseDeal} preserve>
          <div className="form-grid">
            <Form.Item
              name="amount"
              label="成交金额（元）"
              rules={[{ required: true, message: '请输入成交金额' }]}
            >
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item
              name="serviceType"
              label="产品类型"
              rules={[{ required: true, message: '请输入产品类型' }]}
            >
              <Input placeholder="如：1v1 私教 / 训练营 / 录播课" />
            </Form.Item>
            <Form.Item name="contractStatus" label="合同状态" initialValue="pending">
              <Select
                options={[
                  { label: '未签', value: 'unsigned' },
                  { label: '已签', value: 'signed' },
                  { label: '待补', value: 'pending' },
                ]}
              />
            </Form.Item>
            <Form.Item name="paidStatus" label="付款状态" initialValue="unpaid">
              <Select
                options={[
                  { label: '未付款', value: 'unpaid' },
                  { label: '部分付款', value: 'partial' },
                  { label: '已付款', value: 'paid' },
                ]}
              />
            </Form.Item>
            <Form.Item className="full-row" name="deliveryRequirement" label="交付要求">
              <Input.TextArea rows={3} placeholder="上课时间、形式、教练偏好等" />
            </Form.Item>
            <Form.Item className="full-row" name="expectedHandleTime" label="期望处理时间">
              <DatePicker
                showTime
                format="YYYY年MM月DD日 HH:mm:ss"
                style={{ width: '100%' }}
                placeholder="选择期望处理时间"
              />
            </Form.Item>
          </div>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>提交成交</Button>
            <Button onClick={() => setCloseDealOpen(false)}>取消</Button>
          </Space>
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

function normalizeExpectedHandleTime(value: CloseDealFormValues['expectedHandleTime']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value || null;
  if (value && typeof value === 'object') {
    if (typeof value.format === 'function') {
      return value.format();
    }
    if (typeof value.toISOString === 'function') {
      return value.toISOString();
    }
  }
  return null;
}
