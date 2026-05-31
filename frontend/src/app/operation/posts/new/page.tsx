'use client';

import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';

import { apiClient } from '@/shared/api/apiClient';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

export default function OperationPostNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function submit(values: Record<string, unknown>) {
    await run(async () => {
      await apiClient.post('/posts', values);
      message.success('作品已录入');
      form.resetFields();
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>作品录入</Typography.Title>
        <Typography.Paragraph type="secondary">录入作品链接、平台、账号、文案和封面截图，作为客资来源使用。</Typography.Paragraph>
      </div>
      <Card>
        <Form form={form} layout="vertical" onFinish={submit} preserve>
          <div className="form-grid">
            <Form.Item name="platform" label="平台" initialValue="xiaohongshu" rules={[{ required: true, message: '请选择平台' }]}>
              <Select
                options={[
                  { label: '小红书', value: 'xiaohongshu' },
                  { label: '抖音', value: 'douyin' },
                ]}
              />
            </Form.Item>
            <Form.Item name="postType" label="作品类型" initialValue="note">
              <Select
                options={[
                  { label: '图文', value: 'note' },
                  { label: '视频', value: 'video' },
                  { label: '获客贴', value: 'lead_post' },
                ]}
              />
            </Form.Item>
            <Form.Item className="full-row" name="postUrl" label="作品链接" rules={[{ required: true, message: '请输入作品链接' }]}>
              <Input placeholder="粘贴小红书/抖音作品链接" />
            </Form.Item>
            <Form.Item name="title" label="标题">
              <Input placeholder="作品标题" />
            </Form.Item>
            <Form.Item name="accountId" label="来源账号 ID">
              <Input placeholder="后续可替换为账号下拉" />
            </Form.Item>
            <Form.Item className="full-row" name="copywriting" label="文案">
              <Input.TextArea rows={4} placeholder="作品文案或备注" />
            </Form.Item>
            <Form.Item className="full-row" name="coverImageUrl" label="封面/截图">
              <ImageUploadField bucket="post-covers" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting}>提交作品</Button>
        </Form>
      </Card>
    </Space>
  );
}
