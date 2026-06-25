'use client';

import { Button, Card, Descriptions, Empty, Modal, Form, InputNumber, Select, Space, Spin, Table, Tag, Timeline, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { getOrderDetail, listAbnormalFeedbacks, listOrderFollowRecords, addOrderPayment, updateOrder } from '@/shared/api/orders';
import type { OrderAbnormalFeedback, OrderFollowRecord, OrderItem } from '@/shared/types/orders';
import { handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import { formatDateTime } from '@/shared/utils/date-format';

function emptyText(value?: string | null) {
  return value || '-';
}

// 把 enum code 渲染为 tag（中文 + color），与 OrderTable 列表行为保持一致
function statusTag(meta: { label: string; color: string }) {
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

const abnormalTypeLabels: Record<string, string> = {
  client_uncooperative: '客户不配合',
  material_missing: '资料缺失',
  teacher_no_response: '老师无响应',
  cycle_risk: '周期风险',
  payment_issue: '付款异常',
  other: '其它',
};

const expectedHelperLabels: Record<string, string> = {
  sales: '销售',
  supervisor: '主管',
  operation: '运营',
  other: '其它',
};

const intentionLevelLabels: Record<string, string> = {
  high: '高',
  mid: '中',
  low: '低',
  invalid: '无效',
  pending: '待判断',
};

function hasSalesFollowSnapshot(order?: OrderItem) {
  return Boolean(
    order?.clientDegree ||
    order?.clientMajorResearch ||
    order?.clientTimeRequirement ||
    order?.objectionPoint ||
    order?.followAction ||
    order?.requirementNote ||
    order?.intentionLevel ||
    order?.nextFollowAt
  );
}

const abnormalStatusMeta: Record<string, { label: string; color: string }> = {
  open: { label: '待处理', color: 'red' },
  handling: { label: '处理中', color: 'orange' },
  closed: { label: '已关闭', color: 'green' },
};

export default function SalesOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id);
  const [order, setOrder] = useState<OrderItem>();
  const [records, setRecords] = useState<OrderFollowRecord[]>([]);
  const [feedbacks, setFeedbacks] = useState<OrderAbnormalFeedback[]>([]);
  const [loading, setLoading] = useState(false);

  // 录付款弹窗状态
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [editingStageIndex, setEditingStageIndex] = useState<number | null>(null);
  const [maxStageAmount, setMaxStageAmount] = useState<number | null>(null);
  const [paymentForm] = Form.useForm();
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // 修改订单金额弹窗状态
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [amountForm] = Form.useForm();
  const [amountSubmitting, setAmountSubmitting] = useState(false);

  // 分期方案定义
  const STAGE_CONFIG: Record<string, { key: string; name: string; order: number }[]> = {
    three: [
      { key: '定金', name: '定金', order: 0 },
      { key: '中期', name: '中期', order: 1 },
      { key: '尾款', name: '尾款', order: 2 },
    ],
    four: [
      { key: '定金', name: '定金', order: 0 },
      { key: '前期', name: '前期', order: 1 },
      { key: '中期', name: '中期', order: 2 },
      { key: '后期', name: '后期', order: 3 },
    ],
  };

  // 解析分期明细
  const parseStageDetail = (orderItem?: OrderItem): any => {
    if (!orderItem) return null;
    try {
      if ((orderItem as any)?.paymentStageDetail) {
        return JSON.parse((orderItem as any).paymentStageDetail);
      }
    } catch {
      // ignore
    }
    // 兼容旧数据：根据 paymentStage 和 paymentPlan 构造
    const plan = (orderItem as any)?.paymentPlan || 'three';
    const currentStage = orderItem?.paymentStage || '定金';
    const stages = STAGE_CONFIG[plan] || STAGE_CONFIG.three;
    const currentIndex = stages.findIndex(s => s.key === currentStage);
    return {
      plan,
      stages: stages.map((s, i) => ({
        name: s.name,
        label: s.key,
        amount: i === 0 ? (orderItem?.clientPaid || '0') : '0',
        paidAt: i === 0 ? (orderItem?.createdAt || null) : null,
      })),
      currentStageIndex: currentIndex >= 0 ? currentIndex : 0,
    };
  };

  const openPaymentModal = (stageIndex?: number) => {
    const detail = parseStageDetail(order);
    if (!detail) return;
    const targetIndex = stageIndex ?? detail.currentStageIndex + 1;
    const targetStage = detail.stages[targetIndex];
    if (!targetStage) return;

    // 计算最大可填金额：订单金额 - 其他阶段之和
    const orderAmountNum = Number(order?.amount ?? 0);
    if (orderAmountNum > 0) {
      const otherStagesSum = detail.stages.reduce(
        (sum: number, stage: any, i: number) => (i === targetIndex ? sum : sum + Number(stage.amount ?? 0)),
        0,
      );
      const max = Math.max(0, orderAmountNum - otherStagesSum);
      setMaxStageAmount(max);
    } else {
      setMaxStageAmount(null);
    }

    setEditingStageIndex(targetIndex);
    paymentForm.setFieldsValue({
      paymentStage: targetStage.label,
      amount: Number(targetStage.amount) > 0 ? Number(targetStage.amount) : undefined,
      paidAt: targetStage.paidAt
        ? dayjs(targetStage.paidAt).format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD'),
    });
    setPaymentModalOpen(true);
  };

  const submitPayment = async (values: { paymentStage: string; amount: number; paidAt: string }) => {
    setPaymentSubmitting(true);
    try {
      await addOrderPayment(orderId, {
        paymentStage: values.paymentStage,
        amount: values.amount,
        paidAt: values.paidAt,
      });
      message.success('付款记录已更新');
      setPaymentModalOpen(false);
      setEditingStageIndex(null);
      paymentForm.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新付款记录失败');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const openAmountModal = () => {
    amountForm.setFieldsValue({
      amount: Number(order?.amount) > 0 ? Number(order?.amount) : undefined,
    });
    setAmountModalOpen(true);
  };

  const submitAmount = async (values: { amount: number }) => {
    setAmountSubmitting(true);
    try {
      await updateOrder(orderId, { amount: values.amount });
      message.success('订单金额已更新');
      setAmountModalOpen(false);
      amountForm.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新订单金额失败');
    } finally {
      setAmountSubmitting(false);
    }
  };

  async function loadDetail() {
    setLoading(true);
    try {
      const [detail, followRecords, abnormalList] = await Promise.all([
        getOrderDetail(orderId),
        listOrderFollowRecords(orderId),
        listAbnormalFeedbacks(orderId).catch(() => [] as OrderAbnormalFeedback[]),
      ]);
      setOrder(detail);
      setRecords(followRecords);
      setFeedbacks(Array.isArray(abnormalList) ? abnormalList : []);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单详情加载失败');
      setOrder(undefined);
      setRecords([]);
      setFeedbacks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>订单详情</Typography.Title>
          <Typography.Paragraph type="secondary">查看订单履约状态、教务跟进时间线与异常反馈。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => router.push('/sales/orders')}>返回列表</Button>
          <Button onClick={loadDetail} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Spin spinning={loading}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card>
            <Descriptions
              bordered
              column={{ xs: 1, md: 2 }}
              items={[
                { key: 'orderCode', label: '订单编号', children: order?.orderCode || orderId },
                { key: 'leadId', label: '客资 ID', children: emptyText(order?.leadId) },
                { key: 'serviceType', label: '服务类型', children: emptyText(order?.serviceType) },
                { key: 'amount', label: '金额', children: (
                  <Space>
                    {emptyText(order?.amount)}
                    <Button type="link" size="small" onClick={openAmountModal}>修改</Button>
                  </Space>
                ) },
                { key: 'paidStatus', label: '付款状态', children: statusTag(paidStatusMeta(order?.paidStatus)) },
                { key: 'orderStatus', label: '订单状态', children: statusTag(orderStatusMeta(order?.orderStatus)) },
                { key: 'sales', label: '销售', children: emptyText(order?.salesName ?? order?.salesUserId) },
                { key: 'academic', label: '教务', children: emptyText(order?.academicName ?? order?.academicUserId) },
                { key: 'createdAt', label: '创建时间', children: formatDateTime(order?.createdAt) },
                { key: 'updatedAt', label: '更新时间', children: formatDateTime(order?.updatedAt) },
                { key: 'remark', label: '备注', children: emptyText(order?.remark) },
              ]}
            />
          </Card>

          {/* v1.3 / 付款阶段×付款状态联动：分期进度卡片 */}
          {(() => {
            const detail = parseStageDetail(order);
            if (!detail) return null;
            const totalPaid = detail.stages.reduce((sum: number, s: any) => sum + Number(s.amount), 0);
            const totalAmount = Number(order?.amount ?? 0);
            const isPaid = detail.currentStageIndex === detail.stages.length - 1;

            return (
              <Card title="付款进度">
                <div style={{ display: 'flex', gap: 12 }}>
                  {detail.stages.map((stage: any, index: number) => {
                    const isStagePaid = index <= detail.currentStageIndex;
                    const hasAmount = Number(stage.amount) > 0;
                    return (
                      <div
                        key={stage.label}
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          padding: 16,
                          borderRadius: 8,
                          border: isStagePaid ? '1px solid #b7eb8f' : '1px solid #d9d9d9',
                          background: isStagePaid ? '#f6ffed' : hasAmount ? '#e6f7ff' : '#fafafa',
                          cursor: 'pointer',
                        }}
                        onClick={() => openPaymentModal(index)}
                      >
                        <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                          {isStagePaid ? '✅' : hasAmount ? '💰' : '⭕'} {stage.name}
                        </div>
                        <div style={{ fontSize: 18, color: isStagePaid ? '#52c41a' : hasAmount ? '#1890ff' : '#999' }}>
                          {hasAmount ? `¥${stage.amount}` : '-'}
                        </div>
                        {stage.paidAt && (
                          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                            {dayjs(stage.paidAt).format('MM-DD')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography.Text>
                    累计已付：<Typography.Text strong style={{ color: '#52c41a' }}>¥{totalPaid.toFixed(2)}</Typography.Text>
                    {' / '}
                    待付：<Typography.Text strong style={{ color: '#faad14' }}>¥{Math.max(0, totalAmount - totalPaid).toFixed(2)}</Typography.Text>
                  </Typography.Text>
                  <Space>
                    <Tag color={isPaid ? 'green' : 'orange'}>
                      {isPaid ? '已完结' : '部分付款'}
                    </Tag>
                  </Space>
                </div>
              </Card>
            );
          })()}

          <Card title="销售写跟进信息">
            {hasSalesFollowSnapshot(order) ? (
              <Descriptions
                bordered
                column={{ xs: 1, md: 2 }}
                items={[
                  { key: 'clientDegree', label: '客户学历', children: emptyText(order?.clientDegree) },
                  { key: 'clientMajorResearch', label: '专业 / 研究方向', children: emptyText(order?.clientMajorResearch) },
                  { key: 'clientTimeRequirement', label: '时间要求', children: emptyText(order?.clientTimeRequirement) },
                  { key: 'intentionLevel', label: '意向程度', children: order?.intentionLevel ? (intentionLevelLabels[order.intentionLevel] ?? order.intentionLevel) : '-' },
                  { key: 'objectionPoint', label: '异议点', children: emptyText(order?.objectionPoint) },
                  { key: 'followAction', label: '跟进措施', children: emptyText(order?.followAction) },
                  { key: 'requirementNote', label: '客户需求', children: emptyText(order?.requirementNote) },
                  { key: 'nextFollowAt', label: '下次跟进', children: formatDateTime(order?.nextFollowAt) },
                  { key: 'followActionAt', label: '跟进措施时间', children: formatDateTime(order?.followActionAt) },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无销售写跟进信息" />
            )}
          </Card>

          <Card title="异常反馈">
            {feedbacks.length > 0 ? (
              <Table<OrderAbnormalFeedback>
                rowKey="id"
                dataSource={feedbacks}
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: '异常类型',
                    dataIndex: 'abnormalType',
                    key: 'abnormalType',
                    width: 140,
                    render: (value: string) => abnormalTypeLabels[value] ?? (value || '-'),
                  },
                  {
                    title: '说明',
                    dataIndex: 'description',
                    key: 'description',
                    render: (value?: string | null) => emptyText(value),
                  },
                  {
                    title: '期望协助',
                    dataIndex: 'expectedHelper',
                    key: 'expectedHelper',
                    width: 120,
                    render: (value?: string | null) =>
                      value ? (expectedHelperLabels[value] ?? value) : '-',
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 100,
                    render: (value: string) => {
                      const meta = abnormalStatusMeta[value] ?? { label: value || '未知', color: 'default' };
                      return <Tag color={meta.color}>{meta.label}</Tag>;
                    },
                  },
                  {
                    title: '上报时间',
                    dataIndex: 'createdAt',
                    key: 'createdAt',
                    width: 180,
                    render: (value?: string) => formatDateTime(value),
                  },
                  {
                    title: '关闭时间',
                    dataIndex: 'closedAt',
                    key: 'closedAt',
                    width: 180,
                    render: (value?: string | null) => formatDateTime(value),
                  },
                ]}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无异常反馈" />
            )}
          </Card>

          <Card title="跟进时间线">
            {records.length > 0 ? (
              <Timeline
                items={records.map((record) => ({
                  key: record.id,
                  children: (
                    <Space direction="vertical" size={2}>
                      <Typography.Text strong>{record.nodeType}</Typography.Text>
                      <Typography.Text>{emptyText(record.content)}</Typography.Text>
                      <Typography.Text type="secondary">
                        {formatDateTime(record.createdAt)}
                        {record.nextRemindAt ? ` | 下次提醒：${formatDateTime(record.nextRemindAt)}` : ''}
                      </Typography.Text>
                    </Space>
                  ),
                }))}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无跟进记录" />
            )}
          </Card>
        </Space>
      </Spin>

      {/* 修改订单金额弹窗 */}
      <Modal
        title="修改订单金额"
        open={amountModalOpen}
        onCancel={() => { setAmountModalOpen(false); amountForm.resetFields(); }}
        onOk={() => amountForm.submit()}
        confirmLoading={amountSubmitting}
        destroyOnClose
      >
        <Form form={amountForm} layout="vertical" onFinish={submitAmount}>
          <Form.Item
            name="amount"
            label="订单金额（元）"
            rules={[
              { required: true, message: '请输入订单金额' },
              {
                validator: (_rule, value) => {
                  if (value == null || value === '') return Promise.resolve();
                  if (Number(value) <= 0) {
                    return Promise.reject(new Error('订单金额必须大于 0'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 录付款弹窗 */}
      <Modal
        title="修改付款金额"
        open={paymentModalOpen}
        onCancel={() => { setPaymentModalOpen(false); setEditingStageIndex(null); }}
        onOk={() => paymentForm.submit()}
        confirmLoading={paymentSubmitting}
        destroyOnClose
      >
        <Form form={paymentForm} layout="vertical" onFinish={submitPayment}>
          <Form.Item
            name="paymentStage"
            label="付款阶段"
            rules={[{ required: true, message: '请选择付款阶段' }]}
          >
            <Select disabled options={[]} />
          </Form.Item>
          <Form.Item
            name="amount"
            label={(() => {
              const suffix = maxStageAmount != null ? `（上限 ¥${maxStageAmount.toFixed(2)}）` : '';
              return `付款金额（元）${suffix}`;
            })()}
            rules={[
              { required: true, message: '请输入付款金额' },
              {
                validator: (_rule, value) => {
                  if (maxStageAmount == null) return Promise.resolve();
                  if (value != null && Number(value) > maxStageAmount) {
                    return Promise.reject(new Error(`分期金额之和不能超过订单金额，当前上限 ¥${maxStageAmount.toFixed(2)}`));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item
            name="paidAt"
            label="付款日期"
            initialValue={dayjs().format('YYYY-MM-DD')}
          >
            <input type="date" style={{ width: '100%', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: 6, height: 32 }} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
