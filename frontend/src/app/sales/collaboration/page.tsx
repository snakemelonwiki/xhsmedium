'use client';

import { Alert, Button, Card, DatePicker, Form, Input, Select, Space, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';

import { createCollaborationTask, listCollaborationTasks, listSalesLeads, updateLeadBoard } from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { LeadStatus, CollaborationStatus } from '@/shared/constants/lead-status-enums';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';

type CollaborationFormValues = {
  leadId: string;
  type: string;
  urgency: 'normal' | 'urgent' | 'critical';
  reason: string;
  remark?: string;
  expectedHandleTime?: Dayjs | null;
};

export default function SalesCollaborationPage() {
  const router = useRouter();
  const [items, setItems] = useState<LeadTimelineItem[]>([]);
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [submittedLeadId, setSubmittedLeadId] = useState<string>();
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function loadTasks() {
    const result = await listCollaborationTasks({ scope: 'mine', pageSize: 20 });
    setItems(result.items);
  }

  async function loadLeads() {
    const allLeads = await listSalesLeads({ pageSize: 100 }).catch(() => undefined);
    if (allLeads) {
      setLeads(dedupeLeads(allLeads.items));
      return;
    }

    const [assigned, inFollowup] = await Promise.all([
      listSalesLeads({ pageSize: 100, status: LeadStatus.ASSIGNED }).catch(() => ({ items: [] as SalesLead[] })),
      listSalesLeads({ pageSize: 100, status: LeadStatus.IN_FOLLOWUP }).catch(() => ({ items: [] as SalesLead[] })),
    ]);
    setLeads(dedupeLeads([...assigned.items, ...inFollowup.items]));
  }

  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get('leadId');
    if (leadId) form.setFieldValue('leadId', leadId);
    loadTasks().catch(() => setItems([]));
    loadLeads().catch(() => setLeads([]));
  }, [form]);

  async function submit(values: CollaborationFormValues) {
    await run(async () => {
      const expectedHandleTime = values.expectedHandleTime
        ? values.expectedHandleTime.toISOString()
        : null;
      await createCollaborationTask({
        leadId: values.leadId,
        type: values.type,
        urgency: values.urgency,
        reason: values.reason,
        remark: values.remark,
        expectedHandleTime,
      });
      await updateLeadBoard(values.leadId, {
        status: LeadStatus.IN_COLLABORATION,
        collaborationStatus: CollaborationStatus.PENDING,
        followNote: values.reason,
      }).catch(() => undefined);
      message.success('协同申请已提交');
      setSubmittedLeadId(values.leadId);
      form.resetFields(['type', 'urgency', 'reason', 'remark', 'expectedHandleTime']);
      await loadTasks();
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>销售协同</Typography.Title>
        <Typography.Paragraph type="secondary">向运营发起提醒客户、补充来源或二次触达协同。</Typography.Paragraph>
      </div>
      {submittedLeadId ? (
        <Alert
          showIcon
          type="success"
          message="协同已提交，当前状态为待运营处理"
          description={(
            <Space wrap>
              <Button size="small" type="link" onClick={() => router.push(`/sales/leads/${submittedLeadId}`)}>
                查看客资详情
              </Button>
              <Button size="small" type="link" onClick={() => setSubmittedLeadId(undefined)}>
                继续提交
              </Button>
            </Space>
          )}
        />
      ) : null}
      <Card title="发起协同">
        <Form form={form} layout="vertical" onFinish={submit}>
          <div className="form-grid">
            <Form.Item name="leadId" label="选择客资" rules={[{ required: true, message: '请选择客资' }]}>
              <Select
                showSearch
                placeholder="选择要协同的客资"
                optionFilterProp="label"
                options={leads.map((lead) => ({
                  value: String(lead.id),
                  label: `${lead.customerName || lead.nickname || lead.id} · ${lead.contact || lead.phone || lead.wechat || '暂无联系方式'}`,
                }))}
              />
            </Form.Item>
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
            <Form.Item className="full-row" name="reason" label="协同原因" rules={[{ required: true, message: '请输入协同原因' }]}>
              <Input.TextArea rows={3} placeholder="说明需要运营协助的背景和期望结果" />
            </Form.Item>
            <Form.Item className="full-row" name="remark" label="补充备注">
              <Input.TextArea rows={2} placeholder="可补充客户上下文、已尝试动作或沟通口径" />
            </Form.Item>
            <Form.Item
              className="full-row"
              name="expectedHandleTime"
              label="期望处理时间"
              extra="用于提醒运营尽快处理；后端会在 1.2 后续版本落地"
            >
              <DatePicker
                showTime={{ format: 'HH:mm' }}
                format="YYYY年MM月DD日 HH:mm"
                placeholder="选择期望运营处理的时间点"
                style={{ width: 280 }}
                disabledDate={(current) => Boolean(current && current.isBefore(dayjs().startOf('day')))}
              />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting}>提交协同</Button>
        </Form>
      </Card>
      <Card title="我的协同记录">
        <LeadTimeline items={items} />
      </Card>
    </Space>
  );
}

function dedupeLeads(leads: SalesLead[]) {
  const map = new Map<string | number, SalesLead>();
  leads.forEach((lead) => map.set(lead.id, lead));
  return Array.from(map.values());
}
