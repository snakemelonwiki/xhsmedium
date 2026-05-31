'use client';

import { Alert, Button, Card, Descriptions, Form, Input, Select, Space, Typography, message } from 'antd';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listCollaborationTasks } from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import type { LeadTimelineItem } from '@/shared/types/leads';

export default function OperationCollaborationPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<LeadTimelineItem[]>([]);
  const [form] = Form.useForm();
  const selectedTaskId = Form.useWatch('taskId', form);
  const { submitting, run } = useSubmitLock();
  const selectedTask = items.find((item) => String(item.id) === String(selectedTaskId)) || items.find(isActionableTask);

  async function loadTasks() {
    const result = await listCollaborationTasks({ scope: 'inbox', pageSize: 20 });
    setItems(result.items);
    const currentTaskId = form.getFieldValue('taskId');
    if (!currentTaskId) {
      const firstTask = result.items.find(isActionableTask);
      if (firstTask) {
        form.setFieldValue('taskId', String(firstTask.id));
      }
    }
  }

  useEffect(() => {
    loadTasks().catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId) form.setFieldValue('taskId', taskId);
  }, [form, searchParams]);

  async function handleTask(values: { taskId: string; handledType: string; handledNote: string }) {
    await run(async () => {
      await apiClient.request(`/collaboration-tasks/${values.taskId}/handle`, {
        method: 'PUT',
        body: { handledType: values.handledType, handledNote: values.handledNote },
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
                aria-label="选择协同任务"
                showSearch
                placeholder="选择待处理协同任务"
                optionFilterProp="label"
                options={items.filter(isActionableTask).map((item) => ({
                  value: String(item.id),
                  label: buildTaskLabel(item),
                }))}
              />
            </Form.Item>
            <Form.Item name="handledType" label="处理类型" initialValue="reminded" rules={[{ required: true, message: '请选择处理类型' }]}>
              <Select
                aria-label="处理类型"
                options={[
                  { label: '已提醒客户', value: 'reminded' },
                  { label: '已补充信息', value: 'supplemented' },
                  { label: '已二次触达', value: 'second_touched' },
                ]}
              />
            </Form.Item>
            <Form.Item className="full-row" name="handledNote" label="处理备注" rules={[{ required: true, message: '请输入处理备注' }]}>
              <Input.TextArea rows={3} placeholder="说明已提醒客户、已补充信息或已二次触达" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting}>提交处理结果</Button>
        </Form>
      </Card>
      <TaskDetail task={selectedTask} />
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

function TaskDetail({ task }: { task?: LeadTimelineItem }) {
  if (!task) {
    return <Alert type="info" showIcon message="暂无待处理协同任务" />;
  }
  const extra = task.extra || {};
  const customer = text(extra.customerName) || text(extra.nickname) || text(extra.contactInfo) || text(extra.leadId) || '-';
  const sourcePost = text(extra.sourcePostTitle) || text(extra.postTitle) || text(extra.sourcePostId) || text(extra.postId) || '-';
  const salesRemark = text(extra.salesRemark) || text(extra.latestFollowNote) || text(extra.salesFeedback) || '-';
  const reason = text(extra.reason) || task.content || '-';
  return (
    <Card title="协同详情">
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="客户信息">{customer}</Descriptions.Item>
        <Descriptions.Item label="来源作品">{sourcePost}</Descriptions.Item>
        <Descriptions.Item label="销售备注">{salesRemark}</Descriptions.Item>
        <Descriptions.Item label="协同原因">{reason}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

function text(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}
