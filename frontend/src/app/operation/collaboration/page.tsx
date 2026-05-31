'use client';

import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listCollaborationTasks } from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { LeadTimelineItem } from '@/shared/types/leads';

export default function OperationCollaborationPage() {
  const [items, setItems] = useState<LeadTimelineItem[]>([]);
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function loadTasks() {
    const result = await listCollaborationTasks({ scope: 'inbox', pageSize: 20 });
    setItems(result.items);
  }

  useEffect(() => {
    loadTasks().catch(() => setItems([]));
  }, []);

  async function handleTask(values: { taskId: string; handledNote: string }) {
    await run(async () => {
      await apiClient.request(`/collaboration-tasks/${values.taskId}/handle`, {
        method: 'PUT',
        body: { handledNote: values.handledNote },
      });
      message.success('协同任务已处理');
      form.resetFields();
      await loadTasks();
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>协同处理</Typography.Title>
        <Typography.Paragraph type="secondary">处理销售发起的提醒客户、补充来源、确认身份和二次触达任务。</Typography.Paragraph>
      </div>
      <Card title="处理协同">
        <Form form={form} layout="vertical" onFinish={handleTask}>
          <div className="form-grid">
            <Form.Item name="taskId" label="选择协同任务" rules={[{ required: true, message: '请选择协同任务' }]}>
              <Select
                showSearch
                placeholder="选择待处理协同任务"
                optionFilterProp="label"
                options={items.filter(isActionableTask).map((item) => ({
                  value: String(item.id),
                  label: buildTaskLabel(item),
                }))}
              />
            </Form.Item>
            <Form.Item className="full-row" name="handledNote" label="处理备注" rules={[{ required: true, message: '请输入处理备注' }]}>
              <Input.TextArea rows={3} placeholder="说明已提醒客户、已补充信息或已二次触达" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting}>提交处理结果</Button>
        </Form>
      </Card>
      <Card title="协同任务">
        <LeadTimeline items={items} />
      </Card>
    </Space>
  );
}

function buildTaskLabel(item: LeadTimelineItem) {
  const type = item.title || '协同任务';
  const status = item.status ? ` · ${item.status}` : '';
  const leadId = item.extra?.leadId ? ` · 客资 ${item.extra.leadId}` : '';
  return `${type}${leadId}${status}`;
}

function isActionableTask(item: LeadTimelineItem) {
  return item.status === 'pending' || item.status === 'handling';
}
