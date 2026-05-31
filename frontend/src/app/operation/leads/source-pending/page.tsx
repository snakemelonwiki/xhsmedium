'use client';

import { Alert, Button, Card, Empty, Form, Input, Space, Table, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';

import { confirmLeadSource, listPassiveLeadCandidates, type PassiveLeadCandidate } from '@/shared/api/leads';

export default function OperationSourcePendingPage() {
  const [items, setItems] = useState<PassiveLeadCandidate[]>([]);
  const [error, setError] = useState('');
  const [form] = Form.useForm();

  async function load() {
    return listPassiveLeadCandidates({ pageSize: 20 })
      .then((result) => setItems(result.items))
      .catch((err) => setError(err instanceof Error ? err.message : '待确认来源加载失败'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(values: { leadId: string; matchedPostId: string; sourceOperatorId: string }) {
    try {
      await confirmLeadSource(values);
      message.success('来源已确认');
      form.resetFields();
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '确认来源失败');
    }
  }

  const columns: TableColumnsType<PassiveLeadCandidate> = [
    { title: '客资 ID', dataIndex: 'id' },
    { title: '昵称', dataIndex: 'nickname', render: (value?: string) => value || '-' },
    { title: '联系方式', dataIndex: 'contactInfo', render: (value?: string) => value || '-' },
    { title: '平台', dataIndex: 'platform', render: (value?: string) => value || '-' },
    { title: '创建时间', dataIndex: 'createdAt', render: (value?: string) => value || '-' },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>待确认来源</Typography.Title>
        <Typography.Paragraph type="secondary">承接旧前端待确认来源入口，用于识别被动添加或来源待补齐客资。</Typography.Paragraph>
      </div>
      <Card title="确认来源">
        <Form form={form} layout="inline" onFinish={submit}>
          <Form.Item name="leadId" rules={[{ required: true, message: '请输入客资 ID' }]}><Input placeholder="客资 ID" /></Form.Item>
          <Form.Item name="matchedPostId" rules={[{ required: true, message: '请输入来源作品 ID' }]}><Input placeholder="来源作品 ID" /></Form.Item>
          <Form.Item name="sourceOperatorId" rules={[{ required: true, message: '请输入来源运营员工 ID' }]}><Input placeholder="来源运营员工 ID" /></Form.Item>
          <Button type="primary" htmlType="submit">确认来源</Button>
        </Form>
      </Card>
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      <Card>
        <Table rowKey="id" columns={columns} dataSource={items} pagination={false} locale={{ emptyText: <Empty description="暂无待确认来源" /> }} />
      </Card>
    </Space>
  );
}
