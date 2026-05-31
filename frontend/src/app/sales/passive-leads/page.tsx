'use client';

import { Alert, Button, Card, Form, Input, Select, Space, Table, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { useEffect, useState } from 'react';

import { bindPassiveLead, createPassiveLead, listPassiveLeadCandidates, type PassiveLeadCandidate } from '@/shared/api/leads';

export default function SalesPassiveLeadsPage() {
  const [items, setItems] = useState<PassiveLeadCandidate[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastQuery, setLastQuery] = useState<Record<string, string>>({});
  const [searchForm] = Form.useForm();
  const [newForm] = Form.useForm();

  async function search(values: Record<string, string>) {
    setLoading(true);
    setError('');
    setLastQuery(values);
    try {
      const result = await listPassiveLeadCandidates({ ...values, pageSize: 20 });
      setItems(result.items);
    } catch (err) {
      const text = err instanceof Error ? err.message : '被动添加候选加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  async function bindLead(row: PassiveLeadCandidate) {
    try {
      await bindPassiveLead({
        leadId: row.id,
        contact: row.contactInfo || lastQuery.phone || lastQuery.wechat || '',
        salesFeedback: '销售确认被动添加绑定',
      });
      message.success('已绑定被动添加客资');
      await search(lastQuery);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '绑定失败');
    }
  }

  async function createLead(values: { contact: string; nickname?: string; platform?: string; salesFeedback?: string }) {
    try {
      await createPassiveLead(values);
      message.success('已新建被动添加客资');
      newForm.resetFields();
      await search({ phone: values.contact });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '新建失败');
    }
  }

  useEffect(() => {
    search({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: TableColumnsType<PassiveLeadCandidate> = [
    { title: '客资 ID', dataIndex: 'id' },
    { title: '昵称', dataIndex: 'nickname', render: (value?: string) => value || '-' },
    { title: '联系方式', dataIndex: 'contactInfo', render: (value?: string) => value || '-' },
    { title: '平台', dataIndex: 'platform', render: (value?: string) => value || '-' },
    { title: '操作', render: (_value, record) => <Button onClick={() => bindLead(record)}>绑定</Button> },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>待确认被动添加</Typography.Title>
        <Typography.Paragraph type="secondary">按手机号、微信或昵称检索被动添加客资候选。</Typography.Paragraph>
      </div>
      <Card>
        <Form form={searchForm} layout="inline" onFinish={search}>
          <Form.Item name="phone"><Input placeholder="手机号" /></Form.Item>
          <Form.Item name="wechat"><Input placeholder="微信" /></Form.Item>
          <Form.Item name="nickname"><Input placeholder="昵称" /></Form.Item>
          <Button
            type="primary"
            loading={loading}
            onClick={() => search(searchForm.getFieldsValue())}
          >
            查询
          </Button>
        </Form>
      </Card>
      <Card title="匹配不到时新建被动客资">
        <Form form={newForm} layout="inline" onFinish={createLead}>
          <Form.Item name="contact" rules={[{ required: true, message: '请输入联系方式' }]}><Input placeholder="联系方式" /></Form.Item>
          <Form.Item name="nickname"><Input placeholder="昵称" /></Form.Item>
          <Form.Item name="platform" initialValue="unknown"><Select style={{ width: 120 }} options={[{ label: '未知', value: 'unknown' }, { label: '小红书', value: 'xiaohongshu' }, { label: '抖音', value: 'douyin' }]} /></Form.Item>
          <Form.Item name="salesFeedback"><Input placeholder="销售备注" /></Form.Item>
          <Button htmlType="submit">新建</Button>
        </Form>
      </Card>
      {error ? <Alert type="warning" showIcon message={error} /> : null}
      <Card>
        <Table rowKey="id" columns={columns} dataSource={items} loading={loading} />
      </Card>
    </Space>
  );
}
