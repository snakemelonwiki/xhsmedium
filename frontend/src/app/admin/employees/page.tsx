'use client';

import {
  Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography, message,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listAdminEmployees, saveAdminEmployee } from '@/shared/api/admin';
import type { AdminEmployee } from '@/shared/types/admin';

const { Text, Paragraph } = Typography;

type Employee = AdminEmployee & {
  userId?: string;
  username?: string;
  role?: string;
  department?: string;
  roleType?: string;
};

type UserRecord = {
  id?: string;
  employeeId?: string;
  username?: string;
  role?: string;
};

const ROLE_OPTIONS = [
  { label: '运营', value: 'operations' },
  { label: '销售', value: 'sales' },
  { label: '教务', value: 'academic' },
  { label: '主管', value: 'supervisor' },
  { label: '系统管理员', value: 'admin' },
];

const STATUS_OPTIONS = [
  { label: '在职', value: '在职' },
  { label: '停用', value: '停用' },
  { label: '离职', value: '离职' },
];

const ROLE_TAG_COLORS: Record<string, string> = {
  operations: 'blue',
  sales: 'green',
  academic: 'purple',
  supervisor: 'orange',
  admin: 'red',
};

function getRoleLabel(value?: string): string {
  return ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '-';
}

function getRoleTagColor(value?: string): string {
  return ROLE_TAG_COLORS[value ?? ''] ?? 'default';
}

export default function AdminEmployeesPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee>();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();

  // 筛选状态
  const [filterRole, setFilterRole] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDepartment, setFilterDepartment] = useState<string>('');
  const [keyword, setKeyword] = useState('');

  // 绑定账号弹窗
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [bindingEmployee, setBindingEmployee] = useState<Employee>();
  const [bindForm] = Form.useForm();

  // 停用确认弹窗
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateEmployee, setDeactivateEmployee] = useState<Employee>();
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  // 新建登录账号弹窗
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createUserForm] = Form.useForm();
  const [createUserLoading, setCreateUserLoading] = useState(false);

  async function load(page = pagination.current, pageSize = pagination.pageSize) {
    setLoading(true);
    try {
      const result = await listAdminEmployees({ page, pageSize, keyword: keyword.trim() || undefined });
      // 补充员工关联的登录账号信息
      const enriched = await Promise.all(
        result.items.map(async (emp) => {
          try {
            const users = await apiClient.get<unknown[]>('/users', { query: { limit: 100 } });
            const matched = (users as UserRecord[]).find((u) => u.employeeId === emp.id);
            return {
              ...emp,
              userId: matched?.id,
              username: matched?.username,
              role: matched?.role,
            } as Employee;
          } catch {
            return { ...emp } as Employee;
          }
        }),
      );
      setItems(enriched);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } catch {
      setItems([]);
      setPagination((current) => ({ ...current, total: 0 }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(record?: Employee) {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      roleType: record?.roleType || 'operations',
      status: record?.status || '在职',
    });
    setOpen(true);
  }

  async function submit(values: Partial<Employee> & { name: string }) {
    await saveAdminEmployee({ ...editing, ...values } as Parameters<typeof saveAdminEmployee>[0]);
    message.success(editing ? '员工信息已更新' : '员工已新增');
    setOpen(false);
    form.resetFields();
    void load();
  }

  function openBindModal(record: Employee) {
    setBindingEmployee(record);
    bindForm.resetFields();
    setBindModalOpen(true);
  }

  async function submitBindAccount(values: { username: string; password: string }) {
    if (!bindingEmployee) return;
    setLoading(true);
    try {
      await apiClient.post('/users/staff', {
        username: values.username,
        password: values.password,
        employeeId: bindingEmployee.id,
        status: 'active',
      });
      message.success('登录账号绑定成功');
      setBindModalOpen(false);
      bindForm.resetFields();
      void load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '绑定失败';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function openDeactivateConfirm(record: Employee) {
    setDeactivateEmployee(record);
    setDeactivateModalOpen(true);
  }

  async function confirmDeactivate() {
    if (!deactivateEmployee) return;
    setDeactivateLoading(true);
    try {
      await apiClient.request(`/employees/${deactivateEmployee.id}`, {
        method: 'PATCH',
        body: { status: '停用' },
      });
      message.success(`员工"${deactivateEmployee.name}"已停用`);
      setDeactivateModalOpen(false);
      void load();
    } catch (err: unknown) {
      message.error((err as Error)?.message || '停用失败');
    } finally {
      setDeactivateLoading(false);
    }
  }

  function openCreateUserModal(record: Employee) {
    setBindingEmployee(record);
    createUserForm.resetFields();
    setCreateUserModalOpen(true);
  }

  async function submitCreateUser(values: { username: string; password: string }) {
    if (!bindingEmployee) return;
    setCreateUserLoading(true);
    try {
      await apiClient.post('/users/staff', {
        username: values.username,
        password: values.password,
        employeeId: bindingEmployee.id,
        status: 'active',
      });
      message.success('登录账号创建成功');
      setCreateUserModalOpen(false);
      createUserForm.resetFields();
      void load();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '创建失败';
      message.error(msg);
    } finally {
      setCreateUserLoading(false);
    }
  }

  function handleSearch(value: string) {
    const nextKeyword = value.trim();
    setKeyword(nextKeyword);
    void load(1, pagination.pageSize);
  }

  function handleTableChange(next: TablePaginationConfig) {
    void load(next.current ?? 1, next.pageSize ?? 20);
  }

  // 筛选后的数据
  const filteredItems = items.filter((item) => {
    if (filterRole && item.roleType !== filterRole && item.role !== filterRole) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (filterDepartment && item.department !== filterDepartment) return false;
    return true;
  });

  const columns: TableColumnsType<Employee> = [
    { title: '姓名', dataIndex: 'name', width: 100 },
    { title: '工号', dataIndex: 'employeeCode', width: 100, render: (v) => v || '-' },
    {
      title: '角色',
      dataIndex: 'roleType',
      width: 100,
      render: (v, record) => {
        const role = v || record?.role;
        return role ? <Tag color={getRoleTagColor(role)}>{getRoleLabel(role)}</Tag> : '-';
      },
    },
    { title: '部门', dataIndex: 'department', width: 100, render: (v) => v || '-' },
    { title: '手机号', dataIndex: 'phone', width: 130, render: (v) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const status = v || '在职';
        const color = status === '在职' ? 'green' : status === '停用' ? 'red' : 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: '绑定登录账号',
      dataIndex: 'username',
      width: 130,
      render: (v, record) => {
        if (v) {
          return (
            <Space size={4}>
              <Tag color="blue">{v}</Tag>
              <Button size="small" type="link" onClick={() => openBindModal(record!)}>改绑定</Button>
            </Space>
          );
        }
        return (
          <Button size="small" type="link" onClick={() => openCreateUserModal(record!)}>
            创建登录账号
          </Button>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: Employee) => (
        <Space size={4}>
          <Button size="small" onClick={() => startEdit(record)}>编辑</Button>
          {record.status !== '停用' && (
            <Button size="small" danger type="text" onClick={() => openDeactivateConfirm(record)}>
              停用
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {/* 页面标题 */}
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>员工管理</Typography.Title>
          <Typography.Paragraph type="secondary">
            维护员工资料、状态和登录账号绑定。支持按角色、部门、状态筛选。
          </Typography.Paragraph>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索姓名、工号、手机"
            onSearch={handleSearch}
            style={{ width: 200 }}
          />
          <Button type="primary" onClick={() => startEdit()}>新增员工</Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <Card size="small">
        <Space size={12} wrap>
          <Select
            allowClear
            placeholder="按角色"
            value={filterRole || undefined}
            options={ROLE_OPTIONS}
            onChange={(v) => setFilterRole(v ?? '')}
            style={{ width: 120 }}
          />
          <Select
            allowClear
            placeholder="按状态"
            value={filterStatus || undefined}
            options={STATUS_OPTIONS}
            onChange={(v) => setFilterStatus(v ?? '')}
            style={{ width: 100 }}
          />
          <Input
            allowClear
            placeholder="按部门"
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            style={{ width: 120 }}
          />
          <Button
            onClick={() => {
              setFilterRole('');
              setFilterStatus('');
              setFilterDepartment('');
            }}
          >
            重置
          </Button>
        </Space>
      </Card>

      {/* 主表格 */}
      <Card>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredItems}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          onChange={handleTableChange}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* 新增/编辑员工弹窗 */}
      <Modal
        title={editing ? '编辑员工' : '新增员工'}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="employeeCode" label="工号">
                <Input placeholder="系统自动生成" disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="roleType" label="角色">
                <Select options={ROLE_OPTIONS} placeholder="选择角色" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department" label="部门">
                <Input placeholder="请输入部门" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="手机号">
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="状态">
                <Select options={STATUS_OPTIONS} placeholder="选择状态" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 停用确认弹窗 */}
      <Modal
        title="停用员工确认"
        open={deactivateModalOpen}
        onCancel={() => setDeactivateModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeactivateModalOpen(false)}>取消</Button>,
          <Button key="confirm" type="primary" danger loading={deactivateLoading} onClick={confirmDeactivate}>
            确认停用
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Paragraph>
            即将停用员工：<Text strong>{deactivateEmployee?.name}</Text>
          </Paragraph>
          <Card size="small" type="inner">
            <Paragraph type="warning" style={{ marginBottom: 8 }}>
              停用后将会产生以下影响：
            </Paragraph>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>该员工的登录账号将被停用，无法登录系统</li>
              <li>该员工关联的运营账号将无法正常使用</li>
              <li>该员工负责的客资将变为待分配状态</li>
              <li>该员工关联的订单将需要重新分配跟进人</li>
            </ul>
          </Card>
          <Text type="secondary">如需继续，请点击"确认停用"。</Text>
        </Space>
      </Modal>

      {/* 绑定已有账号弹窗 */}
      <Modal
        title="绑定登录账号"
        open={bindModalOpen}
        onCancel={() => { setBindModalOpen(false); bindForm.resetFields(); }}
        onOk={() => bindForm.submit()}
        confirmLoading={loading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>
            为员工 <Text strong>{bindingEmployee?.name}</Text> 绑定已有登录账号
          </Text>
          <Form form={bindForm} layout="vertical" onFinish={submitBindAccount} preserve={false}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>

      {/* 创建登录账号弹窗 */}
      <Modal
        title="创建登录账号"
        open={createUserModalOpen}
        onCancel={() => { setCreateUserModalOpen(false); createUserForm.resetFields(); }}
        onOk={() => createUserForm.submit()}
        confirmLoading={createUserLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Text>
            为员工 <Text strong>{bindingEmployee?.name}</Text> 创建新的登录账号
          </Text>
          <Form form={createUserForm} layout="vertical" onFinish={submitCreateUser} preserve={false}>
            <Form.Item
              name="username"
              label="用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
              ]}
            >
              <Input placeholder="请输入用户名" />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
