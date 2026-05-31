'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Input, Modal, Pagination, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { listOrders, updateOrder } from '@/shared/api/orders';
import { readStoredUser } from '@/shared/auth/auth';
import type { OrderItem, OrderScope, OrderStatusCode } from '@/shared/types/orders';

const orderStatusOptions: { label: string; value: OrderStatusCode }[] = [
  { label: '待领取', value: 'to_receive' },
  { label: '进行中', value: 'in_progress' },
  { label: '待客户资料', value: 'awaiting_client_info' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '异常', value: 'abnormal' },
];

const orderStatusMeta: Record<string, { label: string; color: string }> = {
  to_receive: { label: '待领取', color: 'orange' },
  in_progress: { label: '进行中', color: 'blue' },
  awaiting_client_info: { label: '待客户资料', color: 'gold' },
  awaiting_teacher: { label: '待老师', color: 'purple' },
  to_deliver: { label: '待交付', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  abnormal: { label: '异常', color: 'red' },
};

const paidStatusMeta: Record<string, { label: string; color: string }> = {
  unpaid: { label: '未付款', color: 'default' },
  partial: { label: '部分付款', color: 'gold' },
  paid: { label: '已付款', color: 'green' },
};

interface OrderTableProps {
  title: string;
  description: string;
  scope: OrderScope;
  status?: string;
  showStatusFilter?: boolean;
  actionMode: 'academic' | 'abnormal' | 'sales' | 'admin';
}

function renderOrderStatus(status: string) {
  const meta = orderStatusMeta[status] ?? { label: status || '未知', color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderPaidStatus(status: string) {
  const meta = paidStatusMeta[status] ?? { label: status || '未知', color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function displayUser(name?: string, id?: string | null) {
  if (name) return name;
  if (id) return id;
  return '未分配';
}

function getCurrentAcademicUserId() {
  const user = readStoredUser();
  return user?.id || user?.employeeId || '';
}

export function OrderTable({ title, description, scope, status, showStatusFilter, actionMode }: OrderTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(status ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [assigningOrder, setAssigningOrder] = useState<OrderItem>();
  const [assignAcademicUserId, setAssignAcademicUserId] = useState('');

  async function loadOrders(nextPage = page, nextPageSize = pageSize, nextStatus = statusFilter) {
    setLoading(true);
    setError('');
    try {
      const result = await listOrders({
        scope,
        page: nextPage,
        pageSize: nextPageSize,
        status: nextStatus || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '订单列表加载失败';
      setError(text);
      setItems([]);
      setTotal(0);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  async function patchOrder(id: string, body: Record<string, unknown>, successText: string) {
    setUpdatingId(id);
    try {
      await updateOrder(id, body);
      message.success(successText);
      await loadOrders();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单更新失败');
    } finally {
      setUpdatingId('');
    }
  }

  async function claimOrder(id: string) {
    const academicUserId = getCurrentAcademicUserId();
    if (!academicUserId) {
      message.error('未读取到当前教务身份，请重新登录后再领取');
      return;
    }
    await patchOrder(id, { academic_user_id: academicUserId, order_status: 'in_progress' }, '订单已领取');
  }

  function openAssignModal(order: OrderItem) {
    setAssigningOrder(order);
    setAssignAcademicUserId(order.academicUserId ?? '');
  }

  async function submitAssignAcademic() {
    const academicUserId = assignAcademicUserId.trim();
    if (!assigningOrder) return;
    if (!academicUserId) {
      message.error('请输入教务用户 ID');
      return;
    }
    await patchOrder(assigningOrder.id, { academic_user_id: academicUserId }, '教务已分配');
    setAssigningOrder(undefined);
    setAssignAcademicUserId('');
  }

  useEffect(() => {
    loadOrders(1, pageSize, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, statusFilter]);

  const columns = useMemo<TableColumnsType<OrderItem>>(() => {
    const baseColumns: TableColumnsType<OrderItem> = [
      {
        title: '订单',
        dataIndex: 'id',
        key: 'id',
        width: 180,
        render: (value: string, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong copyable>{value}</Typography.Text>
            <Typography.Text type="secondary">{record.serviceType || '未填写服务类型'}</Typography.Text>
          </Space>
        ),
      },
      {
        title: '销售',
        dataIndex: 'salesUserId',
        key: 'salesUserId',
        render: (_value, record) => displayUser(record.salesName, record.salesUserId),
      },
      {
        title: '教务',
        dataIndex: 'academicUserId',
        key: 'academicUserId',
        render: (_value, record) => displayUser(record.academicName, record.academicUserId),
      },
      {
        title: '状态',
        dataIndex: 'orderStatus',
        key: 'orderStatus',
        render: renderOrderStatus,
      },
      {
        title: '付款状态',
        dataIndex: 'paidStatus',
        key: 'paidStatus',
        render: renderPaidStatus,
      },
      {
        title: '金额',
        dataIndex: 'amount',
        key: 'amount',
        render: (value?: string | null) => value || '-',
      },
      {
        title: '更新时间',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        render: (value?: string) => (value ? new Date(value).toLocaleString() : '-'),
      },
    ];

    baseColumns.push({
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: actionMode === 'admin' ? 150 : 210,
      render: (_value, record) => {
        if (actionMode === 'admin') {
          return (
            <Button loading={updatingId === record.id} onClick={() => openAssignModal(record)}>
              分配教务
            </Button>
          );
        }
        if (actionMode === 'sales') {
          return <Button onClick={() => router.push(`/sales/orders/${record.id}`)}>查看</Button>;
        }
        if (actionMode === 'abnormal') {
          return (
            <Button
              loading={updatingId === record.id}
              onClick={() => patchOrder(record.id, { order_status: 'in_progress' }, '已标记为处理中')}
            >
              处理
            </Button>
          );
        }
        return (
          <Space>
            <Button loading={updatingId === record.id} onClick={() => claimOrder(record.id)}>
              领取
            </Button>
            <Select
              value={record.orderStatus}
              options={orderStatusOptions}
              style={{ width: 132 }}
              onChange={(nextStatus) => patchOrder(record.id, { order_status: nextStatus }, '订单状态已更新')}
              disabled={updatingId === record.id}
            />
          </Space>
        );
      },
    });

    return baseColumns;
  }, [actionMode, router, updatingId]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>{title}</Typography.Title>
          <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
        </div>
        <Space wrap>
          {showStatusFilter ? (
            <Select
              value={statusFilter}
              style={{ width: 168 }}
              onChange={setStatusFilter}
              options={[
                { label: '全部状态', value: '' },
                ...orderStatusOptions,
              ]}
            />
          ) : null}
          <Button icon={<ReloadOutlined />} onClick={() => loadOrders()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        <Table<OrderItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          scroll={{ x: 1040 }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(nextPage, nextPageSize) => loadOrders(nextPage, nextPageSize, statusFilter)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>

      <Modal
        title="分配教务"
        open={Boolean(assigningOrder)}
        onOk={submitAssignAcademic}
        onCancel={() => setAssigningOrder(undefined)}
        confirmLoading={Boolean(assigningOrder && updatingId === assigningOrder.id)}
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">订单 {assigningOrder?.id}</Typography.Text>
          <Input
            value={assignAcademicUserId}
            onChange={(event) => setAssignAcademicUserId(event.target.value)}
            placeholder="请输入 academic_user_id"
            allowClear
          />
        </Space>
      </Modal>
    </Space>
  );
}
