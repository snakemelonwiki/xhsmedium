'use client';

import {
  Alert,
  AutoComplete,
  Button,
  Card,
  DatePicker,
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
import { SearchOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  createLeadFollowRecord,
  listSalesLeads,
  updateLeadIntentionLevel,
} from '@/shared/api/leads';
import { StatusTag } from '@/shared/components/status';
import { formatDateTime } from '@/shared/utils/date-format';
import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { buildTodayDateRange } from '@/shared/utils/default-date-range';
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
  invalidReason?: string;
  followAction?: string;
  content?: string;
  nextFollowTime?: Dayjs | null;
};

type IntentionFormValues = {
  intentionLevel: IntentionLevelCode;
  invalidReason?: string;
};

export default function SalesLeadFollowupPage() {
  const router = useRouter();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [intentionFilter, setIntentionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => buildTodayDateRange());
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
  const autoSetInvalidRef = useRef(false);

  async function load(nextPage = page, nextPageSize = pageSize) {
    setLoading(true);
    setError('');
    try {
      // 主查询：已添加通过的客资
      const mainResult = await listSalesLeads({
        page: nextPage,
        pageSize: nextPageSize,
        addStatus: LeadAddStatus.ADDED,
        intentionLevel: intentionFilter || undefined,
        search: search || undefined,
        from: dateRange ? dateRange.start.startOf('day').format('YYYY-MM-DD') : undefined,
        to: dateRange ? dateRange.end.endOf('day').format('YYYY-MM-DD') : undefined,
      });
      // 同时拉取无效客资（可能 addStatus 不是 ADDED，但也应出现在客资跟进面板）
      let invalidItems: SalesLead[] = [];
      if (!intentionFilter || intentionFilter === 'invalid') {
        try {
          const invalidResult = await listSalesLeads({
            page: 1,
            pageSize: 200,
            intentionLevel: 'invalid',
            search: search || undefined,
            from: dateRange ? dateRange.start.startOf('day').format('YYYY-MM-DD') : undefined,
            to: dateRange ? dateRange.end.endOf('day').format('YYYY-MM-DD') : undefined,
          });
          invalidItems = invalidResult.items;
        } catch {
          // 静默失败
        }
      }
      // 合并去重（先算唯一数量再合并，避免 merged.has 始终为 true 的 bug）
      const mainIds = new Set(mainResult.items.map((l) => l.id));
      const uniqueInvalidCount = invalidItems.filter((l) => !mainIds.has(l.id)).length;
      const merged = new Map<string | number, SalesLead>();
      mainResult.items.forEach((lead) => merged.set(lead.id, lead));
      // 仅在首页或筛选无效时才合并无效客资，避免无效客资出现在每一页
      if (nextPage === 1 || intentionFilter === 'invalid') {
        invalidItems.forEach((lead) => merged.set(lead.id, lead));
      }
      setItems(Array.from(merged.values()));
      setTotal(mainResult.total + (nextPage === 1 && !intentionFilter ? uniqueInvalidCount : 0));
      setPage(mainResult.page);
      setPageSize(mainResult.pageSize);
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
  }, [intentionFilter, pageSize, search, dateRange?.start.valueOf(), dateRange?.end.valueOf()]);

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
      invalidReason: lead.invalidReason || undefined,
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
      const finalIntention = values.intentionLevel || followOpen.intentionLevel;
      const isInvalid = finalIntention === 'invalid';
      if (isInvalid && !values.invalidReason) {
        message.warning('标记为无效客资需要选择无效原因');
        return;
      }
      await createLeadFollowRecord(String(followOpen.id), {
        content: values.content || '',
        clientDegree: values.clientDegree || null,
        clientMajorResearch: values.clientMajorResearch || null,
        clientTimeRequirement: values.clientTimeRequirement || null,
        objectionPoint: values.objectionPoint || null,
        followAction: values.followAction || null,
        followActionAt: new Date().toISOString(),
        intentionLevel: isInvalid ? 'invalid' : finalIntention,
        invalidReason: isInvalid ? (values.invalidReason || null) : null,
        nextFollowTime: values.nextFollowTime ? values.nextFollowTime.toISOString() : undefined,
      });
      message.success('跟进记录已保存');
      setFollowOpen(null);
      followForm.resetFields();
      autoSetInvalidRef.current = false;
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
      invalidReason: lead.invalidReason || undefined,
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
        invalidReason: values.intentionLevel === 'invalid' ? (values.invalidReason || null) : null,
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
          <Typography.Text strong>
            {lead.customerName}
            {lead.salesRemark ? (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}> ({lead.salesRemark})</Typography.Text>
            ) : null}
          </Typography.Text>
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
      title: '学历',
      key: 'clientDegree',
      width: 80,
      render: (_v, lead) => lead.clientDegree || '-',
    },
    {
      title: '专业',
      key: 'clientMajorResearch',
      width: 120,
      ellipsis: true,
      render: (_v, lead) => lead.clientMajorResearch || '-',
    },
    {
      title: '微信备注',
      key: 'salesRemark',
      width: 140,
      ellipsis: true,
      render: (_v, lead) => lead.salesRemark || '-',
    },
    {
      title: '处理状态',
      key: 'processStatus',
      render: (_v, lead) => <StatusTag kind="processStatus" code={lead.processStatus ?? LeadProcessStatus.NOT_CONTACTED} />,
    },
    {
      title: '客户学历',
      key: 'clientDegree',
      width: 100,
      render: (_v, lead) => lead.clientDegree || '-',
    },
    {
      title: '专业/研究方向',
      key: 'major',
      width: 180,
      ellipsis: true,
      render: (_v, lead) => lead.clientMajorResearch || '-',
    },
    {
      title: '最近跟进',
      key: 'latestFollow',
      width: 220,
      render: (_v, lead) => (
        <Space direction="vertical" size={0}>
          {lead.latestFollowNote ? (
            <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{lead.latestFollowNote}</Typography.Text>
          ) : (
            <Typography.Text type="secondary">-</Typography.Text>
          )}
          {lead.latestFollowAt ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{formatDateTime(lead.latestFollowAt)}</Typography.Text>
          ) : null}
        </Space>
      ),
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
          <Input
            prefix={<SearchOutlined />}
            placeholder="按微信昵称/微信号搜索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            allowClear
            style={{ width: 220 }}
          />
          <Select
            value={intentionFilter}
            options={intentionLevelOptions}
            onChange={setIntentionFilter}
            style={{ width: 130 }}
            placeholder="意向度"
          />
          <QuickRangePicker
            value={dateRange}
            onChange={(range) => setDateRange(range ?? buildTodayDateRange())}
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
        onCancel={() => { setFollowOpen(null); followForm.resetFields(); autoSetInvalidRef.current = false; }}
        onOk={submitFollow}
        confirmLoading={submitting}
        width={720}
        destroyOnClose
        okText="保存跟进"
      >
        <Form form={followForm} layout="vertical" preserve={false}>
          {followOpen && (
            <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div><Typography.Text strong>客户姓名：</Typography.Text><Typography.Text>{followOpen.customerName || '-'}</Typography.Text></div>
                <div><Typography.Text strong>联系方式：</Typography.Text><Typography.Text>{followOpen.contact || followOpen.phone || followOpen.wechat || '-'}</Typography.Text></div>
                <div><Typography.Text strong>IP 地址：</Typography.Text><Typography.Text>{followOpen.ip || '-'}</Typography.Text></div>
              </Space>
            </div>
          )}
          <div className="form-grid">
            <Form.Item name="clientDegree" label="客户学历">
              <AutoComplete
                allowClear
                placeholder="本科/硕士/博士..."
                maxLength={10}
                options={[
                  { value: '本科' },
                  { value: '硕士' },
                  { value: '博士' },
                  { value: '大专' },
                  { value: '在职' },
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
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.intentionLevel !== next.intentionLevel}>
              {({ getFieldValue }) => (
                getFieldValue('intentionLevel') === 'invalid' ? (
                  <Form.Item name="invalidReason" label="无效原因" rules={[{ required: true, message: '请选择无效原因' }]}>
                    <Select
                      allowClear
                      placeholder="请选择无效原因"
                      options={[
                        { label: '客户不需要', value: '客户不需要' },
                        { label: '客户预算不足', value: '客户预算不足' },
                        { label: '客户已流失', value: '客户已流失' },
                        { label: '联系方式错误', value: '联系方式错误' },
                        { label: '重复客资', value: '重复客资' },
                        { label: '其他', value: '其他' },
                      ]}
                    />
                  </Form.Item>
                ) : null
              )}
            </Form.Item>
            <Form.Item name="followAction" label="具体跟进措施">
              <Input placeholder="如：明天下午 3 点发修改方案" />
            </Form.Item>
            <Form.Item name="nextFollowTime" label="下次跟进时间" className="full-row">
              <DatePicker showTime format="YYYY/MM/DD HH:mm" style={{ width: '100%' }} placeholder="选择下次跟进时间" />
            </Form.Item>
            <Form.Item name="content" label="跟进备注" className="full-row" rules={[{ required: true, message: '请输入跟进内容' }]}>
              <Input.TextArea
                rows={3}
                placeholder="记录本次沟通重点和下一步动作（含「无效客资」会自动标记为无效意向）"
                onChange={(e) => {
                  const val = e.target.value || '';
                  if (val.includes('无效客资')) {
                    if (!autoSetInvalidRef.current) {
                      followForm.setFieldValue('intentionLevel', 'invalid');
                      autoSetInvalidRef.current = true;
                    }
                  } else {
                    autoSetInvalidRef.current = false;
                  }
                }}
              />
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
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.intentionLevel !== next.intentionLevel}>
            {({ getFieldValue }) => (
              getFieldValue('intentionLevel') === 'invalid' ? (
                <Form.Item name="invalidReason" label="无效原因" rules={[{ required: true, message: '请选择无效原因' }]}>
                  <Select
                    allowClear
                    placeholder="请选择无效原因"
                    options={[
                      { label: '客户不需要', value: '客户不需要' },
                      { label: '客户预算不足', value: '客户预算不足' },
                      { label: '客户已流失', value: '客户已流失' },
                      { label: '联系方式错误', value: '联系方式错误' },
                      { label: '重复客资', value: '重复客资' },
                      { label: '其他', value: '其他' },
                    ]}
                  />
                </Form.Item>
              ) : null
            )}
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
