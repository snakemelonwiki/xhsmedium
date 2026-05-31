'use client';

import { Button, Card, Form, Input, Modal, Select, Space, Table, Typography, message } from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';

import { listAdminAccounts, saveAdminAccount } from '@/shared/api/admin';
import type { AdminAccount } from '@/shared/types/admin';

export default function AdminAccountsPage() {
  const [items, setItems] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAccount>();
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();

  async function load(page = pagination.current, pageSize = pagination.pageSize, nextKeyword = keyword) {
    setLoading(true);
    try {
      const result = await listAdminAccounts({ page, pageSize, keyword: nextKeyword.trim() || undefined });
      setItems(result.items);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } catch {
      setItems([]);
      setPagination((current) => ({ ...current, total: 0 }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(record?: AdminAccount) {
    setEditing(record);
    form.setFieldsValue(record ?? { platform: 'xiaohongshu', status: 'active' });
    setOpen(true);
  }

  async function submit(values: Partial<AdminAccount> & { accountName: string }) {
    await saveAdminAccount({ ...editing, ...values });
    message.success('账号信息已保存');
    setOpen(false);
    form.resetFields();
    await load();
  }

  function handleSearch(value: string) {
    const nextKeyword = value.trim();
    setKeyword(nextKeyword);
    void load(1, pagination.pageSize, nextKeyword);
  }

  const columns: TableColumnsType<AdminAccount> = [
    { title: '账号名', dataIndex: 'accountName' },
    { title: '平台', dataIndex: 'platform', render: (value?: string) => value || '-' },
    { title: '所属员工', dataIndex: 'employeeId', render: (value?: string) => value || '-' },
    { title: '定位', dataIndex: 'positioning', render: (value?: string) => value || '-' },
    { title: '状态', dataIndex: 'status', render: (value?: string) => value || 'active' },
    { title: '操作', render: (_value, record) => <Button onClick={() => startEdit(record)}>编辑</Button> },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>账号管理</Typography.Title>
          <Typography.Paragraph type="secondary">维护小红书/抖音账号、定位和发布计划。</Typography.Paragraph>
        </div>
        <Button type="primary" onClick={() => startEdit()}>新增账号</Button>
      </div>
      <Card>
        <Input.Search
          allowClear
          value={keyword}
          placeholder="搜索账号名、账号UID、定位、员工ID"
          onChange={(event) => {
            const value = event.target.value;
            setKeyword(value);
            if (!value) void load(1, pagination.pageSize, '');
          }}
          onSearch={handleSearch}
          style={{ width: 360, maxWidth: '100%', marginBottom: 16 }}
        />
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={(next: TablePaginationConfig) => load(next.current ?? 1, next.pageSize ?? 20)}
        />
      </Card>
      <Modal title={editing ? '编辑账号' : '新增账号'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="accountName" label="账号名" rules={[{ required: true, message: '请输入账号名' }]}><Input /></Form.Item>
          <Form.Item name="platform" label="平台"><Select options={[{ label: '小红书', value: 'xiaohongshu' }, { label: '抖音', value: 'douyin' }]} /></Form.Item>
          <Form.Item name="employeeId" label="员工 ID"><Input /></Form.Item>
          <Form.Item name="positioning" label="账号定位"><Input /></Form.Item>
          <Form.Item name="status" label="状态"><Input /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
