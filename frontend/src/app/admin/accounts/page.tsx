'use client';

import { ExportOutlined, SwapOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { listAdminAccounts, listAdminEmployees, saveAdminAccount } from '@/shared/api/admin';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import type { AdminAccount, AdminEmployee } from '@/shared/types/admin';

type Account = AdminAccount & {
  recentPostAt?: string;
};

const PLATFORM_OPTIONS = [
  { label: '全部平台', value: '' },
  // 平台筛选项 value 必须与后端 accounts.platform 列实际存储值一致（DB 里历史数据是中文 label），
  // 否则 service.buildWhere 的 { platform: pf } 精确匹配会 0 行。
  { label: '小红书', value: '小红书' },
  { label: '抖音', value: '抖音' },
];

const STATUS_OPTIONS = [
  { label: '正常', value: '正常' },
  { label: '停用', value: '停用' },
  { label: '异常', value: '异常' },
];

function getPlatformLabel(value?: string): string {
  if (value === 'xiaohongshu') return '小红书';
  if (value === 'douyin') return '抖音';
  return value || '-';
}

function getPlatformTagColor(value?: string): string {
  if (value === 'xiaohongshu') return 'red';
  if (value === 'douyin') return 'blue';
  return 'default';
}

function getStatusTagColor(value?: string): string {
  if (value === '正常') return 'green';
  if (value === '停用') return 'red';
  if (value === '异常') return 'orange';
  return 'default';
}

export default function AdminAccountsPage() {
  const searchParams = useSearchParams();
  const pinnedAccountId = searchParams.get('id') ?? '';
  const [items, setItems] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account>();
  const [keyword, setKeyword] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [form] = Form.useForm();

  // 员工列表
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);

  // 筛选状态
  const [filterPlatform, setFilterPlatform] = useState<string>('');
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // 改派弹窗
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignAccount, setReassignAccount] = useState<Account>();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>();
  const [reassignLoading, setReassignLoading] = useState(false);

  // 停用确认弹窗
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [deactivateAccount, setDeactivateAccount] = useState<Account>();
  const [deactivateLoading, setDeactivateLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  async function load(
    page = pagination.current,
    pageSize = pagination.pageSize,
    nextKeyword = keyword,
    nextPlatform = filterPlatform,
    id: string = pinnedAccountId,
  ) {
    setLoading(true);
    try {
      const result = await listAdminAccounts(id
        ? { page, pageSize, id }
        : {
            page,
            pageSize,
            keyword: nextKeyword.trim() || undefined,
            platform: nextPlatform || undefined,
          });
      setItems(result.items as Account[]);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } catch {
      setItems([]);
      setPagination((current) => ({ ...current, total: 0 }));
    } finally {
      setLoading(false);
    }
  }

  // 加载员工列表
  useEffect(() => {
    void listAdminEmployees({ page: 1, pageSize: 200 })
      .then((r) => setEmployees(r.items))
      .catch(() => setEmployees([]));
  }, []);

  // 初始加载
  useEffect(() => {
    if (pinnedAccountId) {
      setKeyword(pinnedAccountId);
      setFilterPlatform('');
      setFilterEmployeeId('');
      setFilterStatus('');
    }
  }, [pinnedAccountId]);

  // 初始加载
  useEffect(() => {
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedAccountId]);

  // 平台筛选变化：服务端过滤，重新拉取（分页重置到第 1 页）
  useEffect(() => {
    if (pinnedAccountId) return;
    void load(1, pagination.pageSize, keyword, filterPlatform);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterPlatform]);

  function startEdit(record?: Account) {
    setEditing(record);
    form.setFieldsValue({
      ...record,
      platform: record?.platform || 'xiaohongshu',
      status: record?.status || '正常',
    });
    setOpen(true);
  }

  async function submit(values: Partial<Account> & { accountName: string }) {
    await saveAdminAccount({ ...editing, ...values } as Parameters<typeof saveAdminAccount>[0]);
    message.success(editing ? '账号信息已更新' : '账号已新增');
    setOpen(false);
    form.resetFields();
    void load();
  }

  function handleSearch(value: string) {
    const nextKeyword = value.trim();
    setKeyword(nextKeyword);
    void load(1, pagination.pageSize, nextKeyword);
  }

  function handleTableChange(next: TablePaginationConfig) {
    void load(next.current ?? 1, next.pageSize ?? 20);
  }

  // 改派
  function openReassign(record: Account) {
    setReassignAccount(record);
    setSelectedEmployeeId(record.employeeId);
    setReassignModalOpen(true);
  }

  async function confirmReassign() {
    if (!reassignAccount || !selectedEmployeeId) {
      message.warning('请选择要改派到的员工');
      return;
    }
    setReassignLoading(true);
    try {
      await saveAdminAccount({
        id: reassignAccount.id,
        employeeId: selectedEmployeeId,
      } as Parameters<typeof saveAdminAccount>[0]);
      message.success('账号已改派');
      setReassignModalOpen(false);
      void load();
    } catch (err: unknown) {
      message.error((err as Error)?.message || '改派失败');
    } finally {
      setReassignLoading(false);
    }
  }

  // 停用
  function openDeactivateConfirm(record: Account) {
    setDeactivateAccount(record);
    setDeactivateModalOpen(true);
  }

  async function confirmDeactivate() {
    if (!deactivateAccount) return;
    setDeactivateLoading(true);
    try {
      await saveAdminAccount({
        id: deactivateAccount.id,
        status: '停用',
      } as Parameters<typeof saveAdminAccount>[0]);
      message.success(`账号"${deactivateAccount.accountName}"已停用`);
      setDeactivateModalOpen(false);
      void load();
    } catch (err: unknown) {
      message.error((err as Error)?.message || '停用失败');
    } finally {
      setDeactivateLoading(false);
    }
  }

  // 导出
  async function handleExport() {
    setExporting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const result = await createExport({ exportType: 'accounts', filter: { scope: 'all' } });
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);
        if (exportTask.status === 'completed') {
          hide();
          window.open(downloadExportUrl(result.id), '_blank');
          message.success('导出成功，文件开始下载');
          return;
        } else if (exportTask.status === 'failed') {
          hide();
          message.error('导出失败，请重试');
          return;
        }
        attempts++;
      }
      hide();
      message.warning('导出超时，请到导出中心查看');
    } catch (err: unknown) {
      hide();
      message.error((err as Error)?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  }

  // 筛选后的数据
  const filteredItems = items.filter((item) => {
    if (filterPlatform && item.platform !== filterPlatform) return false;
    if (filterEmployeeId && item.employeeId !== filterEmployeeId) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    return true;
  });

  const employeeOptions = [
    { label: '全部员工', value: '' },
    ...employees.map((emp) => ({ label: emp.name, value: emp.id })),
  ];

  const columns: TableColumnsType<Account> = [
    {
      title: '账号名',
      dataIndex: 'accountName',
      width: 140,
      render: (v: string) => v || '-',
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 90,
      render: (v?: string) => (
        <Tag color={getPlatformTagColor(v)}>{getPlatformLabel(v)}</Tag>
      ),
    },
    { title: 'UID', dataIndex: 'accountUid', width: 140, render: (v?: string) => v || '-' },
    {
      title: '所属员工',
      dataIndex: 'employeeName',
      width: 100,
      render: (v, record) => {
        if (v) return v;
        const emp = employees.find(e => e.id === record.employeeId);
        return emp?.name || '-';
      },
    },
    { title: '人设', dataIndex: 'persona', width: 120, render: (v) => v || '-' },
    { title: '定位', dataIndex: 'positioning', width: 150, render: (v) => v || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const status = v || '正常';
        return <Tag color={getStatusTagColor(status)}>{status}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_: unknown, record: Account) => (
        <Space size={4}>
          <Button size="small" onClick={() => startEdit(record)}>编辑</Button>
          <Button size="small" icon={<SwapOutlined />} onClick={() => openReassign(record)}>
            改派
          </Button>
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
          <Typography.Title level={2}>主管账号管理</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看全公司运营账号，支持新增、编辑、改派和停用操作。
          </Typography.Paragraph>
        </div>
        <Space>
          <Input.Search
            allowClear
            value={keyword}
            placeholder="搜索账号名、UID、定位（支持账号ID）"
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 220 }}
          />
          <Button icon={<ExportOutlined />} loading={exporting} onClick={handleExport}>
            导出
          </Button>
          <Button type="primary" onClick={() => startEdit()}>新增账号</Button>
        </Space>
      </div>

      {/* 筛选栏 */}
      <Card size="small">
        <Space size={12} wrap>
          <Select
            value={filterPlatform || ''}
            options={PLATFORM_OPTIONS}
            onChange={(v) => setFilterPlatform(v)}
            style={{ width: 120 }}
            placeholder="平台"
          />
          <Select
            value={filterEmployeeId || ''}
            options={employeeOptions}
            onChange={(v) => setFilterEmployeeId(v)}
            style={{ width: 140 }}
            placeholder="员工"
            showSearch
            optionFilterProp="label"
            allowClear
          />
          <Select
            value={filterStatus || ''}
            options={[
              { label: '全部状态', value: '' },
              ...STATUS_OPTIONS,
            ]}
            onChange={(v) => setFilterStatus(v)}
            style={{ width: 120 }}
            placeholder="状态"
          />
          <Button
            onClick={() => {
              setFilterPlatform('');
              setFilterEmployeeId('');
              setFilterStatus('');
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
          rowClassName={(record) => (pinnedAccountId && record.id === pinnedAccountId ? 'ant-table-row-selected' : '')}
          pagination={{ ...pagination, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* 新增/编辑账号弹窗 */}
      <Modal
        title={editing ? '编辑账号' : '新增账号'}
        open={open}
        onCancel={() => { setOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        width={560}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Form.Item
            name="accountName"
            label="账号名"
            rules={[{ required: true, message: '请输入账号名' }]}
          >
            <Input placeholder="请输入账号名" />
          </Form.Item>
          <Form.Item name="platform" label="平台">
            <Select
              options={[
                { label: '小红书', value: 'xiaohongshu' },
                { label: '抖音', value: 'douyin' },
              ]}
              placeholder="选择平台"
            />
          </Form.Item>
          <Form.Item name="accountUid" label="账号 UID">
            <Input placeholder="请输入账号 UID" />
          </Form.Item>
          <Form.Item name="employeeId" label="所属员工">
            <Select
              options={employees.map((emp) => ({ label: emp.name, value: emp.id }))}
              placeholder="选择员工"
              showSearch
              optionFilterProp="label"
              allowClear
            />
          </Form.Item>
          <Form.Item name="persona" label="人设">
            <Input.TextArea placeholder="请输入账号人设描述" rows={2} />
          </Form.Item>
          <Form.Item name="positioning" label="账号定位">
            <Input.TextArea placeholder="请输入账号定位" rows={2} />
          </Form.Item>
          <Form.Item name="postingPlan" label="发帖规划">
            <Input.TextArea placeholder="请输入发帖规划" rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select options={STATUS_OPTIONS} placeholder="选择状态" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 改派弹窗 */}
      <Modal
        title="账号改派"
        open={reassignModalOpen}
        onCancel={() => setReassignModalOpen(false)}
        onOk={confirmReassign}
        confirmLoading={reassignLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            当前账号：<Typography.Text strong>{reassignAccount?.accountName}</Typography.Text>
            <br />
            当前员工：<Typography.Text>{reassignAccount?.employeeName || reassignAccount?.employeeId || '-'}</Typography.Text>
          </div>
          <Select
            showSearch
            placeholder="选择新员工"
            value={selectedEmployeeId}
            onChange={setSelectedEmployeeId}
            options={employees.map((emp) => ({ label: emp.name, value: emp.id }))}
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
          <Alert
            type="info"
            showIcon
            message="历史作品归属说明"
            description={
              <ul style={{ marginBottom: 0, paddingLeft: 16 }}>
                <li>历史作品（包括已发布内容、粉丝数据）归属原员工</li>
                <li>账号切换后，新员工负责后续发帖和运营</li>
                <li>如需转移历史作品数据，请联系管理员</li>
              </ul>
            }
          />
        </Space>
      </Modal>

      {/* 停用确认弹窗 */}
      <Modal
        title="停用账号确认"
        open={deactivateModalOpen}
        onCancel={() => setDeactivateModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setDeactivateModalOpen(false)}>取消</Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            loading={deactivateLoading}
            onClick={confirmDeactivate}
          >
            确认停用
          </Button>,
        ]}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Paragraph>
            即将停用账号：<Typography.Text strong>{deactivateAccount?.accountName}</Typography.Text>
          </Typography.Paragraph>
          <Alert
            type="warning"
            showIcon
            message="停用后将会产生以下影响："
            description={
              <ul style={{ marginBottom: 0, paddingLeft: 16 }}>
                <li>该账号将无法继续发布新内容</li>
                <li>该账号关联的客资来源将标记为"账号已停用"</li>
                <li>历史发布记录和粉丝数据仍然保留</li>
              </ul>
            }
          />
          <Typography.Text type="secondary">如需继续，请点击"确认停用"。</Typography.Text>
        </Space>
      </Modal>
    </Space>
  );
}
