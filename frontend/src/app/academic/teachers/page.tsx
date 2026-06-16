'use client';

import { DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined } from '@ant-design/icons';
import {
  Button, Card, Descriptions, Empty, Form, Input, message, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload, Image,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { uploadFile } from '@/shared/api/uploads';
import { formatTeacherCatalogNames } from './teacherDisplay';

/* ------------------------------------------------------------------ */
/*  类型                                                               */
/* ------------------------------------------------------------------ */

type Teacher = {
  id: string;
  name: string;
  phone?: string | null;
  wechat?: string | null;
  school?: string | null;
  education?: string | null;
  researchArea?: string | null;
  specialty?: string | null;
  direction?: string | null;
  /** 后端解析后的专业方向名称（只读展示） */
  specialtyNames?: string | null;
  /** 后端解析后的接单类型名称（只读展示） */
  directionNames?: string | null;
  tutoringType?: string | null;
  imageUrl?: string | null;
  stability: string;
  qualityScore?: string | null;
  qualityLevel?: string | null;
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
  school?: string;
  education?: string;
  researchArea?: string;
  specialty?: string | string[];
  direction?: string | string[];
  tutoringType?: string;
  imageUrl?: string;
  stability: string;
  qualityScore?: string | null;
  qualityLevel?: string | null;
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

const QUALITY_LEVEL_OPTIONS = [
  { label: '优秀', value: '优秀' },
  { label: '一般', value: '一般' },
  { label: '差', value: '差' },
];

const QUALITY_LEVEL_MAP: Record<string, { color: string; bg: string }> = {
  '优秀': { color: '#fff', bg: '#52c41a' },
  '一般': { color: '#fff', bg: '#faad14' },
  '差': { color: '#fff', bg: '#ff4d4f' },
};

const EDUCATION_OPTIONS = [
  { label: '专科', value: '专科' },
  { label: '本科', value: '本科' },
  { label: '硕士', value: '硕士' },
  { label: '博士', value: '博士' },
  { label: '其他', value: '其他' },
];

const TUTORING_TYPE_OPTIONS = [
  { label: '辅导', value: '辅导' },
  { label: '全流程', value: '全流程' },
  { label: '都可', value: '都可' },
];

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
  const [uploading, setUploading] = useState(false);
  const [specialtyOptions, setSpecialtyOptions] = useState<{ label: string; value: string }[]>([]);
  const [orderTypeOptions, setOrderTypeOptions] = useState<{ label: string; value: string }[]>([]);
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

  // 加载专业方向和接单类型选项（value=ID，供编辑表单多选 Select 使用）
  useEffect(() => {
    apiClient.get<any>('/teacher-specialties').then((data) => {
      const list = Array.isArray(data) ? data : data?.items ?? [];
      setSpecialtyOptions(list.map((s: any) => ({ label: s.name, value: String(s.id) })));
    }).catch(() => {});
    apiClient.get<any>('/teacher-order-types').then((data) => {
      const list = Array.isArray(data) ? data : data?.items ?? [];
      setOrderTypeOptions(list.map((t: any) => ({ label: t.name, value: String(t.id) })));
    }).catch(() => {});
  }, []);

  /* ---------- 搜索 ---------- */
  function handleSearch() { setPage(1); void load(keyword, 1); }

  /* ---------- 图片上传 ---------- */
  async function handleUploadImage(file: File): Promise<string | null> {
    setUploading(true);
    try {
      const result = await uploadFile(file, 'teacher-images');
      const url = result.url;
      form.setFieldsValue({ imageUrl: url });
      message.success('图片上传成功');
      return url;
    } catch {
      message.error('图片上传失败');
      return null;
    } finally {
      setUploading(false);
    }
  }

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
      school: record.school || undefined,
      education: record.education || undefined,
      researchArea: record.researchArea || undefined,
      specialty: record.specialty ? record.specialty.split(/[、,]/).filter(Boolean) : [],
      direction: record.direction ? record.direction.split(/[、,]/).filter(Boolean) : [],
      tutoringType: record.tutoringType || undefined,
      imageUrl: record.imageUrl || undefined,
      stability: record.stability,
      qualityScore: record.qualityScore || undefined,
      qualityLevel: record.qualityLevel || undefined,
      remark: record.remark || undefined,
    });
    setModalOpen(true);
  }

  async function handleSubmit() {
    const raw = await form.validateFields();
    const values = {
      ...raw,
      specialty: Array.isArray(raw.specialty) ? raw.specialty.join('、') : raw.specialty,
      direction: Array.isArray(raw.direction) ? raw.direction.join('、') : raw.direction,
    };
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
      width: 100,
      render: (v: string) => <Typography.Text strong>{v || '未命名'}</Typography.Text>,
    },
    {
      title: '学校',
      dataIndex: 'school',
      width: 120,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '学历',
      dataIndex: 'education',
      width: 70,
      render: (v: string | null) => v ? <Tag>{v}</Tag> : '-',
    },
    {
      title: '专业方向',
      width: 160,
      render: (_: unknown, r: Teacher) => formatTeacherCatalogNames(r.specialty, specialtyOptions, r.specialtyNames),
      ellipsis: true,
    },
    {
      title: '接单类型',
      width: 120,
      render: (_: unknown, r: Teacher) => formatTeacherCatalogNames(r.direction, orderTypeOptions, r.directionNames),
      ellipsis: true,
    },
    {
      title: '辅导类型',
      dataIndex: 'tutoringType',
      width: 90,
      render: (v: string | null) => v || '-',
    },
    {
      title: '稳定性',
      dataIndex: 'stability',
      width: 90,
      render: (v: string) => {
        const m = STABILITY_MAP[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '质量评分',
      dataIndex: 'qualityScore',
      width: 80,
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
      title: '质量等级',
      dataIndex: 'qualityLevel',
      width: 80,
      align: 'center',
      render: (v: string | null) => {
        if (!v) return <Tag>-</Tag>;
        const m = QUALITY_LEVEL_MAP[v] || { color: '#000', bg: '#d9d9d9' };
        return (
          <Tag
            style={{
              color: m.color,
              backgroundColor: m.bg,
              border: 'none',
              fontWeight: 700,
              padding: '2px 10px',
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
      width: 80,
      render: (v: string) => {
        const m = STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={m.color}>{m.label}</Tag>;
      },
    },
    {
      title: '当前/累计',
      width: 80,
      render: (_: unknown, r: Teacher) => `${r.currentOrders}/${r.totalOrders}`,
    },
    {
      title: '联系方式',
      width: 120,
      render: (_: unknown, r: Teacher) => {
        const parts = [r.phone, r.wechat].filter(Boolean);
        return parts.length > 0 ? parts.join(' / ') : '-';
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 100,
      ellipsis: true,
      render: (v: string | null) => v || '-',
    },
    {
      title: '操作',
      width: 100,
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
            管理教务端合作老师档案，记录专业能力、接单方向、稳定性与质量评分。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Input
            placeholder="搜索姓名/专业/学校"
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
          scroll={{ x: 1300 }}
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
        width={720}
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
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="school" label="学校/单位" style={{ flex: 1 }}>
              <Input placeholder="如：北京大学" />
            </Form.Item>
            <Form.Item name="education" label="学历" style={{ flex: 1 }}>
              <Select options={EDUCATION_OPTIONS} placeholder="请选择学历" allowClear style={{ minWidth: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="specialty" label="专业方向">
            <Select mode="multiple" placeholder="请选择专业方向" options={specialtyOptions} />
          </Form.Item>
          <Form.Item name="researchArea" label="研究领域">
            <Input placeholder="如：机器学习、自然语言处理" />
          </Form.Item>
          <Form.Item name="direction" label="接单类型">
            <Select mode="multiple" placeholder="请选择接单类型" options={orderTypeOptions} />
          </Form.Item>
          <Form.Item name="tutoringType" label="辅导类型" style={{ flex: 1 }}>
            <Select options={TUTORING_TYPE_OPTIONS} placeholder="请选择辅导类型" allowClear style={{ minWidth: 120 }} />
          </Form.Item>
          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item name="stability" label="稳定性" style={{ flex: 1 }}>
              <Select options={STABILITY_OPTIONS} placeholder="请选择稳定性" style={{ minWidth: 140 }} />
            </Form.Item>
            <Form.Item name="qualityScore" label="质量评分(A/B/C)" style={{ flex: 1 }}>
              <Select options={SCORE_OPTIONS} placeholder="请选择质量评分" allowClear />
            </Form.Item>
            <Form.Item name="qualityLevel" label="质量等级" style={{ flex: 1 }}>
              <Select options={QUALITY_LEVEL_OPTIONS} placeholder="优秀/一般/差" allowClear />
            </Form.Item>
          </Space>
          <Form.Item label="老师头像/图片">
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={(file) => {
                  void handleUploadImage(file);
                  return false;
                }}
              >
                <Button icon={<UploadOutlined />} loading={uploading}>上传图片</Button>
              </Upload>
              <Form.Item name="imageUrl" noStyle>
                <Input placeholder="或直接输入图片 URL" />
              </Form.Item>
              {form.getFieldValue('imageUrl') && (
                <Image
                  src={form.getFieldValue('imageUrl')}
                  alt="老师头像预览"
                  style={{ maxWidth: 120, maxHeight: 120, objectFit: 'cover', borderRadius: 4 }}
                />
              )}
            </Space>
          </Form.Item>
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
        width={600}
      >
        {detailTeacher && (
          <Descriptions column={2} bordered size="small" labelStyle={{ width: 100 }}>
            <Descriptions.Item label="姓名" span={2}>
              <Typography.Text strong>{detailTeacher.name || '-'}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="学校">{detailTeacher.school || '-'}</Descriptions.Item>
            <Descriptions.Item label="学历">{detailTeacher.education || '-'}</Descriptions.Item>
            <Descriptions.Item label="研究领域" span={2}>{detailTeacher.researchArea || '-'}</Descriptions.Item>
            <Descriptions.Item label="联系电话">{detailTeacher.phone || '-'}</Descriptions.Item>
            <Descriptions.Item label="微信号">{detailTeacher.wechat || '-'}</Descriptions.Item>
            <Descriptions.Item label="专业方向" span={2}>
              {formatTeacherCatalogNames(detailTeacher.specialty, specialtyOptions, detailTeacher.specialtyNames)}
            </Descriptions.Item>
            <Descriptions.Item label="接单类型" span={2}>
              <div style={{ wordBreak: 'break-word', whiteSpace: 'normal', lineHeight: 1.8 }}>
                {formatTeacherCatalogNames(detailTeacher.direction, orderTypeOptions, detailTeacher.directionNames)}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="辅导类型">{detailTeacher.tutoringType || '-'}</Descriptions.Item>
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
            <Descriptions.Item label="质量等级">
              {(() => {
                const v = detailTeacher.qualityLevel;
                if (!v) return '-';
                const m = QUALITY_LEVEL_MAP[v] || { color: '#000', bg: '#d9d9d9' };
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
            <Descriptions.Item label="头像" span={2}>
              {detailTeacher.imageUrl ? (
                <Image src={detailTeacher.imageUrl} alt="老师头像" style={{ maxWidth: 120, maxHeight: 120, objectFit: 'cover', borderRadius: 4 }} />
              ) : '-'}
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
