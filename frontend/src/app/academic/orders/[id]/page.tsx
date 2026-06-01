'use client';

import { Button, Card, DatePicker, Descriptions, Empty, Form, Input, Space, Spin, Timeline, Typography, message } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createOrderFollowRecord, getOrderDetail, listOrderFollowRecords } from '@/shared/api/orders';
import type { OrderFollowRecord, OrderItem } from '@/shared/types/orders';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function emptyText(value?: string | null) {
  return value || '-';
}

/**
 * 教务端订单详情 + 进度跟进。
 * - 详情面板复用销售端结构，但 actionable 集中在新增跟进节点
 * - 新增节点表单：nodeType 必填，content 选填，nextRemindAt 选填
 * - 节点类型含"异常"会自动通知销售（后端 ORDER_ABNORMAL 通知）
 */
export default function AcademicOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderId = String(params.id);
  const [order, setOrder] = useState<OrderItem>();
  const [records, setRecords] = useState<OrderFollowRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  async function loadDetail() {
    setLoading(true);
    try {
      const [detail, followRecords] = await Promise.all([
        getOrderDetail(orderId),
        listOrderFollowRecords(orderId),
      ]);
      setOrder(detail);
      setRecords(followRecords);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单详情加载失败');
      setOrder(undefined);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function submit(values: { nodeType: string; content?: string; nextRemindAt?: any }) {
    if (!values.nodeType?.trim()) {
      message.warning('请填写节点类型');
      return;
    }
    setSubmitting(true);
    try {
      await createOrderFollowRecord(orderId, {
        nodeType: values.nodeType.trim(),
        content: values.content?.trim() || undefined,
        nextRemindAt: values.nextRemindAt?.toISOString?.() || null,
      });
      message.success('跟进节点已添加');
      form.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>订单详情</Typography.Title>
          <Typography.Paragraph type="secondary">查看订单履约状态与教务跟进节点。</Typography.Paragraph>
        </div>
        <Space>
          <Button onClick={() => router.push('/academic/orders')}>返回订单池</Button>
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
                { key: 'paidStatus', label: '付款状态', children: emptyText(order?.paidStatus) },
                { key: 'orderStatus', label: '订单状态', children: emptyText(order?.orderStatus) },
                { key: 'sales', label: '销售', children: emptyText(order?.salesName ?? order?.salesUserId) },
                { key: 'academic', label: '教务', children: emptyText(order?.academicName ?? order?.academicUserId) },
                { key: 'createdAt', label: '创建时间', children: formatDate(order?.createdAt) },
                { key: 'updatedAt', label: '更新时间', children: formatDate(order?.updatedAt) },
                { key: 'remark', label: '备注', children: emptyText(order?.remark) },
              ]}
            />
          </Card>

          <Card title="新增跟进节点">
            <Form form={form} layout="inline" onFinish={submit}>
              <Form.Item name="nodeType" rules={[{ required: true, message: '请输入节点类型' }]}>
                <Input placeholder="节点类型，如：开课 / 教材寄出 / 异常" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="content">
                <Input placeholder="备注（选填）" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="nextRemindAt">
                <DatePicker showTime placeholder="下次提醒（选填）" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting}>添加</Button>
              </Form.Item>
            </Form>
            <Typography.Text type="secondary">提示：节点类型含"异常"时会自动通知销售。</Typography.Text>
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
                        {formatDate(record.createdAt)}
                        {record.nextRemindAt ? ` | 下次提醒：${formatDate(record.nextRemindAt)}` : ''}
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
