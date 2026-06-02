'use client';

import { AuditOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { listOperationLogs, type OperationLog } from '@/shared/api/operation-logs';
import { listAdminEmployees } from '@/shared/api/admin';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import type { AdminEmployee } from '@/shared/types/admin';
import { formatDateTime } from '@/shared/utils/date-format';

/**
 * 操作日志动作枚举（与后端 backend/src/shared/operation-logs.constants.ts 同步）。
 * 历史遗留：'lead_status_update' 来自早期 leads.service 自定义值，保留以便检索历史数据。
 */
const ACTION_OPTIONS: { label: string; value: string }[] = [
  { label: '登录', value: 'login' },
  { label: '登出', value: 'logout' },
  { label: '创建', value: 'create' },
  { label: '更新', value: 'update' },
  { label: '删除', value: 'delete' },
  { label: '停用', value: 'disable' },
  { label: '分配', value: 'assign' },
  { label: '改派', value: 'reassign' },
  { label: '状态变更', value: 'status_change' },
  { label: '客资状态变更（历史）', value: 'lead_status_update' },
  { label: '创建导出', value: 'export_create' },
  { label: '下载导出', value: 'export_download' },
  { label: '查看敏感信息', value: 'view_sensitive' },
  { label: '交接', value: 'handover' },
  { label: '创建异常', value: 'abnormal_create' },
  { label: '关闭异常', value: 'abnormal_close' },
];

const TARGET_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: '用户', value: 'user' },
  { label: '员工', value: 'employee' },
  { label: '账号', value: 'account' },
  { label: '作品', value: 'post' },
  { label: '客资', value: 'lead' },
  { label: '协同任务', value: 'collaboration_task' },
  { label: '订单', value: 'order' },
  { label: '订单跟进', value: 'order_follow_record' },
  { label: '异常反馈', value: 'abnormal_feedback' },
  { label: '导出任务', value: 'export_task' },
  { label: '消息通知', value: 'notification' },
];

const ACTION_LABEL_MAP = new Map(ACTION_OPTIONS.map((item) => [item.value, item.label]));
const TARGET_TYPE_LABEL_MAP = new Map(TARGET_TYPE_OPTIONS.map((item) => [item.value, item.label]));

type Filters = {
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  range: [Dayjs, Dayjs] | null;
};

const EMPTY_FILTERS: Filters = {
  userId: '',
  action: '',
  targetType: '',
  targetId: '',
  range: null,
};

function rangeToBounds(range: [Dayjs, Dayjs] | null): { from?: string; to?: string } {
  if (!range) return {};
  const [start, end] = range;
  if (!start && !end) return {};
  // from 走开始日 00:00:00；to 走结束日 23:59:59，便于按天筛选。
  return {
    from: start ? start.startOf('day').toISOString() : undefined,
    to: end ? end.endOf('day').toISOString() : undefined,
  };
}

export default function OwnerOperationLogsPage() {
  const router = useRouter();
  const [items, setItems] = useState<OperationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [employees, setEmployees] = useState<AdminEmployee[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [roleChecked, setRoleChecked] = useState(false);

  // 角色守卫：仅 owner 可进入本页面。admin / 其他角色直接跳走。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = readAuthenticatedUser();
    if (!user || user.role !== 'owner') {
      router.replace('/');
      return;
    }
    setRoleChecked(true);
  }, [router]);

  // 拉取员工列表用于"操作人"下拉；不阻塞主流程。
  useEffect(() => {
    let cancelled = false;
    setEmployeesLoading(true);
    listAdminEmployees({ page: 1, pageSize: 200, limit: 200 })
      .then((result) => {
        if (!cancelled) setEmployees(result.items);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      })
      .finally(() => {
        if (!cancelled) setEmployeesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 操作人下拉的 userId -> 显示名映射；用户 id 未匹配时回退展示原 id。
  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const employee of employees) {
      if (employee.id) {
        map.set(employee.id, employee.name);
      }
      if (employee.employeeCode) {
        map.set(employee.employeeCode, employee.name);
      }
    }
    return map;
  }, [employees]);

  async function load(
    nextPage = page,
    nextPageSize = pageSize,
    nextFilters: Filters = filters,
  ) {
    setLoading(true);
    setError('');
    try {
      const { from, to } = rangeToBounds(nextFilters.range);
      const result = await listOperationLogs({
        page: nextPage,
        pageSize: nextPageSize,
        userId: nextFilters.userId || undefined,
        action: nextFilters.action || undefined,
        targetType: nextFilters.targetType || undefined,
        targetId: nextFilters.targetId.trim() || undefined,
        from,
        to,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '操作日志加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!roleChecked) return;
    void load(1, 20, EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleChecked]);

  function applyFilters() {
    void load(1, pageSize, filters);
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void load(1, pageSize, EMPTY_FILTERS);
  }

  const columns: ColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: '操作人',
      dataIndex: 'userId',
      width: 140,
      render: (value?: string) => userNameMap.get(value ?? '') || value || '-',
    },
    {
      title: '动作',
      dataIndex: 'action',
      width: 130,
      render: (value?: string) => {
        const label = ACTION_LABEL_MAP.get(value ?? '') ?? value ?? '-';
        const color = value === 'delete' || value === 'disable'
          ? 'red'
          : value === 'login' || value === 'logout'
            ? 'blue'
            : 'default';
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '目标类型',
      dataIndex: 'targetType',
      width: 120,
      render: (value?: string) => TARGET_TYPE_LABEL_MAP.get(value ?? '') ?? value ?? '-',
    },
    {
      title: '目标 ID',
      dataIndex: 'targetId',
      width: 180,
      ellipsis: true,
      render: (value?: string) =>
        value ? (
          <Tooltip title={value}>
            <Typography.Text style={{ fontFamily: 'monospace' }} copyable={{ text: value }}>
              {value}
            </Typography.Text>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 130,
      render: (value?: string | null) => value || '-',
    },
    {
      title: '详情',
      dataIndex: 'detail',
      ellipsis: true,
      render: (value?: string | null) => {
        if (!value) return '-';
        return (
          <Tooltip title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{value}</pre>}>
            <Typography.Text style={{ maxWidth: 360 }} ellipsis={{ tooltip: false }}>
              {value}
            </Typography.Text>
          </Tooltip>
        );
      },
    },
  ];

  if (!roleChecked) {
    return (
      <div className="page-stack" style={{ padding: 24 }}>
        <Spin />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>
          <AuditOutlined /> 操作日志
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          全量审计入口，按操作人 / 动作 / 目标类型 / 时间范围检索；详情列悬浮可查看完整 payload。
        </Typography.Paragraph>
      </div>

      <Card>
        <Space size={12} wrap style={{ marginBottom: 16 }}>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              操作人
            </Typography.Text>
            <Select
              value={filters.userId || undefined}
              allowClear
              showSearch
              loading={employeesLoading}
              placeholder="全部操作人"
              style={{ width: 200 }}
              options={employees.map((employee) => ({
                value: employee.id,
                label: `${employee.name}${employee.employeeCode ? `（${employee.employeeCode}）` : ''}`,
              }))}
              onChange={(value) => setFilters((current) => ({ ...current, userId: value || '' }))}
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              动作
            </Typography.Text>
            <Select
              value={filters.action || undefined}
              allowClear
              placeholder="全部动作"
              style={{ width: 180 }}
              options={ACTION_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, action: value || '' }))}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              目标类型
            </Typography.Text>
            <Select
              value={filters.targetType || undefined}
              allowClear
              placeholder="全部目标类型"
              style={{ width: 180 }}
              options={TARGET_TYPE_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, targetType: value || '' }))}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              目标 ID
            </Typography.Text>
            <input
              value={filters.targetId}
              onChange={(event) => setFilters((current) => ({ ...current, targetId: event.target.value }))}
              placeholder="可选：精确匹配"
              style={{
                width: 200,
                height: 32,
                padding: '4px 11px',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              时间范围
            </Typography.Text>
            <DatePicker.RangePicker
              value={filters.range}
              onChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  range: value && value[0] && value[1] ? [value[0], value[1]] : null,
                }))
              }
              placeholder={['开始日期', '结束日期']}
              style={{ width: 260 }}
              allowEmpty={[false, false]}
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>
                查询
              </Button>
              <Button icon={<ReloadOutlined />} onClick={resetFilters}>
                重置
              </Button>
            </Space>
          </div>
        </Space>

        {error ? (
          <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
        ) : null}

        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          size="middle"
          locale={{ emptyText: <Empty description="暂无操作日志" /> }}
          scroll={{ x: 1100 }}
        />

        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          showTotal={(value) => `共 ${value} 条`}
          onChange={(nextPage, nextSize) => load(nextPage, nextSize)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        注：详情列为 JSON 字符串，鼠标悬浮可查看完整内容。日期范围筛选按"包含开始日 00:00:00
        至结束日 23:59:59"处理。系统时间：{dayjs().format('YYYY-MM-DD HH:mm:ss')}
      </Typography.Text>
    </Space>
  );
}
