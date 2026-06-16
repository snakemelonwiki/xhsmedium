'use client';

import {
  App, Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Typography,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { apiClient } from '@/shared/api/apiClient';
import { listAdminEmployees, saveAdminEmployee } from '@/shared/api/admin';
import type { AdminEmployee } from '@/shared/types/admin';
import { validatePasswordStrength } from '@/shared/utils/password';
import { ADMIN_EMPLOYEE_COPY, getEmployeeDialogCopy } from './copy';

const { Text, Paragraph } = Typography;

type Employee = AdminEmployee & {
  userId?: string;
  username?: string;
  role?: string;
  department?: string;
  roleType?: string;
};

/**
 * Tab → status 映射。
 * 默认进入“运营管理”时只显示在职员工；停用/离职的员工通过各自 tab 单独查看。
 * URL query 形如 ?status=active|disabled|resigned，未带参数时按 active 渲染。
 */
type EmployeeTabKey = 'active' | 'disabled' | 'resigned';
const TAB_TO_STATUS: Record<EmployeeTabKey, string> = {
  active: '在职',
  disabled: '停用',
  resigned: '离职',
};
const STATUS_TO_TAB: Record<string, EmployeeTabKey> = {
  在职: 'active',
  停用: 'disabled',
  离职: 'resigned',
};
const DEFAULT_TAB: EmployeeTabKey = 'active';

function resolveTabFromQuery(rawStatus: string | null): EmployeeTabKey {
  if (!rawStatus) return DEFAULT_TAB;
  const normalized = rawStatus.trim();
  if (normalized === 'active') return 'active';
  if (normalized === 'disabled') return 'disabled';
  if (normalized === 'resigned') return 'resigned';
  return STATUS_TO_TAB[normalized] ?? DEFAULT_TAB;
}

const ROLE_OPTIONS = [
  { label: '运营', value: 'operation' },
  { label: '销售', value: 'sales' },
  { label: '教务', value: 'academic' },
  { label: '教务主管', value: 'academic_supervisor' },
  { label: '主管', value: 'supervisor' },
  { label: '系统管理员', value: 'admin' },
  { label: '运营', value: 'staff' },
];

const STATUS_OPTIONS = [
  { label: '在职', value: '在职' },
  { label: '停用', value: '停用' },
  { label: '离职', value: '离职' },
];

const ROLE_TAG_COLORS: Record<string, string> = {
  operation: 'blue',
  sales: 'green',
  academic: 'purple',
  academic_supervisor: 'purple',
  supervisor: 'orange',
  admin: 'red',
  staff: 'geekblue',
};

function getRoleLabel(value?: string): string {
  return ROLE_OPTIONS.find((o) => o.value === value)?.label ?? value ?? '-';
}

function getRoleTagColor(value?: string): string {
  return ROLE_TAG_COLORS[value ?? ''] ?? 'default';
}

export default function AdminEmployeesPage() {
  const { message: messageApi } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee>();
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();

  // 当前 tab：active=在职 / disabled=停用 / resigned=离职。
  // 初始值取自 ?status= URL 参数，保证刷新 / 链接直达时一致。
  const initialTab = resolveTabFromQuery(searchParams?.get('status') ?? null);
  const [activeTab, setActiveTab] = useState<EmployeeTabKey>(initialTab);
  const [tabCounts, setTabCounts] = useState<{ active: number; disabled: number; resigned: number; total: number }>({
    active: 0,
    disabled: 0,
    resigned: 0,
    total: 0,
  });

  // 筛选状态
  const [filterRole, setFilterRole] = useState<string>('');
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

  // 启用确认弹窗（停用/离职 → 在职）
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);
  const [reactivateEmployee, setReactivateEmployee] = useState<Employee>();
  const [reactivateLoading, setReactivateLoading] = useState(false);

  // 新建登录账号弹窗
  const [createUserModalOpen, setCreateUserModalOpen] = useState(false);
  const [createUserForm] = Form.useForm();
  const [createUserLoading, setCreateUserLoading] = useState(false);

  // 修改密码弹窗
  const [changePwdModalOpen, setChangePwdModalOpen] = useState(false);
  const [changingPwdEmployee, setChangingPwdEmployee] = useState<Employee>();
  const [changePwdForm] = Form.useForm();
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [changePwdResult, setChangePwdResult] = useState<{ username: string; newPassword: string } | null>(null);

  async function load(page = pagination.current, pageSize = pagination.pageSize, tabOverride?: EmployeeTabKey) {
    setLoading(true);
    const tab = tabOverride ?? activeTab;
    try {
      const result = await listAdminEmployees({
        page,
        pageSize,
        keyword: keyword.trim() || undefined,
        status: TAB_TO_STATUS[tab],
      });
      // 运营数据已由后端 enrichWithRoles 关联 userId / username / role，
      // 直接使用，无需额外查询 /users
      setItems(result.items as Employee[]);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } catch {
      setItems([]);
      setPagination((current) => ({ ...current, total: 0 }));
    } finally {
      setLoading(false);
    }
  }

  /**
   * 加载 tab 角标计数（在职 / 停用 / 离职 / 全部）。
   * 不应用任何关键字/部门筛选，单纯按 status 维度统计，便于侧边栏切换前预知数据量。
   * 失败时静默回退到当前 tab 的分页 total，避免阻塞主视图。
   */
  async function refreshTabCounts() {
    const fetchStatus = async (status?: string) => {
      const result = await listAdminEmployees({
        page: 1,
        pageSize: 1,
        status,
      });
      return result.total;
    };
    try {
      const [active, disabled, resigned, total] = await Promise.all([
        fetchStatus(TAB_TO_STATUS.active),
        fetchStatus(TAB_TO_STATUS.disabled),
        fetchStatus(TAB_TO_STATUS.resigned),
        fetchStatus(),
      ]);
      setTabCounts({ active, disabled, resigned, total });
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void load(1, 20);
    void refreshTabCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTabChange(next: EmployeeTabKey) {
    if (next === activeTab) return;
    setActiveTab(next);
    setPagination({ current: 1, pageSize: 20, total: 0 });
    void load(1, 20, next);
    // 同步 URL，便于深链/书签收藏当前 tab。
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('status', next);
    router.replace(`/admin/employees?${params.toString()}`, { scroll: false });
  }

  function startEdit(record?: Employee) {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      roleType: record?.roleType || record?.role || 'staff',
      status: record?.status || '在职',
    });
    setOpen(true);
  }

  async function submit(values: Partial<Employee> & { name: string }) {
    try {
      await saveAdminEmployee({ ...editing, ...values } as Parameters<typeof saveAdminEmployee>[0]);
      messageApi.success(editing ? ADMIN_EMPLOYEE_COPY.updateSuccess : ADMIN_EMPLOYEE_COPY.addSuccess);
      setOpen(false);
      form.resetFields();
      void load();
      void refreshTabCounts();
    } catch (err: unknown) {
      // 任何后端/网络错误都直接抛给用户，避免「点了保存但页面无反应」造成的误判。
      const msg = (err as { message?: string })?.message || '保存失败，请稍后重试';
      messageApi.error(msg);
    }
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
      messageApi.success('登录账号绑定成功');
      setBindModalOpen(false);
      bindForm.resetFields();
      void load();
      void refreshTabCounts();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '绑定失败';
      messageApi.error(msg);
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
      messageApi.success(ADMIN_EMPLOYEE_COPY.deactivateSuccess(deactivateEmployee.name));
      setDeactivateModalOpen(false);
      void load();
      void refreshTabCounts();
    } catch (err: unknown) {
      messageApi.error((err as Error)?.message || '停用失败');
    } finally {
      setDeactivateLoading(false);
    }
  }

  function openReactivateConfirm(record: Employee) {
    setReactivateEmployee(record);
    setReactivateModalOpen(true);
  }

  async function confirmReactivate() {
    if (!reactivateEmployee) return;
    setReactivateLoading(true);
    try {
      await apiClient.request(`/employees/${reactivateEmployee.id}`, {
        method: 'PATCH',
        body: { status: '在职' },
      });
      messageApi.success(`运营"${reactivateEmployee.name}"已重新启用`);
      setReactivateModalOpen(false);
      void load();
      void refreshTabCounts();
    } catch (err: unknown) {
      messageApi.error((err as Error)?.message || '启用失败');
    } finally {
      setReactivateLoading(false);
    }
  }

  function openCreateUserModal(record: Employee) {
    setBindingEmployee(record);
    createUserForm.resetFields();
    setCreateUserModalOpen(true);
  }

  function openChangePasswordModal(record: Employee) {
    setChangingPwdEmployee(record);
    setChangePwdResult(null);
    changePwdForm.resetFields();
    setChangePwdModalOpen(true);
  }

  async function submitChangePassword(values: { newPassword: string; confirmPassword: string }) {
    if (!changingPwdEmployee) return;
    const strength = validatePasswordStrength(values.newPassword);
    if (!strength.valid) {
      messageApi.error(strength.message);
      return;
    }
    setChangePwdLoading(true);
    try {
      const res = await apiClient.request<{ ok: boolean; username: string; newPassword: string; message?: string }>(
        `/employees/${changingPwdEmployee.id}/reset-password`,
        {
          method: 'POST',
          body: { newPassword: values.newPassword },
        },
      );
      if (res.ok) {
        setChangePwdResult({ username: res.username, newPassword: res.newPassword });
        messageApi.success('密码修改成功');
      } else {
        messageApi.error(res.message || '修改失败');
      }
    } catch (err: unknown) {
      messageApi.error((err as Error)?.message || '修改失败');
    } finally {
      setChangePwdLoading(false);
    }
  }

  async function submitCreateUser(values: { username: string; password: string }) {
    if (!bindingEmployee) return;
    setCreateUserLoading(true);
    try {
      console.log('[submitCreateUser] Calling API with:', { username: values.username, employeeId: bindingEmployee.id });
      await apiClient.post('/users/staff', {
        username: values.username,
        password: values.password,
        employeeId: bindingEmployee.id,
        status: 'active',
      });
      console.log('[submitCreateUser] API call succeeded');
      messageApi.success('登录账号创建成功');
      setCreateUserModalOpen(false);
      createUserForm.resetFields();
      void load();
      void refreshTabCounts();
    } catch (err: unknown) {
      console.error('[submitCreateUser] Error caught:', err);
      const msg = (err as { message?: string })?.message || '创建失败';
      console.error('[submitCreateUser] Showing error message:', msg);
      messageApi.error(msg);
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

  // 筛选后的数据（仅角色 / 部门；状态已由 tab 控制，避免和后端 status 过滤重叠）
  const filteredItems = items.filter((item) => {
    if (filterRole && item.roleType !== filterRole && item.role !== filterRole) return false;
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
        const role = v || record?.role || 'staff';
        return <Tag color={getRoleTagColor(role)}>{getRoleLabel(role)}</Tag>;
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
            <Tag color="blue">{v}</Tag>
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
      width: 200,
      fixed: 'right',
      render: (_: unknown, record: Employee) => (
        <Space size={4}>
          <Button size="small" onClick={() => startEdit(record)}>编辑</Button>
          {record.userId && (
            <Button size="small" onClick={() => openChangePasswordModal(record)}>
              修改密码
            </Button>
          )}
          {record.status === '在职' && (
            <Button size="small" danger type="text" onClick={() => openDeactivateConfirm(record)}>
              停用
            </Button>
          )}
          {record.status !== '在职' && (
            <Button
              size="small"
              type="text"
              onClick={() => openReactivateConfirm(record)}
            >
              启用
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
          <Typography.Title level={2}>{ADMIN_EMPLOYEE_COPY.pageTitle}</Typography.Title>
          <Typography.Paragraph type="secondary">
            {ADMIN_EMPLOYEE_COPY.pageDescription}
          </Typography.Paragraph>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="搜索姓名、工号、手机"
            onSearch={handleSearch}
            style={{ width: 200 }}
          />
          <Button type="primary" onClick={() => startEdit()}>{ADMIN_EMPLOYEE_COPY.addButton}</Button>
        </Space>
      </div>

      {/* 状态 tab：在职 / 停用 / 离职 三个视角分开查看。
          角标数字来自 refreshTabCounts，独立于当前分页。 */}
      <Card size="small" styles={{ body: { paddingTop: 4, paddingBottom: 4 } }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => handleTabChange(key as EmployeeTabKey)}
          items={[
            { key: 'active', label: `在职运营 (${tabCounts.active})` },
            { key: 'disabled', label: `停用运营 (${tabCounts.disabled})` },
            { key: 'resigned', label: `离职运营 (${tabCounts.resigned})` },
          ]}
        />
      </Card>

      {/* 筛选栏（角色 / 部门）*/}
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
              setFilterDepartment('');
            }}
          >
            重置
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            全部员工：{tabCounts.total} 人
          </Typography.Text>
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

      {/* 新增/编辑运营弹窗 */}
      <Modal
        title={editing ? '编辑运营' : ADMIN_EMPLOYEE_COPY.addButton}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        width={480}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="employeeCode" label="工号">
                <Input placeholder="系统自动生成" disabled />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              {/* 编辑已有运营且未绑定登录账号时，角色不可更改（必须先创建账号） */}
              <Form.Item name="roleType" label="角色">
                <Select
                  options={ROLE_OPTIONS}
                  placeholder="选择角色"
                  disabled={!!editing && !editing.userId}
                />
              </Form.Item>
              {editing && !editing.userId && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -16, marginBottom: 12 }}>
                  该运营暂无登录账号，请先
                  <Button type="link" size="small" style={{ padding: '0 4px' }} onClick={() => { setOpen(false); openCreateUserModal(editing); }}>
                    创建登录账号
                  </Button>
                  后再设置角色
                </Text>
              )}
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="department" label="部门">
                <Input placeholder="请输入部门" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="phone" label="手机号">
                <Input placeholder="请输入手机号" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="status" label="状态">
                <Select options={STATUS_OPTIONS} placeholder="选择状态" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 停用确认弹窗 */}
      <Modal
        title={getEmployeeDialogCopy('deactivate').title}
        open={deactivateModalOpen}
        onCancel={() => setDeactivateModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeactivateModalOpen(false)}>取消</Button>,
          <Button key="confirm" type="primary" danger loading={deactivateLoading} onClick={confirmDeactivate}>
            {getEmployeeDialogCopy('deactivate').confirmText}
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Paragraph>
            即将停用运营：<Text strong>{deactivateEmployee?.name}</Text>
          </Paragraph>
          <Card size="small" type="inner">
            <Paragraph type="warning" style={{ marginBottom: 8 }}>
              停用后将会产生以下影响：
            </Paragraph>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>该运营的登录账号将被停用，无法登录系统</li>
              <li>该运营关联的运营账号将无法正常使用</li>
              <li>该运营负责的客资将变为待分配状态</li>
              <li>该运营关联的订单将需要重新分配跟进人</li>
            </ul>
          </Card>
          <Text type="secondary">{getEmployeeDialogCopy('deactivate').finalHint}</Text>
        </Space>
      </Modal>

      {/* 启用确认弹窗（停用/离职 → 在职） */}
      <Modal
        title="启用运营确认"
        open={reactivateModalOpen}
        onCancel={() => setReactivateModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setReactivateModalOpen(false)}>取消</Button>,
          <Button key="confirm" type="primary" loading={reactivateLoading} onClick={confirmReactivate}>
            确认启用
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Paragraph>
            即将重新启用运营：<Text strong>{reactivateEmployee?.name}</Text>
          </Paragraph>
          <Card size="small" type="inner">
            <Paragraph type="warning" style={{ marginBottom: 8 }}>
              启用后将会产生以下影响：
            </Paragraph>
            <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
              <li>该运营的登录账号将被恢复为 active，可以正常登录系统</li>
              <li>该运营关联的运营账号将重新可用</li>
              <li>历史客资/订单归属保持不变，可在分配时再次启用</li>
            </ul>
          </Card>
          <Text type="secondary">原状态：{reactivateEmployee?.status ?? '-'} → 在职</Text>
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
            为运营 <Text strong>{bindingEmployee?.name}</Text> 绑定已有登录账号
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
            为运营 <Text strong>{bindingEmployee?.name}</Text> 创建新的登录账号
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

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={changePwdModalOpen}
        onCancel={() => { setChangePwdModalOpen(false); setChangePwdResult(null); }}
        onOk={() => changePwdForm.submit()}
        confirmLoading={changePwdLoading}
        destroyOnClose
        width={440}
      >
        {changePwdResult ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
              <Paragraph type="warning" style={{ marginBottom: 0 }}>
                密码修改成功。新密码仅显示一次，请务必复制保存后告知对应运营。关闭后将无法再次查看。
              </Paragraph>
            </Card>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>登录用户名</Text>
              <Input value={changePwdResult.username} readOnly style={{ marginTop: 4 }} />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>新密码</Text>
              <Space.Compact style={{ marginTop: 4, width: '100%' }}>
                <Input value={changePwdResult.newPassword} readOnly style={{ fontFamily: 'monospace', fontWeight: 600, letterSpacing: 1 }} />
                <Button
                  type="primary"
                  onClick={() => {
                    navigator.clipboard.writeText(changePwdResult.newPassword).then(() => {
                      messageApi.success('密码已复制到剪贴板，请发送给对应运营并提醒保存');
                    }).catch(() => {
                      messageApi.error('复制失败，请手动选中后 Ctrl+C 复制');
                    });
                  }}
                >
                  复制密码
                </Button>
              </Space.Compact>
            </div>
          </Space>
        ) : (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Text>
              为运营 <Text strong>{changingPwdEmployee?.name}</Text> 修改登录密码
            </Text>
            <Form
              form={changePwdForm}
              layout="vertical"
              onFinish={submitChangePassword}
              preserve={false}
            >
              <Form.Item
                name="newPassword"
                label="新密码"
                rules={[
                  { required: true, message: '请输入新密码' },
                  {
                    validator: (_, value) => {
                      const result = validatePasswordStrength(value);
                      return result.valid ? Promise.resolve() : Promise.reject(new Error(result.message));
                    },
                  },
                ]}
              >
                <Input.Password placeholder="请输入新密码" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="确认新密码"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请确认新密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('newPassword') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error('两次输入的密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password placeholder="请再次输入新密码" />
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12 }}>
                密码强度要求：8-20 位，不含空格，且至少包含大写字母、小写字母、数字、特殊字符中的两种。
              </Text>
            </Form>
          </Space>
        )}
      </Modal>
    </Space>
  );
}
