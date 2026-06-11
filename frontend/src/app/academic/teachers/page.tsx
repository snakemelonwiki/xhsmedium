'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Button, Card, Descriptions, Empty, Form, Input, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

/* ------------------------------------------------------------------ */
/*  类型                                                               */
/* ------------------------------------------------------------------ */

type Teacher = {
  id: string;
  name: string;
  phone?: string | null;
  wechat?: string | null;
  specialty?: string | null;
  direction?: string | null;
  stability: string;
  qualityScore?: string | null;
  remark?: string | null;
  status: string;
  currentOrders: number;
  totalOrders: number;
  createdAt: string;
  updatedAt: string;
};

type TeacherFormValues = {
  name: string;
  phone?: string;
  wechat?: string;
  specialty?: string;
  direction?: string;
  stability: string;
  qualityScore?: string | null;
  remark?: string;
};

/* ------------------------------------------------------------------ */
/*  常量                                                               */
/* ------------------------------------------------------------------ */

const STABILITY_OPTIONS = [
  { label: '稳定老师', value: 'stable' },
  { label: '新老师', value: 'new' },
  { label: '试合作', value: 'probation' },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  idle: { label: '空闲', color: 'green' },
  working: { label: '接单中', color: 'blue' },
  full: { label: '满载', color: 'red' },
};

const STABILITY_MAP: Record<string, { label: string; color: string }> = {
  stable: { label: '稳定老师', color: 'green' },
  new: { label: '新老师', color: 'orange' },
  probation: { label: '试合作', color: 'blue' },
};

const SCORE_OPTIONS = [
  { label: 'A — 优秀', value: 'A' },
  { label: 'B — 良好', value: 'B' },
  { label: 'C — 一般', value: 'C' },
];

const SCORE_MAP: Record<string, { color: string; bg: string }> = {
  A: { color: '#fff', bg: '#52c41a' },
  B: { color: '#fff', bg: '#1890ff' },
  C: { color: '#fff', bg: '#faad14' },
};

/* ------------------------------------------------------------------ */
/*  页面                                                               */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

export default function AcademicTeachersPage() {
  const [items, setItems] = useState<Teacher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [detailTeacher, setDetailTeacher] = useState<Teacher | null>(null);
  const [form] = Form.useForm<TeacherFormValues>();

  /* ---------- 加载列表 ---------- */
  async function load(kw = keyword, p = page) {
    setLoading(true);
    try {
      const data = await apiClient.get<any>('/teachers', {
        query: { keyword: kw, limit: PAGE_SIZE, offset: (p - 1) * PAGE_SIZE },
      });
      setItems(data?.items ?? (Array.isArray(data) ? data : []));
      setTotal(data?.total ?? 0);
    } catch {
      message.error('老师列表加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load('', 1); }, []);

  /* ---------- 搜索 ---------- */
  function handleSearch() { setPage(1); void load(keyword, 1); }

  /* ---------- 新增/编辑弹窗 ---------- */
  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ stability: 'new' });
    setModalOpen(true);
  }

  function openEdit(record: Teacher) {
    setEditing(record);
    form.setFieldsValue({
      name: record.name,
      phone: record.phone || undefined,
      wechat: record.wechat || undefined,
      specialty: record.specialty || undefined,
      direction: record.direction || undefined,
      stability: record.stability,
      qualityScore: record.qualityScore || undefined,
      remark: record.remark || undefined,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    const values = await form.validateFields();
    try {
      if (editing) {
        await apiClient.request(`/teachers/${editing.id}`, { method: 'PUT', body: values });
        message.success('老师资料已更新');
      } else {
        await apiClient.post('/teachers', values);
        message.success('老师已添加');
      }
      setModalOpen(false);
      if (!editing) { setPage(1); void load(keyword, 1); } else { void load(); }
    } catch {
      message.error('操作失败');
    }
  }

  /* ---------- 删除 ---------- */
  async function handleDelete(id: string) {
    try {
      await apiClient.delete(`/teachers/${id}`);
      message.success('已删除');
      // 删除后如果当前页变空则回退一页
      const nextTotal = total - 1;
      const nextPage = Math.min(page, Math.max(1, Math.ceil(nextTotal / PAGE_SIZE)));
      setPage(nextPage);
      void load(keyword, nextPage);
    } catch {
      message.error('删除失败');
    }
  }

  /* ---------- 表格列 ---------- */
  const columns: ColumnsType<Teacher> = [
    {
      title: '老师姓名',
      dataIndex: 'name',
      width: 120,
      render: (v: string) => <Typography.Text strong>{v || '未命名'}</Typography.Text>,
    },
    {
      title: '专业能力',
      dataIndex: 'specialty',
      width: 150,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '接单方向',
      dataIndex: 'direction',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '稳定性',
      dataIndex: 'stability',
      width: 100,
      render: (v: string) => {
        const m = STABILITY_MAP[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '质量评分',
      dataIndex: 'qualityScore',
      width: 90,
      align: 'center',
      render: (v: string | null) => {
        if (!v) return <Tag>-</Tag>;
        const m = SCORE_MAP[v] || { color: '#000', bg: '#d9d9d9' };
        return (
          <Tag
            style={{
              color: m.color,
              backgroundColor: m.bg,
              border: 'none',
              fontSize: 16,
              fontWeight: 700,
              padding: '2px 14px',
              borderRadius: 4,
            }}
          >
            {v}
          </Tag>
        );
      },
    },
    {
      title: '接单状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const m = STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '当前/累计',
      width: 100,
      render: (_: unknown, r: Teacher) => `${r.currentOrders}/${r.totalOrders}`,
    },
    {
      title: '联系方式',
      width: 140,
      render: (_: unknown, r: Teacher) => r.phone || r.wechat || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: Teacher) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除该老师？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  /* ---------- 渲染 ---------- */
  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>稳定老师库</Typography.Title>
          <Typography.Paragraph type="secondary">
            管教务端合作老师档案，记录专业能力、接单方向、稳定性与质量评分。稳定老师在订单派单时可跳过创新点审核。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Input
            placeholder="搜索姓名/专业/方向"
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={handleSearch}
            style={{ width: 220 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(''); void load(''); }}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增老师
          </Button>
        </Space>
      </div>

      <Card>
        <Table<Teacher>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          locale={{ emptyText: <Empty description="暂无老师资料" /> }}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 位老师`,
            onChange: (p) => { setPage(p); void load(keyword, p); },
          }}
          onRow={(record) => ({
            onClick: (e) => {
              // 点击操作列按钮时不触发详情
              if ((e.target as HTMLElement).closest('.ant-btn')) return;
              setDetailTeacher(record);
            },
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? '编辑老师' : '新增老师'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={600}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ stability: 'new' }}>
          <Form.Item name="name" label="老师姓名" rules={[{ required: true, message: '请输入老师姓名' }]}>
            <Input placeholder="请输入老师姓名" />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="phone" label="联系电话" style={{ flex: 1 }}>
              <Input placeholder="电话号码" />
            </Form.Item>
            <Form.Item name="wechat" label="微信号" style={{ flex: 1 }}>
              <Input placeholder="微信号" />
            </Form.Item>
          </Space>
          <Form.Item name="specialty" label="专业能力">
            <Input placeholder="如：医学统计、教育管理、经管实证" />
          </Form.Item>
          <Form.Item name="direction" label="接单方向">
            <Input placeholder="多个方向用逗号分隔" />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="stability" label="稳定性" style={{ flex: 1 }}>
              <Select options={STABILITY_OPTIONS} placeholder="请选择稳定性" style={{ minWidth: 140 }} />
            </Form.Item>
            <Form.Item name="qualityScore" label="质量评分" style={{ flex: 1 }}>
              <Select options={SCORE_OPTIONS} placeholder="请选择质量评分" />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="记录响应速度、返修配合度、擅长期刊、风险点等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 详情卡片 */}
      <Modal
        title="老师详情"
        open={!!detailTeacher}
        onCancel={() => setDetailTeacher(null)}
        footer={null}
        width={520}
      >
        {detailTeacher && (
          <Descriptions column={2} bordered size="small" labelStyle={{ width: 100 }}>
            <Descriptions.Item label="姓名" span={2}>
              <Typography.Text strong>{detailTeacher.name || '-'}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="联系电话">{detailTeacher.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="微信号">{detailTeacher.wechat || '-'}</Descriptions.Item>
            <Descriptions.Item label="专业能力" span={2}>{detailTeacher.specialty || '-'}</Descriptions.Item>
            <Descriptions.Item label="接单方向" span={2}>
              <div style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.8 }}>
                {detailTeacher.direction || '-'}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="稳定性">
              {(() => {
                const m = STABILITY_MAP[detailTeacher.stability] || { label: detailTeacher.stability, color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="质量评分">
              {(() => {
                const v = detailTeacher.qualityScore;
                if (!v) return '-';
                const m = SCORE_MAP[v] || { color: '#000', bg: '#d9d9d9' };
                return (
                  <Tag style={{ color: m.color, backgroundColor: m.bg, border: 'none', fontWeight: 700 }}>
                    {v}
                  </Tag>
                );
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="接单状态">
              {(() => {
                const m = STATUS_MAP[detailTeacher.status] || { label: detailTeacher.status, color: 'default' };
                return <Tag color={m.color}>{m.label}</Tag>;
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="接单数">
              {detailTeacher.currentOrders} / {detailTeacher.totalOrders}
            </Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>
              <div style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                {detailTeacher.remark || '-'}
              </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Space>
  );
}
