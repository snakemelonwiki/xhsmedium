'use client';

import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
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
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  createLeadFollowRecord,
  listSalesLeads,
  updateLeadIntentionLevel,
} from '@/shared/api/leads';
import { StatusTag } from '@/shared/components/status';
import { formatDateTime } from '@/shared/utils/date-format';
import {
  LeadAddStatus,
  LeadProcessStatus,
} from '@/shared/constants/lead-status-enums';
import type { IntentionLevelCode, SalesLead } from '@/shared/types/leads';

const intentionLevelMeta: Record<IntentionLevelCode, { label: string; color: string }> = {
  high: { label: '高', color: 'red' },
  mid: { label: '中', color: 'orange' },
  low: { label: '低', color: 'blue' },
  invalid: { label: '无效', color: 'default' },
  pending: { label: '待判断', color: 'default' },
};

const intentionLevelOptions = [
  { label: '全部意向度', value: '' },
  { label: '高', value: 'high' },
  { label: '中', value: 'mid' },
  { label: '低', value: 'low' },
  { label: '无效', value: 'invalid' },
  { label: '待判断', value: 'pending' },
];

type FollowFormValues = {
  clientDegree?: string;
  clientMajorResearch?: string;
  clientTimeRequirement?: string;
  objectionPoint?: string;
  intentionLevel?: IntentionLevelCode;
  followAction?: string;
  content?: string;
  nextFollowTime?: Dayjs | null;
};

type IntentionFormValues = {
  intentionLevel: IntentionLevelCode;
};

export default function SalesLeadFollowupPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [intentionFilter, setIntentionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [followOpen, setFollowOpen] = useState<SalesLead | null>(null);
  const [intentionOpen, setIntentionOpen] = useState<SalesLead | null>(null);
  const [followForm] = Form.useForm<FollowFormValues>();
  const [intentionForm] = Form.useForm<IntentionFormValues>();
  const [submitting, setSubmitting] = useState(false);

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError('');
    try {
      const result = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        addStatus: LeadAddStatus.ADDED,
        intentionLevel: intentionFilter || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      setPage(result.page);
      setPageSize(result.pageSize);
    } catch (err) {
      const text = err instanceof Error ? err.message : '客资跟进加载失败';
      setError(text);
      message.error(text);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentionFilter]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [items]);

  function openFollow(lead: SalesLead) {
    setFollowOpen(lead);
    followForm.setFieldsValue({
      clientDegree: lead.clientDegree || undefined,
      clientMajorResearch: lead.clientMajorResearch || undefined,
      clientTimeRequirement: lead.clientTimeRequirement || undefined,
      objectionPoint: lead.objectionPoint || undefined,
      intentionLevel: (lead.intentionLevel as IntentionLevelCode) || undefined,
      followAction: lead.followAction || undefined,
      content: undefined,
      nextFollowTime: lead.nextFollowAt ? dayjs(lead.nextFollowAt) : null,
    });
  }

  async function submitFollow() {
    if (!followOpen) return;
    const values = await followForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await createLeadFollowRecord(String(followOpen.id), {
        content: values.content || '',
        clientDegree: values.clientDegree || null,
        clientMajorResearch: values.clientMajorResearch || null,
        clientTimeRequirement: values.clientTimeRequirement || null,
        objectionPoint: values.objectionPoint || null,
        followAction: values.followAction || null,
        followActionAt: new Date().toISOString(),
        intentionLevel: values.intentionLevel || followOpen.intentionLevel,
        nextFollowTime: values.nextFollowTime ? values.nextFollowTime.toISOString() : undefined,
      });
      message.success('跟进记录已保存');
      setFollowOpen(null);
      followForm.resetFields();
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '跟进保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  function openIntention(lead: SalesLead) {
    setIntentionOpen(lead);
    intentionForm.setFieldsValue({
      intentionLevel: (lead.intentionLevel as IntentionLevelCode) || 'pending',
    });
  }

  async function submitIntention() {
    if (!intentionOpen) return;
    const values = await intentionForm.validateFields().catch(() => null);
    if (!values) return;
    setSubmitting(true);
    try {
      await updateLeadIntentionLevel(String(intentionOpen.id), {
        intentionLevel: values.intentionLevel,
      });
      message.success('意向程度已更新');
      setIntentionOpen(null);
      intentionForm.resetFields();
      await load();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新意向程度失败');
    } finally {
      setSubmitting(false);
    }
  }

  const columns = useMemo<TableColumnsType<SalesLead>>(() => [
    {
      title: '客户',
      key: 'customer',
      render: (_v, lead) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{lead.customerName}</Typography.Text>
          {lead.contact ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {lead.contact}
            </Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '意向程度',
      key: 'intentionLevel',
      render: (_v, lead) => {
        const code = (lead.intentionLevel as IntentionLevelCode) || 'pending';
        const meta = intentionLevelMeta[code] || { label: code, color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '添加状态',
      key: 'addStatus',
      render: (_v, lead) => <StatusTag kind="addStatus" code={lead.addStatus ?? LeadAddStatus.ADDED} />,
    },
    {
      title: '处理状态',
      key: 'processStatus',
      render: (_v, lead) => <StatusTag kind="processStatus" code={lead.processStatus ?? LeadProcessStatus.NOT_CONTACTED} />,
    },
    {
      title: '最近跟进',
      key: 'latestFollow',
      width: 150,
      render: (_v, lead) => lead.latestFollowAt ? formatDateTime(lead.latestFollowAt) : '-',
    },
    {
      title: '下次跟进',
      key: 'nextFollow',
      width: 150,
      render: (_v, lead) => lead.nextFollowAt ? formatDateTime(lead.nextFollowAt) : '-',
    },
    {
      title: '操作',
      key: 'actions',
      // 客资跟进不允许修改订单成交状态：操作列只提供详情 + 写跟进 + 改意向。
      // 没有"标记成交"按钮（成交入口在订单跟进 / 详情）。
      render: (_v, lead) => (
        <Space size={4} wrap>
          <Tooltip title="查看客资详情">
            <Button size="small" onClick={() => router.push(`/sales/leads/${lead.id}`)}>详情</Button>
          </Tooltip>
          <Button
            size="small"
            type="primary"
            ghost
            onClick={() => openFollow(lead)}
          >
            写跟进
          </Button>
          <Button
            size="small"
            onClick={() => openIntention(lead)}
          >
            意向程度
          </Button>
        </Space>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [router]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>客资跟进</Typography.Title>
          <Typography.Paragraph type="secondary">
            已添加联系方式的客资在此处持续跟进。只能写跟进、改意向、查看详情；如需成交请到「订单跟进」页操作。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Select
            value={intentionFilter}
            options={intentionLevelOptions}
            onChange={setIntentionFilter}
            style={{ width: 130 }}
            placeholder="意向度"
          />
          <Button onClick={() => load(page, pageSize)} loading={loading}>刷新</Button>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message={error} /> : null}

      <Spin spinning={loading}>
        <Card>
          {sortedItems.length ? (
            <Table<SalesLead>
              rowKey="id"
              columns={columns}
              dataSource={sortedItems}
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="middle"
            />
          ) : (
            <Empty description="暂无需要跟进的客资" />
          )}
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            onChange={(nextPage, nextPageSize) => load(nextPage, nextPageSize)}
            style={{ marginTop: 16, textAlign: 'right' }}
          />
        </Card>
      </Spin>

      {/* 写跟进弹窗（SA-1） */}
      <Modal
        title={followOpen ? `写跟进 · ${followOpen.customerName}` : '写跟进'}
        open={Boolean(followOpen)}
        onCancel={() => { setFollowOpen(null); followForm.resetFields(); }}
        onOk={submitFollow}
        confirmLoading={submitting}
        width={720}
        destroyOnClose
        okText="保存跟进"
      >
        <Form form={followForm} layout="vertical" preserve={false}>
          <div className="form-grid">
            <Form.Item name="clientDegree" label="客户学历">
              <Select
                allowClear
                placeholder="本科/硕士/博士..."
                options={[
                  { label: '本科', value: '本科' },
                  { label: '硕士', value: '硕士' },
                  { label: '博士', value: '博士' },
                  { label: '大专', value: '大专' },
                  { label: '其他', value: '其他' },
                ]}
              />
            </Form.Item>
            <Form.Item name="clientMajorResearch" label="专业 / 研究方向">
              <Input placeholder="如：计算机科学与技术 · 人工智能方向" />
            </Form.Item>
            <Form.Item name="clientTimeRequirement" label="时间要求">
              <Input placeholder="如：2 个月内、年底前" />
            </Form.Item>
            <Form.Item name="objectionPoint" label="异议点">
              <Input placeholder="如：价格太贵 / 导师不同意" />
            </Form.Item>
            <Form.Item name="intentionLevel" label="意向程度">
              <Select
                allowClear
                options={[
                  { label: '高', value: 'high' },
                  { label: '中', value: 'mid' },
                  { label: '低', value: 'low' },
                  { label: '无效', value: 'invalid' },
                  { label: '待判断', value: 'pending' },
                ]}
              />
            </Form.Item>
            <Form.Item name="followAction" label="具体跟进措施">
              <Input placeholder="如：明天下午 3 点发修改方案" />
            </Form.Item>
            <Form.Item name="nextFollowTime" label="下次跟进时间" className="full-row">
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item name="content" label="跟进备注" className="full-row" rules={[{ required: true, message: '请输入跟进内容' }]}>
              <Input.TextArea rows={3} placeholder="记录本次沟通重点和下一步动作" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* 更新意向程度（SA-3） */}
      <Modal
        title={intentionOpen ? `更新意向程度 · ${intentionOpen.customerName}` : '更新意向程度'}
        open={Boolean(intentionOpen)}
        onCancel={() => { setIntentionOpen(null); intentionForm.resetFields(); }}
        onOk={submitIntention}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={intentionForm} layout="vertical" preserve={false}>
          <Form.Item name="intentionLevel" label="意向程度" rules={[{ required: true, message: '请选择意向程度' }]}>
            <Select
              options={[
                { label: '高', value: 'high' },
                { label: '中', value: 'mid' },
                { label: '低', value: 'low' },
                { label: '无效', value: 'invalid' },
                { label: '待判断', value: 'pending' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
