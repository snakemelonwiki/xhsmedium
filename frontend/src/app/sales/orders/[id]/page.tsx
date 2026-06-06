'use client';

import { Button, Card, Descriptions, Empty, Space, Spin, Table, Tag, Timeline, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { getOrderDetail, listAbnormalFeedbacks, listOrderFollowRecords } from '@/shared/api/orders';
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
                { key: 'id', label: '订单 ID', children: orderId },
                { key: 'leadId', label: '客资 ID', children: emptyText(order?.leadId) },
                { key: 'serviceType', label: '服务类型', children: emptyText(order?.serviceType) },
                { key: 'amount', label: '金额', children: emptyText(order?.amount) },
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
    </Space>
  );
}
