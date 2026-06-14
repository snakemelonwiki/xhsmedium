'use client';

import { DeleteOutlined, DownloadOutlined, ExclamationCircleOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Col, DatePicker, Descriptions, Divider, Empty, Form, Input, Modal, Row, Select, Space, Spin, Steps, Table, Tag, Timeline, Tooltip, Typography, Upload, message } from 'antd';
import type { UploadProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  createAbnormalFeedback,
  closeAbnormalFeedback,
  createOrderFollowRecord,
  getOrderDelivery,
  getOrderDetail,
  listAbnormalFeedbacks,
  listOrderFollowRecords,
  updateOrderDelivery,
} from '@/shared/api/orders';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { uploadFile } from '@/shared/api/uploads';
import { readStoredUser } from '@/shared/auth/auth';
import { handoverStatusMeta, orderStatusMeta, paidStatusMeta } from '@/shared/api/enums';
import type { AbnormalTypeCode, ExpectedHelperCode, OrderAbnormalFeedback, OrderDeliveryDetail, OrderFollowRecord, OrderItem } from '@/shared/types/orders';
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

const DELIVERY_DATE_FIELDS = [
  'infoSentToTeacherAt',
  'innovationReviewAt',
  'firstDraftReviewAt',
  'editorReviewAt',
  'authorInfoCheckedAt',
  'lastTeacherUpdateAt',
  'nextFollowUpAt',
  'submittedExpectedAt',
  'withEditorExpectedAt',
  'underReviewExpectedAt',
  'revisionExpectedAt',
  'acceptedExpectedAt',
  'proofingExpectedAt',
  'onlineExpectedAt',
  'indexedExpectedAt',
  'firstWeekCheckAt',
  'nextJournalCheckAt',
  'revisionDueAt',
  'onlineAt',
  'indexingAt',
] as const;

type DeliveryFieldConfig = {
  name: string;
  label: string;
  type?: 'date';
  options?: { label: string; value: string }[];
  disabled?: boolean;
};

function options(values: string[]) {
  return values.map((value) => ({ label: value, value }));
}

const BASIC_DELIVERY_FIELDS: readonly DeliveryFieldConfig[] = [
  { name: 'orderNumber', label: '订单编号', disabled: true },
  { name: 'customerName', label: '客户姓名' },
  { name: 'degreeLevel', label: '学历层级' },
  { name: 'majorDirection', label: '专业方向' },
  { name: 'requiredZone', label: '所需区位' },
  { name: 'paperUse', label: '文章用途' },
  { name: 'submissionEmail', label: '投稿邮箱' },
  { name: 'submissionEmailPassword', label: '投稿邮箱密码' },
] as const;

const REGISTRATION_STATUS_OPTIONS = [
  { label: '未索要', value: '未索要' },
  { label: '已索要', value: '已索要' },
  { label: '已收到', value: '已收到' },
  { label: '已传老师', value: '已传老师' },
];

const OPERATION_METHOD_OPTIONS = [
  { label: '一稿一投', value: '一稿一投' },
  { label: '两稿两投', value: '两稿两投' },
  { label: '三稿三投', value: '三稿三投' },
];

const PLAGIARISM_OPTIONS = [
  { label: '未确认', value: '未确认' },
  { label: '需要查重', value: '需要查重' },
  { label: '已查重', value: '已查重' },
  { label: '不需要查重', value: '不需要查重' },
];

const DELIVERY_SELECT_OPTIONS: Record<string, { label: string; value: string }[]> = {
  degreeLevel: options(['专科', '本科', '硕士', '博士', '职称']),
  statusStage: options(['销售建单', '待补资料', '待教务审核', '待分配老师', '老师已接单', '写作中', '待投稿', '已投稿', '审稿中', '返修中', '已录用', '待见刊', '已完成', '异常处理中']),
  paperProgress: options(['待分配', '进行中', '待投稿', '已投稿', '返修中', '已录用']),
  teacherStability: options(['新老师', '稳定老师']),
  innovationReviewStatus: options(['未提交', '待审核', '已通过', '需修改', '稳定老师跳过']),
  firstDraftReviewStatus: options(['未提交', '待审核', '已通过', '需修改']),
  editorReviewStatus: options(['未提交', '待审查', '已通过', '需修改']),
  authorInfoChecked: options(['未核对', '已核对无误', '有问题待确认']),
  riskLevel: options(['正常', '提醒', '预警', '高风险', '应急']),
  customerComplaint: options(['否', '是']),
  needsSupervisor: options(['否', '是']),
  emergencyStatus: options(['正常', '待处理', '处理中', '已解决']),
  journalStatus: options(['未投稿', 'Submitted', 'With Editor', 'Under Review', 'Revision', 'Accepted', 'Proofing', 'Online', 'Indexed', 'Rejected']),
  reminderLetterStatus: options(['不需要', '需提醒老师发送', '老师已发送']),
  revisionStatus: options(['无返修', '待提醒老师', '老师返修中', '已提交返修']),
  pageFeeStatus: options(['未录用', '待提醒客户缴纳', '已提醒客户', '客户已缴纳']),
  proofingStatus: options(['未到校稿', '待客户确认', '客户有修改需求', '老师校稿中', '已提交校稿']),
  onlineStatus: options(['未online', '已online待提醒作者', '已提醒作者']),
  indexingStatus: options(['未检索', '已检索待开报告', '已提醒开检索报告']),
  reviewReportStatus: options(['未开', '已提醒', '已完成']),
};

function renderDeliveryControl(field: DeliveryFieldConfig) {
  const selectOptions = field.options ?? DELIVERY_SELECT_OPTIONS[field.name];
  if (field.type === 'date') {
    return <DatePicker showTime style={{ width: '100%' }} />;
  }
  if (selectOptions) {
    return <Select options={selectOptions} placeholder={`请选择${field.label}`} allowClear />;
  }
  if (field.name === 'paperUse') {
    return <Input disabled={field.disabled} allowClear placeholder="毕业 / 评职称 / 项目结题" />;
  }
  return <Input disabled={field.disabled} allowClear />;
}

const PROGRESS_DELIVERY_FIELDS: readonly DeliveryFieldConfig[] = [
  { name: 'responsibleTeacher', label: '派单老师' },
  { name: 'statusStage', label: '订单阶段' },
  { name: 'paperProgress', label: '论文进度' },
  { name: 'assignedTeacher', label: '接单老师' },
  { name: 'backupTeacher', label: '备用老师' },
  { name: 'teacherPhone', label: '老师电话' },
  { name: 'teacherStability', label: '老师稳定性' },
  { name: 'innovationReviewStatus', label: '创新点审核' },
  { name: 'innovationReviewAt', label: '创新点审核时间', type: 'date' },
  { name: 'firstDraftReviewStatus', label: '初稿审核' },
  { name: 'firstDraftReviewAt', label: '初稿审核时间', type: 'date' },
  { name: 'editorReviewStatus', label: '编辑老师审查' },
  { name: 'editorReviewAt', label: '编辑审查时间', type: 'date' },
  { name: 'authorInfoChecked', label: '投稿前作者信息核对' },
  { name: 'authorInfoCheckedAt', label: '作者核对时间', type: 'date' },
  { name: 'salesContact', label: '对接销售' },
  { name: 'academicOwner', label: '负责教务' },
  { name: 'nextFollowUpAt', label: '下次跟进时间', type: 'date' },
  { name: 'lastTeacherUpdateAt', label: '老师最近反馈', type: 'date' },
  { name: 'riskLevel', label: '风险等级' },
  { name: 'customerComplaint', label: '是否投诉' },
  { name: 'needsSupervisor', label: '主管关注' },
  { name: 'emergencyStatus', label: '应急状态' },
] as const;

const STATUS_DELIVERY_FIELDS: readonly DeliveryFieldConfig[] = [
  { name: 'journalStatus', label: '当前真实阶段' },
  { name: 'submittedExpectedAt', label: 'Submitted预计产出', type: 'date' },
  { name: 'withEditorExpectedAt', label: 'With Editor预计产出', type: 'date' },
  { name: 'underReviewExpectedAt', label: 'Under Review预计产出', type: 'date' },
  { name: 'revisionExpectedAt', label: 'Revision预计产出', type: 'date' },
  { name: 'acceptedExpectedAt', label: 'Accepted预计产出', type: 'date' },
  { name: 'proofingExpectedAt', label: 'Proofing预计产出', type: 'date' },
  { name: 'onlineExpectedAt', label: 'Online预计产出', type: 'date' },
  { name: 'indexedExpectedAt', label: 'Indexed预计产出', type: 'date' },
  { name: 'firstWeekCheckAt', label: '首周查稿时间', type: 'date' },
  { name: 'nextJournalCheckAt', label: '下次查稿时间', type: 'date' },
  { name: 'reminderLetterStatus', label: '催稿信状态' },
  { name: 'revisionStatus', label: '返修状态' },
  { name: 'revisionDueAt', label: '返修截止时间', type: 'date' },
  { name: 'pageFeeStatus', label: '版面费状态' },
  { name: 'proofingStatus', label: '校稿状态' },
  { name: 'onlineStatus', label: 'Online状态' },
  { name: 'onlineAt', label: 'Online时间', type: 'date' },
  { name: 'indexingStatus', label: '检索状态' },
  { name: 'indexingAt', label: '检索时间', type: 'date' },
  { name: 'reviewReportStatus', label: '检索审查报告' },
] as const;

const PROGRESS_STAGES = [
  {
    key: 'init',
    label: '初始',
    statusValues: ['销售建单', '待补资料', '待教务审核'],
    fields: ['responsibleTeacher', 'statusStage', 'paperProgress', 'academicOwner', 'salesContact'],
  },
  {
    key: 'assign',
    label: '分配老师',
    statusValues: ['待分配老师', '老师已接单'],
    fields: ['assignedTeacher', 'backupTeacher', 'teacherPhone', 'teacherStability'],
  },
  {
    key: 'writing',
    label: '写作审核',
    statusValues: ['写作中'],
    fields: [
      'innovationReviewStatus',
      'innovationReviewAt',
      'firstDraftReviewStatus',
      'firstDraftReviewAt',
      'editorReviewStatus',
      'editorReviewAt',
    ],
  },
  {
    key: 'preSubmit',
    label: '投稿准备',
    statusValues: ['待投稿'],
    fields: ['authorInfoChecked', 'authorInfoCheckedAt'],
  },
  {
    key: 'postSubmit',
    label: '投稿后',
    statusValues: ['已投稿', '审稿中', '返修中', '已录用', '待见刊', '已完成', '异常处理中'],
    fields: [
      'riskLevel',
      'nextFollowUpAt',
      'lastTeacherUpdateAt',
      'customerComplaint',
      'needsSupervisor',
      'emergencyStatus',
    ],
  },
] as const;

const JOURNAL_STEPS = [
  { key: '未投稿', label: '未投稿', fields: ['journalStatus', 'firstWeekCheckAt', 'nextJournalCheckAt'] },
  { key: 'Submitted', label: 'Submitted', fields: ['submittedExpectedAt'] },
  { key: 'With Editor', label: 'With Editor', fields: ['withEditorExpectedAt'] },
  {
    key: 'Under Review',
    label: 'Under Review',
    fields: ['underReviewExpectedAt', 'reminderLetterStatus'],
  },
  {
    key: 'Revision',
    label: 'Revision',
    fields: ['revisionExpectedAt', 'revisionStatus', 'revisionDueAt'],
  },
  { key: 'Accepted', label: 'Accepted', fields: ['acceptedExpectedAt', 'pageFeeStatus'] },
  { key: 'Proofing', label: 'Proofing', fields: ['proofingExpectedAt', 'proofingStatus'] },
  { key: 'Online', label: 'Online', fields: ['onlineExpectedAt', 'onlineAt', 'onlineStatus'] },
  {
    key: 'Indexed',
    label: 'Indexed',
    fields: ['indexedExpectedAt', 'indexingAt', 'indexingStatus', 'reviewReportStatus'],
  },
] as const;

const DEFAULT_DELIVERY: OrderDeliveryDetail = {
  order: {},
  authors: [],
  submissions: [],
  finance: {},
};

function toDayjs(value?: string | null): Dayjs | null {
  if (!value) return null;
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed : null;
}

function hydrateDeliveryForm(detail: OrderDeliveryDetail) {
  const order: Record<string, unknown> = { ...detail.order };
  DELIVERY_DATE_FIELDS.forEach((field) => {
    order[field] = toDayjs(detail.order[field]);
  });
  // 按操作方式初始化投稿数量
  const method = order.operationMethod as string || '';
  const submissionCount = method === '三稿三投' ? 3 : method === '两稿两投' ? 2 : 1;
  return {
    order,
    authors: detail.authors.length ? detail.authors : [{ authorOrder: 1 }],
    submissions: detail.submissions.length
      ? detail.submissions.map((item) => ({ ...item, submitTime: toDayjs(item.submitTime) }))
      : Array.from({ length: submissionCount }, (_, i) => ({ submissionNo: i + 1 })),
    backupSubmissions: (detail as any).backupSubmissions?.length
      ? (detail as any).backupSubmissions.map((item: any) => ({ ...item, submitTime: toDayjs(item.submitTime) }))
      : [],
    finance: detail.finance,
  };
}

function serializeDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  if (dayjs.isDayjs(value)) return value.toISOString();
  return String(value);
}

function serializeDeliveryForm(values: any) {
  const order = { ...(values.order || {}) };
  DELIVERY_DATE_FIELDS.forEach((field) => {
    order[field] = serializeDate(order[field]);
  });
  return {
    order,
    authors: Array.isArray(values.authors) ? values.authors : [],
    submissions: Array.isArray(values.submissions)
      ? values.submissions.map((item: any) => ({ ...item, submitTime: serializeDate(item?.submitTime) }))
      : [],
    backupSubmissions: Array.isArray(values.backupSubmissions)
      ? values.backupSubmissions.map((item: any) => ({ ...item, submitTime: serializeDate(item?.submitTime) }))
      : [],
    finance: values.finance || {},
  };
}

function calculatePendingAmount(total: unknown, paid: unknown, fallback?: string | null) {
  const totalText = total === undefined || total === null ? '' : String(total).trim();
  const paidText = paid === undefined || paid === null ? '' : String(paid).trim();
  if (!totalText && !paidText) return fallback ?? '';

  const totalNumber = totalText ? Number(totalText) : 0;
  const paidNumber = paidText ? Number(paidText) : 0;
  if (!Number.isFinite(totalNumber) || !Number.isFinite(paidNumber)) return '';

  return (totalNumber - paidNumber).toFixed(2);
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
  const currentUser = readStoredUser();
  const isAcademic = currentUser?.role === 'academic';
  const isAdminLike = currentUser?.role === 'admin' || currentUser?.role === 'owner';

  const [order, setOrder] = useState<OrderItem>();
  const [delivery, setDelivery] = useState<OrderDeliveryDetail>(DEFAULT_DELIVERY);
  const [records, setRecords] = useState<OrderFollowRecord[]>([]);
  const [abnormalFeedbacks, setAbnormalFeedbacks] = useState<OrderAbnormalFeedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [abnormalModalOpen, setAbnormalModalOpen] = useState(false);
  const [abnormalSubmitting, setAbnormalSubmitting] = useState(false);
  const [closingId, setClosingId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [activeProgressStep, setActiveProgressStep] = useState(0);
  const [activeJournalStep, setActiveJournalStep] = useState(0);
  const [abnormalForm] = Form.useForm();
  const [form] = Form.useForm();
  const [deliveryForm] = Form.useForm();
  const statusStage = Form.useWatch(['order', 'statusStage'], deliveryForm);
  const operationMethod = Form.useWatch(['order', 'operationMethod'], deliveryForm);
  const journalStatus = Form.useWatch(['order', 'journalStatus'], deliveryForm);
  const financeValues = Form.useWatch('finance', deliveryForm) || {};
  const customerPending = calculatePendingAmount(
    financeValues.orderAmount,
    financeValues.customerPaid,
    delivery.finance.customerPending,
  );
  const teacherPending = calculatePendingAmount(
    financeValues.teacherPrice,
    financeValues.teacherPaid,
    delivery.finance.teacherPending,
  );

  async function loadDetail() {
    setLoading(true);
    try {
      const [detail, followRecords, feedbacks, deliveryDetail] = await Promise.all([
        getOrderDetail(orderId),
        listOrderFollowRecords(orderId),
        listAbnormalFeedbacks(orderId).catch(() => [] as OrderAbnormalFeedback[]),
        getOrderDelivery(orderId).catch(() => DEFAULT_DELIVERY),
      ]);
      setOrder(detail);
      setRecords(followRecords);
      setAbnormalFeedbacks(feedbacks);
      setDelivery(deliveryDetail);
      deliveryForm.setFieldsValue(hydrateDeliveryForm(deliveryDetail));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '订单详情加载失败');
      setOrder(undefined);
      setDelivery(DEFAULT_DELIVERY);
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

  async function submit(values: { nodeType: string; content?: string; remindStage?: string; nextRemindAt?: any }) {
    if (!values.nodeType?.trim()) {
      message.warning('请填写节点类型');
      return;
    }
    setSubmitting(true);
    try {
      await createOrderFollowRecord(orderId, {
        nodeType: values.nodeType.trim(),
        content: values.content?.trim() || undefined,
        remindStage: values.remindStage || undefined,
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

  async function submitDelivery(values: any) {
    setSavingDelivery(true);
    try {
      const payload = serializeDeliveryForm(values);
      // 教务端（含教务主管）不提交财务信息（后端限制"付款信息只允许销售修改"）
      if (isAcademic || currentUser?.role === 'academic_supervisor') {
        delete (payload as Record<string, unknown>).finance;
      }
      await updateOrderDelivery(orderId, payload);
      message.success('交付信息已保存');
      const next = await getOrderDelivery(orderId);
      setDelivery(next);
      deliveryForm.setFieldsValue(hydrateDeliveryForm(next));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '交付信息保存失败');
    } finally {
      setSavingDelivery(false);
    }
  }

  async function uploadAuthorRegistration(file: File) {
    try {
      const result = await uploadFile(file, 'order-author-registrations');
      deliveryForm.setFieldsValue({
        order: {
          ...(deliveryForm.getFieldValue('order') || {}),
          authorRegistrationUrl: result.url,
          authorRegistrationName: result.originalName || file.name,
        },
      });
      message.success('作者登记表上传成功，请保存交付信息');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '作者登记表上传失败');
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
    if ((isAcademic || currentUser.role === 'academic_supervisor') && feedback.reporterUserId === currentUser.id) return feedback.status !== 'closed';
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
                { key: 'orderCode', label: '订单编号', children: order?.orderCode || orderId },
                { key: 'leadId', label: '客资 ID', children: emptyText(order?.leadId) },
                { key: 'serviceType', label: '服务类型', children: emptyText(order?.serviceType) },
                // 教务端不显示金额，仅显示付款状态与付款比例
                ...(isAcademic ? [] : [
                  { key: 'amount', label: '金额', children: emptyText(order?.amount) },
                ] as any[]),
                {
                  key: 'paidStatus',
                  label: '付款状态',
                  children: <Tag color={paidStatusMeta(order?.paidStatus).color}>{paidStatusMeta(order?.paidStatus).label}</Tag>,
                },
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

          <Card
            title="交付信息"
            extra={
              <Typography.Text type="secondary">
                保存后同步到订单交付资料。
              </Typography.Text>
            }
          >
            <Form form={deliveryForm} layout="vertical" onFinish={submitDelivery}>
              <Typography.Title level={5}>客户基本信息</Typography.Title>
              <Row gutter={12}>
                {BASIC_DELIVERY_FIELDS.map((field) => (
                  <Col xs={24} md={8} key={field.name}>
                    <Form.Item name={['order', field.name]} label={field.label}>
                      {renderDeliveryControl(field)}
                    </Form.Item>
                  </Col>
                ))}
              </Row>

              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item label="作者登记表上传">
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <Upload
                        accept=".txt,.json,.csv,.pdf,.doc,.docx,.xls,.xlsx"
                        showUploadList={false}
                        beforeUpload={(file) => {
                          void uploadAuthorRegistration(file);
                          return false;
                        }}
                      >
                        <Button icon={<UploadOutlined />}>选择文件</Button>
                      </Upload>
                      <Form.Item name={['order', 'authorRegistrationUrl']} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['order', 'authorRegistrationName']} noStyle>
                        <Input readOnly placeholder="未选择任何文件" />
                      </Form.Item>
                    </Space>
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['order', 'registrationFormStatus']} label="个人信息登记表状态">
                    <Select options={REGISTRATION_STATUS_OPTIONS} placeholder="请选择登记表状态" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['order', 'infoSentToTeacherAt']} label="传递给老师时间">
                    <DatePicker showTime style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['order', 'operationMethod']} label="操作方式">
                    <Select options={OPERATION_METHOD_OPTIONS} placeholder="请选择操作方式" allowClear />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['order', 'plagiarismRequirement']} label="是否查重">
                    <Select options={PLAGIARISM_OPTIONS} placeholder="请选择查重要求" allowClear />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '20px 0' }} />

              <Typography.Title level={5}>作者信息</Typography.Title>
              <Form.List name="authors">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {fields.map((field, index) => (
                      <Row gutter={8} key={field.key} align="middle">
                        <Col xs={12} md={2}>
                          <Form.Item name={[field.name, 'authorOrder']} label={index === 0 ? '位次' : ' '}>
                            <Input placeholder="1" />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={4}>
                          <Form.Item name={[field.name, 'name']} label={index === 0 ? '姓名' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <Form.Item name={[field.name, 'email']} label={index === 0 ? '邮箱' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'degree']} label={index === 0 ? '学历' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={4}>
                          <Form.Item name={[field.name, 'school']} label={index === 0 ? '学校/单位' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'zipCode']} label={index === 0 ? '邮编' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={20} md={2}>
                          <Form.Item name={[field.name, 'nameEn']} label={index === 0 ? '密码' : ' '}>
                            <Input.Password allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={1}>
                          <Button aria-label="删除作者" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => add({ authorOrder: fields.length + 1 })}>
                      添加作者
                    </Button>
                  </Space>
                )}
              </Form.List>

              {/* A-5：基金信息放在作者信息下面 */}
              <Typography.Title level={5} style={{ marginTop: 20 }}>基金与备注</Typography.Title>
              <Row gutter={12}>
                <Col xs={24}>
                  <Form.Item name={['order', 'fundInfo']} label="基金信息">
                    <Input.TextArea
                      rows={3}
                      placeholder="基金名称、编号；没有可填无"
                      allowClear
                    />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item name={['order', 'academicRemark']} label="教务备注">
                    <Input.TextArea
                      rows={2}
                      placeholder="教务内部备注，不对外展示"
                      allowClear
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* A-5：按操作方向动态生成投稿信息数量 */}
              <Typography.Title level={5} style={{ marginTop: 20 }}>投稿信息</Typography.Title>
              {(() => {
                const method = operationMethod || '';
                const isThesis = deliveryForm.getFieldValue(['order', 'productType']) === '毕业论文';
                if (isThesis) {
                  return (
                    <Typography.Paragraph type="secondary" style={{ padding: '12px 0' }}>
                      毕业论文类型仅需上传作者信息表，无需填写投稿信息。
                    </Typography.Paragraph>
                  );
                }
                const maxSubmissions = method === '三稿三投' ? 3 : method === '两稿两投' ? 2 : 1;
                return (
                  <>
                    <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                      当前操作方式「{method || '未选择'}」，投稿信息数：{maxSubmissions} 组
                    </Typography.Text>
                    <Form.List name="submissions">
                {(fields, { add, remove }) => (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {fields.map((field, index) => (
                      <Row gutter={8} key={field.key} align="middle">
                        <Col xs={12} md={2}>
                          <Form.Item name={[field.name, 'submissionNo']} label={index === 0 ? '序号' : ' '}>
                            <Input placeholder="1" />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <Form.Item name={[field.name, 'paperTitle']} label={index === 0 ? '论文名称' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item name={[field.name, 'journalName']} label={index === 0 ? '投稿期刊' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item name={[field.name, 'journalUrl']} label={index === 0 ? '投稿网址' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'account']} label={index === 0 ? '投稿账号' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'password']} label={index === 0 ? '投稿密码' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={20} md={2}>
                          <Form.Item name={[field.name, 'submitTime']} label={index === 0 ? '投稿时间' : ' '}>
                            <DatePicker showTime style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={1}>
                          <Button aria-label="删除投稿" icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => add({ submissionNo: fields.length + 1 })}>
                      添加投稿
                    </Button>
                  </Space>
                )}
              </Form.List>
                  </>
                );
              })()}

              {/* A-5：备用投稿信息表 */}
              <Typography.Title level={5} style={{ marginTop: 24 }}>备用投稿信息</Typography.Title>
              <Typography.Paragraph type="secondary">
                备用投稿信息仅供上传查看，不默认展示在投稿流程中。如有需要可在此补充额外投稿记录。
              </Typography.Paragraph>
              <Form.List name="backupSubmissions">
                {(bfields, { add: badd, remove: bremove }) => (
                  <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    {bfields.map((field, index) => (
                      <Row gutter={8} key={field.key} align="middle">
                        <Col xs={12} md={2}>
                          <Form.Item name={[field.name, 'submissionNo']} label={index === 0 ? '序号' : ' '}>
                            <Input placeholder="备用" disabled />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={5}>
                          <Form.Item name={[field.name, 'paperTitle']} label={index === 0 ? '论文名称' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item name={[field.name, 'journalName']} label={index === 0 ? '投稿期刊' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={24} md={4}>
                          <Form.Item name={[field.name, 'journalUrl']} label={index === 0 ? '投稿网址' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'account']} label={index === 0 ? '投稿账号' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={12} md={3}>
                          <Form.Item name={[field.name, 'password']} label={index === 0 ? '投稿密码' : ' '}>
                            <Input allowClear />
                          </Form.Item>
                        </Col>
                        <Col xs={20} md={2}>
                          <Form.Item name={[field.name, 'submitTime']} label={index === 0 ? '投稿时间' : ' '}>
                            <DatePicker showTime style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col xs={4} md={1}>
                          <Button aria-label="删除备用投稿" icon={<DeleteOutlined />} onClick={() => bremove(field.name)} />
                        </Col>
                      </Row>
                    ))}
                    <Button icon={<PlusOutlined />} onClick={() => badd({ submissionNo: bfields.length + 1 })}>
                      添加备用投稿
                    </Button>
                  </Space>
                )}
              </Form.List>

              <Card title="履约进度" size="small" style={{ marginTop: 20 }}>
                {(() => {
                  const computedIndex = Math.max(
                    0,
                    PROGRESS_STAGES.findIndex((s) =>
                      (s.statusValues as readonly string[]).includes(statusStage as string),
                    ) ?? 0,
                  );
                  return (
                    <>
                      <Steps
                        size="small"
                        current={activeProgressStep}
                        onChange={(step) => setActiveProgressStep(step)}
                        items={PROGRESS_STAGES.map((s) => ({ title: s.label }))}
                      />
                      <Typography.Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 12, marginBottom: 12 }}
                      >
                        当前阶段：{PROGRESS_STAGES[activeProgressStep]?.label || '—'}，下方展示该阶段需要填写的字段。
                      </Typography.Text>
                    </>
                  );
                })()}
                <Row gutter={12}>
                  {PROGRESS_DELIVERY_FIELDS.filter((field) => {
                    const visibleFields = new Set<string>(PROGRESS_STAGES[activeProgressStep]?.fields ?? []);
                    return visibleFields.has(field.name);
                  }).map((field) => (
                    <Col xs={24} md={6} key={field.name}>
                      <Form.Item name={['order', field.name]} label={field.label}>
                        {renderDeliveryControl(field)}
                      </Form.Item>
                    </Col>
                  ))}
                  <Col xs={24}>
                    <Form.Item name={['order', 'supervisorNote']} label="主管备注 / 风险说明">
                      <Input.TextArea
                        rows={3}
                        placeholder="记录异常原因、应急安排、客户投诉等"
                        allowClear
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>

              <Card title="期刊与交付状态" size="small" style={{ marginTop: 16 }}>
                {(() => {
                  const allJournalKeys = JOURNAL_STEPS.map((s) => s.key);
                  const computedIndex = Math.max(
                    0,
                    (allJournalKeys as string[]).indexOf(journalStatus as string) ?? 0,
                  );
                  return (
                    <>
                      <Steps
                        size="small"
                        current={activeJournalStep}
                        onChange={(step) => setActiveJournalStep(step)}
                        items={JOURNAL_STEPS.map((s) => ({ title: s.label }))}
                      />
                      <Typography.Text
                        type="secondary"
                        style={{ display: 'block', marginTop: 12, marginBottom: 12 }}
                      >
                        当前阶段：{JOURNAL_STEPS[activeJournalStep]?.label || '—'}，下方展示该阶段需要填写的字段。
                      </Typography.Text>
                    </>
                  );
                })()}
                <Row gutter={12}>
                  {STATUS_DELIVERY_FIELDS.filter((field) => {
                    const visibleFields = new Set<string>(JOURNAL_STEPS[activeJournalStep]?.fields ?? []);
                    return visibleFields.has(field.name);
                  }).map((field) => (
                    <Col xs={24} md={6} key={field.name}>
                      <Form.Item name={['order', field.name]} label={field.label}>
                        {renderDeliveryControl(field)}
                      </Form.Item>
                    </Col>
                  ))}
                </Row>
              </Card>

              <Typography.Title level={5}>财务信息</Typography.Title>
              <Row gutter={12}>
                <Col xs={24} md={4}>
                  <Form.Item name={['finance', 'orderAmount']} label="订单额">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name={['finance', 'customerPaid']} label="订单已付款">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item label="订单待支付">
                    <Input value={customerPending} disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name={['finance', 'teacherPrice']} label="老师接单价格">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item name={['finance', 'teacherPaid']} label="老师已付款">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} md={4}>
                  <Form.Item label="老师待付款">
                    <Input value={teacherPending} disabled />
                  </Form.Item>
                </Col>
              </Row>

              <Space>
                <Button type="primary" htmlType="submit" loading={savingDelivery}>
                  保存交付信息
                </Button>
                <Button onClick={() => deliveryForm.setFieldsValue(hydrateDeliveryForm(delivery))}>
                  还原
                </Button>
              </Space>
            </Form>
          </Card>

          <Card title="销售跟进摘要">
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              仅展示销售向教务/主管公开同步的进展摘要；销售与客户的私密沟通不在此展示。
            </Typography.Paragraph>
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {emptyText(order?.salesSummary)}
            </Typography.Paragraph>
          </Card>

          {isAcademic || currentUser?.role === 'academic_supervisor' ? (
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
              <Form.Item name="remindStage">
                <Select
                  options={DELIVERY_SELECT_OPTIONS.journalStatus}
                  placeholder="提醒阶段（选填）"
                  allowClear
                  style={{ width: 180 }}
                />
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
                      {record.remindStage ? (
                        <Typography.Text type="secondary">提醒阶段：{record.remindStage}</Typography.Text>
                      ) : null}
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
