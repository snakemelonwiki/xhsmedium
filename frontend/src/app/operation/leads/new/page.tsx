'use client';

import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd';

import { apiClient } from '@/shared/api/apiClient';
import { ImageUploadField } from '@/shared/components/forms';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

export default function OperationLeadNewPage() {
  const [form] = Form.useForm();
  const { submitting, run } = useSubmitLock();

  async function submit(values: Record<string, unknown>) {
    await run(async () => {
      await apiClient.post('/leads', {
        ...values,
        status: values.assignedSalesUserId ? 'assigned' : 'new',
        addStatus: 'not_added',
        processStatus: 'not_contacted',
      });
      message.success('客资已录入');
      form.resetFields();
    });
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>客资录入</Typography.Title>
        <Typography.Paragraph type="secondary">录入客户来源和联系方式，并分配给销售继续跟进。</Typography.Paragraph>
      </div>
      <Card>
        <Form form={form} layout="vertical" onFinish={submit} preserve>
          <div className="form-grid">
            <Form.Item name="platform" label="来源平台" initialValue="xiaohongshu" rules={[{ required: true, message: '请选择平台' }]}>
              <Select
                options={[
                  { label: '小红书', value: 'xiaohongshu' },
                  { label: '抖音', value: 'douyin' },
                ]}
              />
            </Form.Item>
            <Form.Item name="nickname" label="客户昵称">
              <Input placeholder="客户昵称" />
            </Form.Item>
            <Form.Item name="contactInfo" label="联系方式" rules={[{ required: true, message: '请输入联系方式' }]}>
              <Input placeholder="微信/电话/私信账号" />
            </Form.Item>
            <Form.Item name="assignedSalesUserId" label="分配销售 ID">
              <Input placeholder="后续可替换为销售下拉" />
            </Form.Item>
            <Form.Item name="accountId" label="来源账号 ID">
              <Input />
            </Form.Item>
            <Form.Item name="postId" label="来源作品 ID">
              <Input />
            </Form.Item>
            <Form.Item className="full-row" name="majorContent" label="需求备注">
              <Input.TextArea rows={4} placeholder="客户诉求、地区、专业方向和其他备注" />
            </Form.Item>
            <Form.Item className="full-row" name="captureImageUrl" label="引流截图">
              <ImageUploadField bucket="lead-captures" />
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" loading={submitting}>提交客资</Button>
        </Form>
      </Card>
    </Space>
  );
}
