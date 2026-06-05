'use client';

import { DownloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Descriptions, Empty, Form, Input, Modal, Select, Space, Spin, Table, Tag, Timeline, Tooltip, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { createAbnormalFeedback, closeAbnormalFeedback, createOrderFollowRecord, getOrderDetail, listAbnormalFeedbacks, listOrderFollowRecords } from '@/shared/api/orders';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { uploadFile } from '@/shared/api/uploads';
import { readStoredUser } from '@/shared/auth/auth';
import { handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import type { AbnormalTypeCode, ExpectedHelperCode, OrderAbnormalFeedback, OrderFollowRecord, OrderItem } from '@/shared/types/orders';
import { formatDateTime } from '@/shared/utils/date-format';

function emptyText(value?: string | null) {
  return value || '-';
}

const ABNORMAL_TYPE_OPTIONS: { label: string; value: AbnormalTypeCode }[] = [
  { label: '客户不配合', value: 'client_uncooperative' },
  { label: '素材缺失', value: 'material_missing' },
  { label: '老师未响应', value: 'teacher_no_response' },
  { label: '周期风险', value: 'cycle_risk' },
  { label: '款项问题', value: 'payment_issue' },
  { label: '其他', value: 'other' },
];

const EXPECTED_HELPER_OPTIONS: { label: string; value: ExpectedHelperCode }[] = [
  { label: '销售', value: 'sales' },
  { label: '主管', value: 'supervisor' },
  { label: '运营', value: 'operation' },
  { label: '其他', value: 'other' },
];

const ABNORMAL_TYPE_LABEL: Record<string, string> = {
  client_uncooperative: '客户不配合',
  material_missing: '素材缺失',
  teacher_no_response: '老师未响应',
  cycle_risk: '周期风险',
  payment_issue: '款项问题',
  other: '其他',
};

const HELPER_LABEL: Record<string, string> = {
  sales: '销售',
  supervisor: '主管',
  operation: '运营',
  other: '其他',
};

const ABNORMAL_STATUS_META: Record<string, { label: string; color: string }> = {
  open: { label: '待处理', color: 'red' },
  handling: { label: '处理中', color: 'gold' },
  closed: { label: '已关闭', color: 'green' },
};

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
  const currentUser = readStoredUser();
  const isAcademic = currentUser?.role === 'academic';
  const isAdminLike = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  const [order, setOrder] = useState<OrderItem>();
  const [records, setRecords] = useState<OrderFollowRecord[]>([]);
  const [abnormalFeedbacks, setAbnormalFeedbacks] = useState<OrderAbnormalFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [abnormalModalOpen, setAbnormalModalOpen] = useState(false);
  const [abnormalSubmitting, setAbnormalSubmitting] = useState(false);
  const [closingId, setClosingId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [abnormalForm] = Form.useForm();
  const [form] = Form.useForm();

  async function loadDetail() {
    setLoading(true);
    try {
      const [detail, followRecords, feedbacks] = await Promise.all([
        getOrderDetail(orderId),
        listOrderFollowRecords(orderId),
        listAbnormalFeedbacks(orderId).catch(() => [] as OrderAbnormalFeedback[]),
      ]);
      setOrder(detail);
      setRecords(followRecords);
      setAbnormalFeedbacks(feedbacks);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单详情加载失败');
      setOrder(undefined);
      setRecords([]);
      setAbnormalFeedbacks([]);
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
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      });
      message.success('跟进节点已添加');
      form.resetFields();
      setAttachmentUrl('');
      setAttachmentName('');
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openAbnormalModal() {
    abnormalForm.resetFields();
    setAbnormalModalOpen(true);
  }

  async function submitAbnormal(values: { abnormalType: AbnormalTypeCode; description?: string; expectedHelper?: ExpectedHelperCode }) {
    setAbnormalSubmitting(true);
    try {
      await createAbnormalFeedback(orderId, {
        abnormalType: values.abnormalType,
        description: values.description?.trim() || undefined,
        expectedHelper: values.expectedHelper,
      });
      message.success('异常反馈已提交，订单已标记为异常');
      setAbnormalModalOpen(false);
      abnormalForm.resetFields();
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提交失败');
    } finally {
      setAbnormalSubmitting(false);
    }
  }

  function openCloseConfirm(feedback: OrderAbnormalFeedback) {
    Modal.confirm({
      title: '关闭异常反馈',
      content: '关闭后订单状态会从「异常」回退到「进行中」，且不可再次关闭。',
      okText: '确认关闭',
      cancelText: '取消',
      onOk: () => closeFeedback(feedback),
    });
  }

  async function closeFeedback(feedback: OrderAbnormalFeedback) {
    setClosingId(feedback.id);
    try {
      await closeAbnormalFeedback(orderId, feedback.id, { status: 'closed' });
      message.success('异常已关闭，订单状态已回退');
      await loadDetail();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '关闭失败');
    } finally {
      setClosingId('');
    }
  }

  function canCloseFeedback(feedback: OrderAbnormalFeedback): boolean {
    if (!currentUser) return false;
    if (isAdminLike) return feedback.status !== 'closed';
    if (isAcademic && feedback.reporterUserId === currentUser.id) return feedback.status !== 'closed';
    if (currentUser.role === 'sales' && order?.salesUserId === currentUser.id) return feedback.status !== 'closed';
    return false;
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
          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              const hide = message.loading('正在生成导出文件...', 0);
              try {
                const result = await createExport({
                  exportType: 'order_progress',
                  filter: { orderId, scope: 'academic' },
                });

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
                setExporting(false);
              }
            }}
          >
            导出此订单
          </Button>
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
                { key: 'paidStatus', label: '付款状态', children: <Tag color={paidStatusMeta(order?.paidStatus).color}>{paidStatusMeta(order?.paidStatus).label}</Tag> },
                { key: 'orderStatus', label: '订单状态', children: <Tag color={orderStatusMeta(order?.orderStatus).color}>{orderStatusMeta(order?.orderStatus).label}</Tag> },
                {
                  key: 'handoverStatus',
                  label: '交接状态',
                  children: (() => {
                    const meta = handoverStatusMeta(order?.handoverStatus);
                    return <Tag color={meta.color}>{meta.label}</Tag>;
                  })(),
                },
                { key: 'sales', label: '销售', children: emptyText(order?.salesName ?? order?.salesUserId) },
                { key: 'academic', label: '教务', children: emptyText(order?.academicName ?? order?.academicUserId) },
                { key: 'createdAt', label: '创建时间', children: formatDateTime(order?.createdAt) },
                { key: 'updatedAt', label: '更新时间', children: formatDateTime(order?.updatedAt) },
                { key: 'remark', label: '备注', children: emptyText(order?.remark) },
              ]}
            />
          </Card>

          <Card title="交付要求与资料">
            <Descriptions
              bordered
              column={{ xs: 1, md: 2 }}
              size="small"
              items={[
                { key: 'deliveryRequirement', label: '交付要求', children: emptyText(order?.deliveryRequirement) },
                { key: 'materialStatus', label: '资料情况', children: emptyText(order?.materialStatus) },
                { key: 'teacher', label: '老师/专家', children: emptyText(order?.teacher) },
                { key: 'remark', label: '备注', children: emptyText(order?.remark) },
              ]}
            />
          </Card>

          <Card title="销售跟进摘要">
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              仅展示销售向教务/主管公开同步的进展摘要；销售与客户的私密沟通不在此展示。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {emptyText(order?.salesSummary)}
            </Typography.Paragraph>
          </Card>

          {isAcademic ? (
            <Card
              title="订单异常反馈"
              extra={
                <Space>
                  {(() => {
                    const openFeedback = abnormalFeedbacks.find((fb) => fb.status !== 'closed');
                    if (!openFeedback || !canCloseFeedback(openFeedback)) return null;
                    return (
                      <Button
                        danger
                        icon={<ExclamationCircleOutlined />}
                        loading={closingId === openFeedback.id}
                        onClick={() => openCloseConfirm(openFeedback)}
                      >
                        关闭异常
                      </Button>
                    );
                  })()}
                  <Button type="primary" danger onClick={openAbnormalModal}>
                    提交异常反馈
                  </Button>
                </Space>
              }
            >
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                提交后会通知销售与主管，并把订单状态切换为「异常」；关闭后自动回退到进行中。
              </Typography.Paragraph>
              {abnormalFeedbacks.length > 0 ? (
                <Table<OrderAbnormalFeedback>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={abnormalFeedbacks}
                  columns={[
                    {
                      title: '类型',
                      dataIndex: 'abnormalType',
                      key: 'abnormalType',
                      width: 120,
                      render: (value: string) => ABNORMAL_TYPE_LABEL[value] || value,
                    },
                    {
                      title: '期望协助',
                      dataIndex: 'expectedHelper',
                      key: 'expectedHelper',
                      width: 100,
                      render: (value?: string | null) => (value ? HELPER_LABEL[value] || value : '-'),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 100,
                      render: (value: string) => {
                        const meta = ABNORMAL_STATUS_META[value] ?? { label: value || '未知', color: 'default' };
                        return <Tag color={meta.color}>{meta.label}</Tag>;
                      },
                    },
                    {
                      title: '描述',
                      dataIndex: 'description',
                      key: 'description',
                      render: (value?: string | null) => emptyText(value),
                    },
                    {
                      title: '提交时间',
                      dataIndex: 'createdAt',
                      key: 'createdAt',
                      width: 160,
                      render: (value?: string) => formatDateTime(value),
                    },
                    {
                      title: '操作',
                      key: 'actions',
                      width: 120,
                      render: (_v, record) =>
                        canCloseFeedback(record) ? (
                          <Button
                            size="small"
                            loading={closingId === record.id}
                            onClick={() => openCloseConfirm(record)}
                          >
                            关闭
                          </Button>
                        ) : null,
                    },
                  ]}
                />
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无异常反馈记录" />
              )}
            </Card>
          ) : null}

          <Card title="新增跟进节点">
            <Form form={form} layout="inline" onFinish={submit}>
              <Form.Item name="nodeType" rules={[{ required: true, message: '请输入节点类型' }]}>
                <Input placeholder="节点类型，如：开课 / 教材寄出 / 异常" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="content">
                <Input placeholder="备注（选填）" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="nextRemindAt">
                <DatePicker showTime placeholder="下次提醒（选填）" format="YYYY年MM月DD日 HH:mm:ss" />
              </Form.Item>
              <Form.Item>
                <Upload
                  accept="*"
                  showUploadList={false}
                  customRequest={async ({ file, onSuccess, onError }) => {
                    try {
                      const f = file as File;
                      const result = await uploadFile(f, 'order-attachments');
                      setAttachmentUrl(result.url);
                      setAttachmentName(f.name);
                      onSuccess?.(result);
                      message.success('附件上传成功');
                    } catch (err) {
                      onError?.(err as Error);
                      message.error('附件上传失败');
                    }
                  }}
                >
                  <Button>{attachmentUrl ? '重新上传附件' : '上传附件'}</Button>
                </Upload>
              </Form.Item>
              {attachmentUrl && (
                <Form.Item>
                  <Typography.Text delete type="secondary" style={{ maxWidth: 200 }}>
                    {attachmentName}
                  </Typography.Text>
                </Form.Item>
              )}
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={submitting}>添加</Button>
              </Form.Item>
            </Form>
            <Typography.Text type="secondary">提示：节点类型含"异常"时仍会自动通知销售（兼容旧逻辑）。</Typography.Text>
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

      <Modal
        title="提交异常反馈"
        open={abnormalModalOpen}
        onCancel={() => setAbnormalModalOpen(false)}
        footer={null}
        destroyOnClose
        maskClosable={false}
      >
        <Form
          form={abnormalForm}
          layout="vertical"
          onFinish={submitAbnormal}
          initialValues={{ abnormalType: 'client_uncooperative', expectedHelper: 'sales' }}
        >
          <Form.Item
            name="abnormalType"
            label="异常类型"
            rules={[{ required: true, message: '请选择异常类型' }]}
          >
            <Select options={ABNORMAL_TYPE_OPTIONS} placeholder="请选择异常类型" />
          </Form.Item>
          <Form.Item name="description" label="异常描述" rules={[{ required: true, message: '请填写异常描述' }]}>
            <Input.TextArea rows={4} placeholder="请详细描述异常情况，便于接收方快速定位" />
          </Form.Item>
          <Form.Item name="expectedHelper" label="期望协助方" rules={[{ required: true, message: '请选择期望协助方' }]}>
            <Select options={EXPECTED_HELPER_OPTIONS} placeholder="请选择期望协助方" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setAbnormalModalOpen(false)}>取消</Button>
              <Button type="primary" danger htmlType="submit" loading={abnormalSubmitting}>
                提交
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
