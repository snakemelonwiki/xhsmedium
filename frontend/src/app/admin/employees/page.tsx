'use client';

import { Button, Card, Form, Input, Modal, Space, Table, Typography, message } from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';

import { listAdminEmployees, saveAdminEmployee } from '@/shared/api/admin';
import type { AdminEmployee } from '@/shared/types/admin';

export default function AdminEmployeesPage() {
  const [items, setItems] = useState<AdminEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminEmployee>();
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();

  async function load(page = pagination.current, pageSize = pagination.pageSize, nextKeyword = keyword) {
    setLoading(true);
    try {
      const result = await listAdminEmployees({ page, pageSize, keyword: nextKeyword.trim() || undefined });
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

  function startEdit(record?: AdminEmployee) {
    setEditing(record);
    form.setFieldsValue(record ?? { status: 'active' });
    setOpen(true);
  }

  async function submit(values: Partial<AdminEmployee> & { name: string }) {
    await saveAdminEmployee({ ...editing, ...values });
    message.success('员工信息已保存');
    setOpen(false);
    form.resetFields();
    await load();
  }

  function handleSearch(value: string) {
    const nextKeyword = value.trim();
    setKeyword(nextKeyword);
    void load(1, pagination.pageSize, nextKeyword);
  }

  const columns: TableColumnsType<AdminEmployee> = [
    { title: '姓名', dataIndex: 'name' },
    { title: '员工编号', dataIndex: 'employeeCode', render: (value?: string) => value || '-' },
    { title: '电话', dataIndex: 'phone', render: (value?: string) => value || '-' },
    { title: '状态', dataIndex: 'status', render: (value?: string) => value || 'active' },
    { title: '操作', render: (_value, record) => <Button onClick={() => startEdit(record)}>编辑</Button> },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>员工管理</Typography.Title>
          <Typography.Paragraph type="secondary">维护员工资料、状态和基础联系方式。</Typography.Paragraph>
        </div>
        <Button type="primary" onClick={() => startEdit()}>新增员工</Button>
      </div>
      <Card>
        <Input.Search
          allowClear
          value={keyword}
          placeholder="搜索姓名、员工编号、电话、状态"
          onChange={(event) => {
            const value = event.target.value;
            setKeyword(value);
            if (!value) void load(1, pagination.pageSize, '');
          }}
          onSearch={handleSearch}
          style={{ width: 320, maxWidth: '100%', marginBottom: 16 }}
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
      <Modal title={editing ? '编辑员工' : '新增员工'} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
          <Form.Item name="employeeCode" label="员工编号"><Input /></Form.Item>
          <Form.Item name="phone" label="电话"><Input /></Form.Item>
          <Form.Item name="status" label="状态"><Input /></Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
