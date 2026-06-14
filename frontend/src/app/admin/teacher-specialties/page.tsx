'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Button, Card, Empty, Form, Input, message, Modal, Popconfirm, Space, Table, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient, normalizePagedResult } from '@/shared/api/apiClient';
import type { PagedResult } from '@/shared/types/pagination';
import { formatDateTime } from '@/shared/utils/date-format';

type Item = {
  id: number;
  name: string;
  createdAt: string;
};

export default function AdminTeacherSpecialtiesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [form] = Form.useForm<{ name: string }>();

  async function load(kw = keyword, nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    try {
      const data = await apiClient.get<PagedResult<Item>>('/teacher-specialties', {
        query: { keyword: kw, page: nextPage, pageSize: nextPageSize },
      });
      const result = normalizePagedResult<Item>(data);
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch {
      message.error('加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  function openEdit(record: Item) {
    setEditing(record);
    form.setFieldsValue({ name: record.name });
    setModalOpen(true);
  }

  async function handleSubmit() {
    const values = await form.validateFields();
    try {
      if (editing) {
        await apiClient.request(`/teacher-specialties/${editing.id}`, { method: 'PUT', body: values });
        message.success('已更新');
      } else {
        await apiClient.post('/teacher-specialties', values);
        message.success('已添加');
      }
      setModalOpen(false);
      void load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '操作失败';
      message.error(msg);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiClient.delete(`/teacher-specialties/${id}`);
      message.success('已删除');
      void load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || '删除失败';
      message.error(msg);
    }
  }

  const columns: ColumnsType<Item> = [
    { title: '专业方向名称', dataIndex: 'name', width: 220, ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: (v: string) => formatDateTime(v) },
    {
      title: '操作', width: 84,
      render: (_: unknown, record: Item) => (
        <Space size={0} wrap={false}>
          <Button type="text" size="small" icon={<EditOutlined />} aria-label="编辑" onClick={() => openEdit(record)} />
          <Popconfirm
            title="确定删除？"
            description="如果该专业方向已被老师使用，将无法删除"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>专业方向管理</Typography.Title>
          <Typography.Paragraph type="secondary">维护老师可选的专业方向列表，老师在教务端编辑时可多选。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Input
            placeholder="搜索名称"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); void load(keyword, 1, pageSize); }}
            style={{ width: 200 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); setPage(1); void load('', 1, pageSize); }}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增专业方向</Button>
        </Space>
      </div>
      <Card styles={{ body: { overflow: 'auto' } }}>
        <Table<Item>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="暂无专业方向" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showTotal: (t) => `共 ${t} 项`,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => { void load(keyword, nextPage, nextPageSize); },
          }}
        />
      </Card>
      <Modal
        title={editing ? '编辑专业方向' : '新增专业方向'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：计算机视觉、自然语言处理" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
