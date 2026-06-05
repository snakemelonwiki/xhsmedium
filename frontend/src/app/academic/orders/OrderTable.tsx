'use client';

import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, DatePicker, Input, Modal, Pagination, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import type { Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { listOrders, updateOrder } from '@/shared/api/orders';
import { createExport, downloadExportUrl, getExport, type ExportFilter } from '@/shared/api/exports';
import { readStoredUser } from '@/shared/auth/auth';
import type { OrderItem, OrderScope, OrderStatusCode } from '@/shared/types/orders';
import { HANDOVER_STATUS_OPTIONS, HandoverStatusCode, handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import { formatDateTime } from '@/shared/utils/date-format';

const orderStatusOptions: { label: string; value: OrderStatusCode }[] = [
  { label: '待领取', value: 'to_receive' },
  { label: '进行中', value: 'in_progress' },
  { label: '待客户资料', value: 'awaiting_client_info' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '异常', value: 'abnormal' },
];

// 旧版 paidStatusMeta / orderStatusMeta 内联字典已删除，统一消费 shared/api/enums。
// 选中后 v1.3 P0 修复才能在「销售端订单详情」和「教务端订单详情」一致显示中文。

interface OrderTableProps {
  title: string;
  description: string;
  scope: OrderScope;
  status?: string;
  showStatusFilter?: boolean;
  actionMode: 'academic' | 'abnormal' | 'sales' | 'admin';
  /** 顶部工具栏额外按钮（如异常页的"导出异常记录"） */
  toolbarExtra?: React.ReactNode;
  /** 自定义行操作渲染（用于异常页加"关闭"按钮） */
  renderRowExtra?: (record: OrderItem) => React.ReactNode;
}

// 列表渲染使用集中 helper（v1.3 P0 修复后），避免和 enums.ts 重复维护。
function renderOrderStatus(status: string) {
  const meta = orderStatusMeta(status);
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderPaidStatus(status: string) {
  const meta = paidStatusMeta(status);
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderHandoverStatus(status: string | null | undefined) {
  const meta = handoverStatusMeta(status);
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

export function OrderTable({ title, description, scope, status, showStatusFilter, actionMode, toolbarExtra, renderRowExtra }: OrderTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(status ?? '');
  const [handoverFilter, setHandoverFilter] = useState<HandoverStatusCode | ''>('');
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [assigningOrder, setAssigningOrder] = useState<OrderItem>();
  const [assignAcademicUserId, setAssignAcademicUserId] = useState('');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportRange, setExportRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportPaidStatus, setExportPaidStatus] = useState<string>('');

  async function loadOrders(
    nextPage = page,
    nextPageSize = pageSize,
    nextStatus = statusFilter,
    nextHandover = handoverFilter,
    nextAbnormal = abnormalOnly,
  ) {
    setLoading(true);
    setError('');
    try {
      const result = await listOrders({
        scope,
        page: nextPage,
        pageSize: nextPageSize,
        status: nextStatus || undefined,
        handoverStatus: nextHandover || undefined,
        abnormal: nextAbnormal || undefined,
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

  async function submitExportOrders() {
    setExportSubmitting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const filter: ExportFilter = {
        scope: actionMode === 'academic' || actionMode === 'abnormal' ? 'academic' : (scope || 'all'),
      };
      if (exportStatus) filter.status = exportStatus;
      if (exportPaidStatus) filter.paidStatus = exportPaidStatus;
      if (exportRange) {
        filter.from = exportRange[0].startOf('day').toISOString();
        filter.to = exportRange[1].endOf('day').toISOString();
      }
      const result = await createExport({ exportType: 'orders', filter });

      // 轮询导出状态，最多等待30秒
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const exportTask = await getExport(result.id);
        if (exportTask.status === 'completed') {
          hide();
          window.open(downloadExportUrl(result.id), '_blank');
          message.success('导出成功，文件开始下载');
          setExportModalOpen(false);
          setExportRange(null);
          setExportStatus('');
          setExportPaidStatus('');
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
      router.push('/academic/exports');
    } catch (err) {
      hide();
      message.error(err instanceof Error ? err.message : '导出任务创建失败');
    } finally {
      setExportSubmitting(false);
    }
  }

  useEffect(() => {
    loadOrders(1, pageSize, statusFilter, handoverFilter, abnormalOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, statusFilter, handoverFilter, abnormalOnly]);

  const columns = useMemo<TableColumnsType<OrderItem>>(() => {
    const baseColumns: TableColumnsType<OrderItem> = [
      {
        title: '订单',
        dataIndex: 'id',
        key: 'id',
        width: 180,
        render: (value: string, record) => {
          // 教务端的所有 actionMode（academic / abnormal）跳教务详情，
          // 销售端跳销售详情，admin 也跳销售详情（复用销售端只读视图）。
          const detailHref =
            actionMode === 'academic' || actionMode === 'abnormal'
              ? `/academic/orders/${value}`
              : `/sales/orders/${value}`;
          return (
            <Space direction="vertical" size={0}>
              <a href={detailHref}>
                <Typography.Text strong>{value}</Typography.Text>
              </a>
              <Typography.Text type="secondary">{record.serviceType || '未填写服务类型'}</Typography.Text>
            </Space>
          );
        },
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
        title: '交接',
        dataIndex: 'handoverStatus',
        key: 'handoverStatus',
        render: (value?: string | null) => renderHandoverStatus(value),
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
        render: (value?: string) => formatDateTime(value),
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
            <Space>
              <Button
                loading={updatingId === record.id}
                onClick={() => patchOrder(record.id, { order_status: 'in_progress' }, '已标记为处理中')}
              >
                处理
              </Button>
              {renderRowExtra ? renderRowExtra(record) : null}
            </Space>
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
  }, [actionMode, renderRowExtra, router, updatingId]);

  const displayItems = useMemo(
    () => (abnormalOnly ? items.filter((it) => it.orderStatus === 'abnormal') : items),
    [items, abnormalOnly],
  );

  return (
    <Space direction="vertical" size={16} className="page-stack">
      {title || description ? (
        <div className="toolbar-row">
          <div>
            {title ? <Typography.Title level={2}>{title}</Typography.Title> : null}
            {description ? <Typography.Paragraph type="secondary">{description}</Typography.Paragraph> : null}
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
          <Select
            value={handoverFilter}
            style={{ width: 144 }}
            onChange={(value) => setHandoverFilter(value as HandoverStatusCode | '')}
            options={HANDOVER_STATUS_OPTIONS}
            placeholder="交接状态"
          />
          {actionMode === 'sales' || actionMode === 'academic' ? (
            <Select
              value={abnormalOnly ? 'abnormal' : 'all'}
              style={{ width: 132 }}
              onChange={(value) => setAbnormalOnly(value === 'abnormal')}
              options={[
                { label: '全部订单', value: 'all' },
                { label: '仅含异常', value: 'abnormal' },
              ]}
            />
          ) : null}
          {toolbarExtra}
          <Button icon={<ReloadOutlined />} onClick={() => loadOrders()} loading={loading}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)}>
            导出订单
          </Button>
        </Space>
      </div>
      ) : null}

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        <Table<OrderItem>
          rowKey="id"
          columns={columns}
          dataSource={displayItems}
          loading={loading}
          pagination={false}
          scroll={{ x: 1040 }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(nextPage, nextPageSize) => loadOrders(nextPage, nextPageSize, statusFilter, handoverFilter)}
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

      <Modal
        title="导出订单"
        open={exportModalOpen}
        onCancel={() => {
          if (exportSubmitting) return;
          setExportModalOpen(false);
        }}
        onOk={submitExportOrders}
        confirmLoading={exportSubmitting}
        okText="创建导出"
        destroyOnClose
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            任务创建后会在后台异步生成 CSV，生成完成后会自动下载文件。
          </Typography.Text>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              订单状态
            </Typography.Text>
            <Select
              value={exportStatus}
              allowClear
              placeholder="全部"
              style={{ width: '100%' }}
              onChange={setExportStatus}
              options={[
                { label: '全部', value: '' },
                ...orderStatusOptions.map((o) => ({ label: o.label, value: o.value as string })),
              ]}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              付款状态
            </Typography.Text>
            <Select
              value={exportPaidStatus}
              allowClear
              placeholder="全部"
              style={{ width: '100%' }}
              onChange={setExportPaidStatus}
              options={[
                { label: '全部', value: '' },
                { label: '未付款', value: 'unpaid' },
                { label: '部分付款', value: 'partial' },
                { label: '已付款', value: 'paid' },
              ]}
            />
          </div>
          <div>
            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
              时间范围
            </Typography.Text>
            <DatePicker.RangePicker
              value={exportRange}
              onChange={(range) => setExportRange((range as [Dayjs, Dayjs]) || null)}
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Modal>
    </Space>
  );
}
