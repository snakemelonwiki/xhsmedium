'use client';

import { DownloadOutlined, FilterOutlined, PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Drawer, Form, Input, InputNumber, Modal, Pagination, Popconfirm, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { TableColumnsType } from 'antd';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createAcademicOrder, createOrderFollowRecord, listOrders, remindSalesPayment, type AcademicCreateOrderPayload, updateOrder, deleteOrder } from '@/shared/api/orders';
import { updateLeadDealStatus } from '@/shared/api/leads';
import { createExport, downloadExportUrl, getExport, type ExportFilter } from '@/shared/api/exports';
import { readStoredUser } from '@/shared/auth/auth';
import type { OrderItem, OrderScope, OrderStatusCode } from '@/shared/types/orders';
import { HANDOVER_STATUS_OPTIONS, HandoverStatusCode, handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import { formatDateTime } from '@/shared/utils/date-format';
import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';

const dealStatusOptions = [
  { label: '未成交', value: 'not_deal' },
  { label: '待成交', value: 'deal_pending' },
  { label: '已成交', value: 'deal_done' },
  { label: '已退款', value: 'refunded' },
  { label: '无效', value: 'invalid' },
];

const dealStatusMeta: Record<string, { label: string; color: string }> = {
  not_deal: { label: '未成交', color: 'default' },
  deal_pending: { label: '待成交', color: 'orange' },
  deal_done: { label: '已成交', color: 'green' },
  refunded: { label: '已退款', color: 'magenta' },
  invalid: { label: '无效', color: 'red' },
};

const orderStatusOptions: { label: string; value: OrderStatusCode }[] = [
  { label: '待领取', value: 'to_receive' },
  { label: '进行中', value: 'in_progress' },
  { label: '待客户资料', value: 'awaiting_client_info' },
  { label: '待老师', value: 'awaiting_teacher' },
  { label: '待交付', value: 'to_deliver' },
  { label: '已完成', value: 'completed' },
  { label: '异常', value: 'abnormal' },
];

const serviceTypeOptions = [
  { label: '辅导', value: '辅导' },
  { label: '全流程', value: '全流程' },
  { label: '润色', value: '润色' },
  { label: '返修', value: '返修' },
  { label: '代投', value: '代投' },
];

const productTypeOptions = [
  { label: '专利', value: '专利' },
  { label: '期刊论文', value: '期刊论文' },
  { label: '硕士毕业论文', value: '硕士毕业论文' },
  { label: '博士毕业论文', value: '博士毕业论文' },
  { label: '基金', value: '基金' },
  { label: 'EI 会议', value: 'EI会议' },
  { label: '普刊', value: '普刊' },
  { label: '国际会议', value: '国际会议' },
];

const guaranteeTypeOptions = [
  { label: '保录', value: '保录' },
  { label: '保盲审', value: '保盲审' },
  { label: '不保', value: '不保' },
];

const paymentStageOptions = [
  { label: '定金', value: '定金' },
  { label: '中期', value: '中期' },
  { label: '尾款', value: '尾款' },
  { label: '全款', value: '全款' },
];

type AcademicOrderFormValues = AcademicCreateOrderPayload;

// 旧版 paidStatusMeta / orderStatusMeta 内联字典已删除，统一消费 shared/api/enums。
// 选中后 v1.3 P0 修复才能在「销售端订单详情」和「教务端订单详情」一致显示中文。

interface OrderTableProps {
  title: string;
  description: string;
  scope: OrderScope;
  status?: string;
  showStatusFilter?: boolean;
  actionMode: 'academic' | 'abnormal' | 'sales' | 'admin';
  listMode?: 'default' | 'claimPool' | 'followup';
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

function renderDealStatus(status?: string | null) {
  const code = status || 'not_deal';
  const meta = dealStatusMeta[code] || { label: code, color: 'default' };
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

export function OrderTable({
  title,
  description,
  scope,
  status,
  showStatusFilter,
  actionMode,
  listMode = 'default',
  toolbarExtra,
  renderRowExtra,
}: OrderTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(searchParams?.get('status') || status || '');
  const [handoverFilter, setHandoverFilter] = useState<HandoverStatusCode | ''>('');
  const [abnormalOnly, setAbnormalOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const [remindingId, setRemindingId] = useState('');
  const [assigningOrder, setAssigningOrder] = useState<OrderItem>();
  const [assignAcademicUserId, setAssignAcademicUserId] = useState('');
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderSubmitting, setCreateOrderSubmitting] = useState(false);
  const [createOrderForm] = Form.useForm<AcademicOrderFormValues>();
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportRange, setExportRange] = useState<DateRangeValue>(null);
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportPaidStatus, setExportPaidStatus] = useState<string>('');
  const isClaimPool = listMode === 'claimPool';
  const isFollowup = listMode === 'followup';

  const exportingRef = useRef(false);

  const { isMobile } = useResponsiveBreakpoint();
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

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
      const queryScope = isClaimPool ? 'pool' : (isFollowup && scope !== 'all') ? 'assigned' : scope;
      const queryStatus = isClaimPool ? 'to_receive' : nextStatus || undefined;
      const queryHandover = isClaimPool ? 'handed_over' : nextHandover || undefined;
      const result = await listOrders({
        scope: queryScope,
        page: nextPage,
        pageSize: nextPageSize,
        status: queryStatus,
        handoverStatus: queryHandover,
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

  async function patchDealStatus(order: OrderItem, dealStatus: string, successText: string) {
    if (!order.leadId) {
      message.error('订单缺少关联客资，无法更新成交状态');
      return;
    }
    setUpdatingId(order.id);
    try {
      await updateLeadDealStatus(String(order.leadId), { dealStatus: dealStatus as any });
      message.success(successText);
      await loadOrders();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '成交状态更新失败');
    } finally {
      setUpdatingId('');
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
    setUpdatingId(id);
    try {
      await createOrderFollowRecord(id, { nodeType: '已接收', content: '教务领取订单' });
      // 领取后显式把订单状态改为进行中，确保列表刷新后不再显示为待领取
      await updateOrder(id, { order_status: 'in_progress' });
      message.success('订单已领取');
      await loadOrders();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单领取失败');
    } finally {
      setUpdatingId('');
    }
  }

  async function remindPayment(orderId: string) {
    setRemindingId(orderId);
    try {
      await remindSalesPayment(orderId);
      message.success('已提醒销售催款');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提醒失败');
    } finally {
      setRemindingId('');
    }
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

  async function submitCreateOrder() {
    if (createOrderSubmitting) return;
    const values = await createOrderForm.validateFields().catch(() => null);
    if (!values) return;
    setCreateOrderSubmitting(true);
    try {
      const result = await createAcademicOrder({
        serviceType: values.serviceType || null,
        productType: values.productType || null,
        guaranteeType: values.guaranteeType || null,
        amount: values.amount != null ? values.amount : null,
        paidStatus: values.paidStatus || null,
        paymentStage: values.paymentStage || null,
        clientPaid: values.clientPaid != null ? values.clientPaid : null,
        customerName: values.customerName || null,
        educationLevel: values.educationLevel || null,
        major: values.major || null,
        area: values.area || null,
        articlePurpose: values.articlePurpose || null,
        salesContact: values.salesContact || null,
        deliveryRequirement: values.deliveryRequirement || null,
        remark: values.remark || null,
      });
      message.success(`订单创建成功，编号：${result.orderCode || result.orderId}`);
      setCreateOrderOpen(false);
      createOrderForm.resetFields();
      await loadOrders();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '创建订单失败');
    } finally {
      setCreateOrderSubmitting(false);
    }
  }

  async function submitExportOrders() {
    if (exportSubmitting) return;
    setExportSubmitting(true);
    exportingRef.current = true;
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const filter: ExportFilter = {
        scope: actionMode === 'academic' || actionMode === 'abnormal' ? 'academic' : scope === 'assigned' ? 'mine' : (scope || 'all'),
      };
      if (exportStatus) filter.status = exportStatus;
      if (exportPaidStatus) filter.paidStatus = exportPaidStatus;
      if (exportRange) {
        filter.from = exportRange.start.startOf('day').toISOString();
        filter.to = exportRange.end.endOf('day').toISOString();
      }
      const result = await createExport({ exportType: 'orders', filter });

      // 轮询导出状态，最多等待30秒
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts && exportingRef.current) {
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
      exportingRef.current = false;
    }
  }

  useEffect(() => {
    loadOrders(1, pageSize, statusFilter, handoverFilter, abnormalOnly);
  }, [scope, statusFilter, handoverFilter, abnormalOnly, pageSize]);

  useEffect(() => {
    return () => {
      exportingRef.current = false;
    };
  }, []);

  // 履约进度阶段名称映射（paperProgress 值 → 步骤标题）
  const PROGRESS_STEP_LABEL: Record<string, string> = {
    '销售建单': '初始', '待补资料': '初始', '待教务审核': '初始', '待补客户资料': '初始',
    '待分配老师': '分配老师', '老师已接单': '分配老师', 'awaiting_teacher': '分配老师',
    '写作中': '写作审核',
    '待投稿': '投稿准备',
    '已投稿': '投稿后', '审稿中': '投稿后', '返修中': '投稿后',
    '已录用': '投稿后', '待见刊': '投稿后', '已完成': '投稿后', '异常处理中': '投稿后',
  };

  const columns = useMemo<TableColumnsType<OrderItem>>(() => {
    const baseColumns: TableColumnsType<OrderItem> = [
      {
        title: '订单编号',
        dataIndex: 'orderCode',
        key: 'orderCode',
        width: 200,
        render: (value: string | null | undefined, record) => {
          const displayCode = value || record.id;
          // 教务端的所有 actionMode（academic / abnormal）跳教务详情，
          // 销售端跳销售详情，admin 也跳销售详情（复用销售端只读视图）。
          const detailHref =
            actionMode === 'academic' || actionMode === 'abnormal'
              ? `/academic/orders/${record.id}`
              : `/sales/orders/${record.id}`;
          return (
            <Space direction="vertical" size={0}>
              <a href={detailHref}>
                <Typography.Text strong>{displayCode}</Typography.Text>
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
      // v1.3 / Task 12: 跟进列表新增「稿件进度」「投稿进度」两列。
      // 稿件进度 = 履约进度的阶段名称（由教务端 Steps onClick 写回 paper_progress 后映射）。
      // 投稿进度 = 期刊与交付状态的阶段名称（由教务端 Steps onClick 写回 current_stage 后映射）。
      // 仅在教务端（academic / abnormal actionMode）展示，销售/admin 视角无意义。
      ...(actionMode === 'academic' || actionMode === 'abnormal' ? [
        {
          title: '稿件进度',
          key: 'paperProgress',
          dataIndex: 'paperProgress',
          width: 110,
          render: (value?: string | null) => {
            const label = value ? PROGRESS_STEP_LABEL[value] || value : '-';
            return label !== '-' ? <Tag color="blue">{label}</Tag> : <Typography.Text type="secondary">-</Typography.Text>;
          },
        },
        {
          title: '投稿进度',
          key: 'submissionProgress',
          dataIndex: 'currentStage',
          width: 240,
          render: (value?: string | null) => {
            const label = value || '-';
            return label !== '-' ? <Tag color="geekblue">{label}</Tag> : <Typography.Text type="secondary">-</Typography.Text>;
          },
        },
      ] as any[] : []),
      ...(actionMode === 'academic' ? [] : [
        {
          title: '交接',
          dataIndex: 'handoverStatus',
          key: 'handoverStatus',
          render: (value?: string | null) => renderHandoverStatus(value),
        },
      ] as any[]),
      {
        title: '付款状态',
        dataIndex: 'paidStatus',
        key: 'paidStatus',
        render: renderPaidStatus,
      },
      // 教务端订单列表不显示金额列
      ...(actionMode === 'academic' ? [] : [
        {
          title: '金额',
          dataIndex: 'amount',
          key: 'amount',
          render: (value?: string | null) => value || '-',
        },
      ] as any[]),
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
      width: actionMode === 'sales' ? 320 : (actionMode === 'admin' ? 150 : 290),
      render: (_value, record) => {
        if (actionMode === 'admin') {
          return (
            <Space size={4} wrap>
              <Button loading={updatingId === record.id} onClick={() => openAssignModal(record)}>
                分配教务
              </Button>
              <Popconfirm
                title="确定删除该订单？"
                description="删除后不可恢复。"
                okText="删除"
                cancelText="取消"
                onConfirm={async () => {
                  try {
                    await deleteOrder(record.id);
                    message.success('订单已删除');
                    loadOrders();
                  } catch (err) {
                    message.error(err instanceof Error ? err.message : '删除失败');
                  }
                }}
              >
                <Button danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          );
        }
        if (actionMode === 'sales') {
          return (
            <Space size={4} wrap>
              <Button onClick={() => router.push(`/sales/orders/${record.id}`)}>查看</Button>
            </Space>
          );
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
        if (isFollowup) {
          return (
            <Space>
              <Button onClick={() => router.push(`/academic/orders/${record.id}`)}>
                查看
              </Button>
              <Button loading={remindingId === record.id} onClick={() => remindPayment(record.id)}>
                提醒销售催款
              </Button>
            </Space>
          );
        }
        return (
          <Space>
            <Button loading={updatingId === record.id} onClick={() => claimOrder(record.id)}>
              领取
            </Button>
            {isClaimPool ? null : (
              <Select
                value={record.orderStatus}
                options={orderStatusOptions}
                style={{ width: 132 }}
                onChange={(nextStatus) => patchOrder(record.id, { order_status: nextStatus }, '订单状态已更新')}
                disabled={updatingId === record.id}
              />
            )}
          </Space>
        );
      },
    });

    return baseColumns;
  }, [actionMode, isClaimPool, isFollowup, renderRowExtra, router, updatingId]);

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
          {!isMobile && showStatusFilter && !isClaimPool ? (
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
          {!isMobile && !isClaimPool && !isFollowup && actionMode !== 'academic' ? (
            <Select
              value={handoverFilter}
              style={{ width: 144 }}
              onChange={(value) => setHandoverFilter(value as HandoverStatusCode | '')}
              options={HANDOVER_STATUS_OPTIONS}
              placeholder="交接状态"
            />
          ) : null}
          {!isMobile && (actionMode === 'sales' || actionMode === 'academic') ? (
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
          {isMobile && (showStatusFilter || (!isClaimPool && !isFollowup && actionMode !== 'academic') || (actionMode === 'sales' || actionMode === 'academic')) ? (
            <Button icon={<FilterOutlined />} onClick={() => setFilterDrawerOpen(true)}>
              筛选
            </Button>
          ) : null}
          {toolbarExtra}
          {(actionMode === 'academic' || actionMode === 'abnormal') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOrderOpen(true)}>
              新建订单
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => loadOrders()} loading={loading}>
            刷新
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => setExportModalOpen(true)}>
            导出订单
          </Button>
        </Space>
      </div>
      ) : null}

      {/* Mobile filter drawer */}
      {isMobile && (
        <Drawer
          title="筛选条件"
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          placement="bottom"
          height="auto"
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {showStatusFilter && !isClaimPool ? (
              <Select
                value={statusFilter}
                style={{ width: '100%' }}
                onChange={setStatusFilter}
                options={[
                  { label: '全部状态', value: '' },
                  ...orderStatusOptions,
                ]}
              />
            ) : null}
            {!isClaimPool && !isFollowup && actionMode !== 'academic' ? (
              <Select
                value={handoverFilter}
                style={{ width: '100%' }}
                onChange={(value) => setHandoverFilter(value as HandoverStatusCode | '')}
                options={HANDOVER_STATUS_OPTIONS}
                placeholder="交接状态"
              />
            ) : null}
            {actionMode === 'sales' || actionMode === 'academic' ? (
              <Select
                value={abnormalOnly ? 'abnormal' : 'all'}
                style={{ width: '100%' }}
                onChange={(value) => setAbnormalOnly(value === 'abnormal')}
                options={[
                  { label: '全部订单', value: 'all' },
                  { label: '仅含异常', value: 'abnormal' },
                ]}
              />
            ) : null}
          </Space>
        </Drawer>
      )}

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Card>
        <Table<OrderItem>
          rowKey="id"
          columns={columns}
          dataSource={displayItems}
          loading={loading}
          pagination={false}
          // v1.3 / Task 12: 加了稿件进度(110)+ 投稿进度(240) 两列，horizontal scroll 阈值从 1040 提到 1440。
          scroll={{ x: 1440 }}
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
            <QuickRangePicker
              value={exportRange}
              onChange={setExportRange}
              style={{ width: '100%' }}
              pickerProps={{ style: { width: '100%' } }}
            />
          </div>
        </Space>
      </Modal>

      {/* 教务端新建订单 */}
      <Modal
        title="新建订单"
        open={createOrderOpen}
        maskClosable={false}
        onCancel={() => {
          const values = createOrderForm.getFieldsValue();
          const hasValues = Object.values(values).some((v) => v !== undefined && v !== null && v !== '');
          if (hasValues) {
            Modal.confirm({
              title: '确认关闭',
              content: '已填写的内容将不会保存，确定关闭吗？',
              onOk: () => {
                setCreateOrderOpen(false);
                createOrderForm.resetFields();
              },
            });
          } else {
            setCreateOrderOpen(false);
            createOrderForm.resetFields();
          }
        }}
        onOk={submitCreateOrder}
        confirmLoading={createOrderSubmitting}
        width={720}
        destroyOnClose
        okText="创建订单"
      >
        <Form form={createOrderForm} layout="vertical" preserve={false}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>客户信息</Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="customerName" label="客户姓名">
              <Input placeholder="如：张三" />
            </Form.Item>
            <Form.Item name="educationLevel" label="学历">
              <Select
                allowClear
                placeholder="选择学历"
                options={[
                  { label: '专科', value: '专科' },
                  { label: '本科', value: '本科' },
                  { label: '硕士', value: '硕士' },
                  { label: '博士', value: '博士' },
                  { label: '职称', value: '职称' },
                ]}
              />
            </Form.Item>
            <Form.Item name="major" label="专业方向">
              <Input placeholder="如：计算机科学与技术" />
            </Form.Item>
            <Form.Item name="area" label="地区">
              <Input placeholder="如：北京" />
            </Form.Item>
            <Form.Item name="articlePurpose" label="用途" className="full-row">
              <Input placeholder="如：毕业、评职称、申博" />
            </Form.Item>
          </div>

          <Typography.Title level={5}>订单信息</Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="serviceType" label="服务类型">
              <Select allowClear placeholder="选择服务类型" options={serviceTypeOptions} />
            </Form.Item>
            <Form.Item name="productType" label="产品类型">
              <Select allowClear placeholder="选择产品类型" options={productTypeOptions} />
            </Form.Item>
            <Form.Item name="guaranteeType" label="保障类型">
              <Select allowClear placeholder="选择保障类型" options={guaranteeTypeOptions} />
            </Form.Item>
          </div>

          <Typography.Title level={5}>
            付款信息
            <Typography.Text type="danger" style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>* 必填</Typography.Text>
          </Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="amount"
              label="订单金额"
              rules={[{ required: true, message: '请输入订单金额' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" prefix="¥" />
            </Form.Item>
            <Form.Item
              name="clientPaid"
              label="客户已付金额"
              rules={[{ required: true, message: '请输入客户已付金额' }]}
            >
              <InputNumber style={{ width: '100%' }} min={0} precision={2} placeholder="0.00" prefix="¥" />
            </Form.Item>
            <Form.Item
              name="paidStatus"
              label="付款状态"
              rules={[{ required: true, message: '请选择付款状态' }]}
            >
              <Select
                placeholder="选择付款状态"
                options={[
                  { label: '已付定金', value: 'partial' },
                  { label: '全款', value: 'paid' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="paymentStage"
              label="付款阶段"
              rules={[{ required: true, message: '请选择付款阶段' }]}
            >
              <Select placeholder="选择付款阶段" options={paymentStageOptions} />
            </Form.Item>
          </div>

          <Typography.Title level={5}>其他信息</Typography.Title>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="salesContact" label="销售联系方式">
              <Input placeholder="如：微信号/手机号" />
            </Form.Item>
            <Form.Item name="deliveryRequirement" label="交付要求">
              <Input placeholder="如：1 个月内交付初稿" />
            </Form.Item>
            <Form.Item name="remark" label="备注" className="full-row">
              <Input.TextArea rows={3} placeholder="其他需要说明的信息（如客资来源、特殊要求等）" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </Space>
  );
}
