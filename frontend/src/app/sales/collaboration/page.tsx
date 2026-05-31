'use client';

import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';

import { createCollaborationTask, listCollaborationTasks } from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { LeadTimelineItem } from '@/shared/types/leads';

export default function SalesCollaborationPage() {
  const [items, setItems] = useState<LeadTimelineItem[]>([]);
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function loadTasks() {
    const result = await listCollaborationTasks({ scope: 'requester', pageSize: 20 });
    setItems(result.items);
  }

  useEffect(() => {
    const leadId = new URLSearchParams(window.location.search).get('leadId');
    if (leadId) form.setFieldValue('leadId', leadId);
    loadTasks().catch(() => setItems([]));
  }, [form]);

  async function submit(values: { leadId: string; type: string; reason?: string }) {
    await run(async () => {
      await createCollaborationTask(values);
      message.success('协同申请已提交');
      form.resetFields(['type', 'reason']);
      await loadTasks();
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>销售协同</Typography.Title>
        <Typography.Paragraph type="secondary">向运营发起提醒客户、补充来源或二次触达协同。</Typography.Paragraph>
      </div>
      <Card title="发起协同">
        <Form form={form} layout="vertical" onFinish={submit}>
          <div className="form-grid">
            <Form.Item name="leadId" label="客资 ID" rules={[{ required: true, message: '请输入客资 ID' }]}>
              <Input placeholder="从客资详情进入时会自动带入" />
            </Form.Item>
            <Form.Item name="type" label="协同类型" initialValue="remind_customer">
              <Select
                options={[
                  { label: '提醒客户', value: 'remind_customer' },
                  { label: '补充来源', value: 'complete_source' },
                  { label: '确认身份', value: 'confirm_identity' },
                  { label: '二次触达', value: 'second_touch' },
                ]}
              />
            </Form.Item>
            <Form.Item className="full-row" name="reason" label="协同原因">
              <Input.TextArea rows={3} placeholder="说明需要运营协助的背景和期望结果" />
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
