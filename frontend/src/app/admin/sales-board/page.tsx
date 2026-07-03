'use client';

import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';

import { listLeadFollowRecords } from '@/shared/api/leads';
import type { LeadTimelineItem } from '@/shared/types/leads';
import { listAdminLeads } from '@/shared/api/admin';
import { createSupervisorSuggestion } from '@/shared/api/supervisor-suggestions';
import { platformKeyToDisplay } from '@/shared/utils/platform-key';
import type { AdminLead } from '@/shared/types/admin';
import {
  ADD_STATUS_CONFIG,
  LEAD_STATUS_CONFIG,
  PROCESS_STATUS_CONFIG,
} from '@/shared/constants/lead-status';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const INTENTION_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: '高意向', color: 'red' },
  middle: { label: '中意向', color: 'orange' },
  low: { label: '低意向', color: 'blue' },
  pending: { label: '待评估', color: 'default' },
};

// --- debounce hook (手写，无 lodash 依赖) ---
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const DEAL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  not_deal: { label: '未成交', color: 'default' },
  pending: { label: '待成交', color: 'processing' },
  done: { label: '已成交', color: 'success' },
  invalid: { label: '无效', color: 'default' },
};

type SalesGroup = {
  salesId: string | null;
  salesName: string;
  leads: AdminLead[];
  dealCount: number;
  dealAmountSum: number;
};

function getStatusTag(code?: string) {
  if (!code) return <Tag>-</Tag>;
  const cfg = LEAD_STATUS_CONFIG[code as keyof typeof LEAD_STATUS_CONFIG];
  return <Tag color={cfg?.color ?? 'default'}>{cfg?.label ?? code}</Tag>;
}

function getProcessTag(code?: string) {
  if (!code) return <Tag>-</Tag>;
  const cfg = PROCESS_STATUS_CONFIG[code as keyof typeof PROCESS_STATUS_CONFIG];
  return <Tag color={cfg?.color ?? 'default'}>{cfg?.label ?? code}</Tag>;
}

function getAddStatusTag(code?: string) {
  if (!code) return null;
  const cfg = ADD_STATUS_CONFIG[code as keyof typeof ADD_STATUS_CONFIG];
  if (!cfg) return null;
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function getIntentionTag(code?: string) {
  if (!code) return null;
  const cfg = INTENTION_LABELS[code] ?? { label: code, color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function getDealTag(code?: string) {
  if (!code) return null;
  const cfg = DEAL_STATUS_LABELS[code] ?? { label: code, color: 'default' };
  return <Tag color={cfg.color}>{cfg.label}</Tag>;
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const d = dayjs(value);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '-';
}

function groupBySales(items: AdminLead[]): SalesGroup[] {
  const map = new Map<string, SalesGroup>();
  items.forEach((lead) => {
    const salesId = lead.assignedSalesUserId ?? null;
    const key = salesId ?? '__unassigned__';
    const salesName = lead.salesName ?? (salesId ? '未知销售' : '未分配');
    let group = map.get(key);
    if (!group) {
      group = { salesId, salesName, leads: [], dealCount: 0, dealAmountSum: 0 };
      map.set(key, group);
    }
    group.leads.push(lead);
    if (lead.dealStatus === 'done') {
      group.dealCount += 1;
      const amount = Number(lead.dealAmount ?? 0);
      if (Number.isFinite(amount)) group.dealAmountSum += amount;
    }
  });
  // 已分配的销售在前，未分配的在最后；按客资数降序
  return Array.from(map.values()).sort((a, b) => {
    if (a.salesId === null && b.salesId !== null) return 1;
    if (b.salesId === null && a.salesId !== null) return -1;
    return b.leads.length - a.leads.length;
  });
}

/**
 * 销售看板（Phase B）。
 * 按销售归属分组列出所有客资，展示每条客资的跟进进度；行末有"建议"按钮，
 * 提交后调用 POST /supervisor-suggestions（targetType=lead），后端会通知该客资归属销售。
 */
export default function AdminSalesBoardPage() {
  const { message: messageApi } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AdminLead[]>([]);
  const [total, setTotal] = useState(0);
  const [rawKeyword, setRawKeyword] = useState('');
  const keyword = useDebouncedValue(rawKeyword, 300);

  const [suggestModalOpen, setSuggestModalOpen] = useState(false);
  const [activeLead, setActiveLead] = useState<AdminLead | undefined>();
  const [suggestForm] = Form.useForm<{ content: string }>();
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await listAdminLeads({ page: 1, pageSize: 500 });
      setItems(res.items);
      setTotal(res.total ?? res.items.length);
    } catch (err) {
      messageApi.error((err as Error)?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredItems = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((lead) =>
      [lead.customerName, lead.contact, lead.salesName, lead.followAction]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(kw)),
    );
  }, [items, keyword]);

  const groups = useMemo(() => groupBySales(filteredItems), [filteredItems]);

  const summary = useMemo(() => {
    const totalLeads = filteredItems.length;
    const totalDeals = filteredItems.filter((l) => l.dealStatus === 'done').length;
    const totalAmount = filteredItems.reduce((sum, l) => {
      if (l.dealStatus !== 'done') return sum;
      const amount = Number(l.dealAmount ?? 0);
      return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0);
    return { totalLeads, totalDeals, totalAmount, salesCount: groups.length };
  }, [filteredItems, groups]);

  function openSuggestModal(lead: AdminLead) {
    setActiveLead(lead);
    suggestForm.resetFields();
    setSuggestModalOpen(true);
  }

  async function submitSuggest(values: { content: string }) {
    if (!activeLead) return;
    setSubmitting(true);
    try {
      const res = await createSupervisorSuggestion({
        targetType: 'lead',
        targetId: activeLead.id,
        content: values.content,
      });
      if (res.ok) {
        messageApi.success('建议已发送，销售将收到通知');
        setSuggestModalOpen(false);
        suggestForm.resetFields();
      } else {
        messageApi.error(res.message || '发送失败');
      }
    } catch (err) {
      messageApi.error((err as Error)?.message || '发送失败');
    } finally {
      setSubmitting(false);
    }
  }

  // --- 跟进详情弹窗 state ---
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followRecords, setFollowRecords] = useState<LeadTimelineItem[]>([]);
  const [followLoading, setFollowLoading] = useState(false);

  function openFollowModal(lead: AdminLead) {
    setActiveLead(lead);
    setFollowRecords([]);
    setFollowModalOpen(true);
    setFollowLoading(true);
    listLeadFollowRecords(lead.id)
      .then((items) => setFollowRecords(items))
      .catch((err) => messageApi.error((err as Error)?.message || '加载跟进详情失败'))
      .finally(() => setFollowLoading(false));
  }

  const columns: ColumnsType<AdminLead> = [
    {
      title: '客资',
      key: 'customer',
      width: 180,
      render: (_v, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{record.customerName}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.contact ?? '-'}</Text>
        </Space>
      ),
    },
    {
      title: '来源',
      key: 'source',
      width: 200,
      render: (_v, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>{record.sourcePostTitle ?? '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {platformKeyToDisplay(record.platform) || record.platform || '-'} · {record.sourceAccountName ?? '-'}
          </Text>
        </Space>
      ),
    },
    {
      title: '主状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => getStatusTag(v),
    },
    {
      title: '处理',
      dataIndex: 'processStatus',
      key: 'processStatus',
      width: 90,
      render: (v?: string) => getProcessTag(v),
    },
    {
      title: '添加',
      dataIndex: 'addStatus',
      key: 'addStatus',
      width: 100,
      render: (v?: string) => getAddStatusTag(v) ?? <Text type="secondary">-</Text>,
    },
    {
      title: '意向',
      dataIndex: 'intentionLevel',
      key: 'intentionLevel',
      width: 80,
      render: (v?: string) => getIntentionTag(v) ?? <Text type="secondary">-</Text>,
    },
    {
      title: '最新动作',
      key: 'followAction',
      width: 220,
      render: (_v, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 12 }}>{record.followAction ?? '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDateTime(record.followActionAt)}
          </Text>
        </Space>
      ),
    },
    {
      title: '下次跟进',
      dataIndex: 'nextFollowTime',
      key: 'nextFollowTime',
      width: 130,
      render: (v?: string) => <Text style={{ fontSize: 12 }}>{formatDateTime(v)}</Text>,
    },
    {
      title: '成交',
      key: 'deal',
      width: 130,
      render: (_v, record) => (
        <Space direction="vertical" size={2}>
          {getDealTag(record.dealStatus) ?? <Text type="secondary">-</Text>}
          {record.dealStatus === 'done' && record.dealAmount && (
            <Text strong style={{ fontSize: 12 }}>¥{Number(record.dealAmount).toLocaleString()}</Text>
          )}
        </Space>
      ),
    },
    {
      title: '主管备注',
      dataIndex: 'supervisorNote',
      key: 'supervisorNote',
      width: 180,
      ellipsis: true,
      render: (v?: string) => v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_v, record) => (
        <Space direction="horizontal" size={4}>
          <Button size="small" type="link" onClick={() => openFollowModal(record)}>
            跟进详情
          </Button>
          <Button size="small" type="link" onClick={() => openSuggestModal(record)}>
            建议
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Title level={2}>销售看板</Title>
        <Paragraph type="secondary">
          按销售归属查看每条客资的跟进进度；对任意客资点击「建议」可向该销售发送主管建议，销售会收到站内通知。
        </Paragraph>
      </div>

      {/* 顶部统计 */}
      <div className="metric-grid">
        <Card><Statistic title="销售人数" value={summary.salesCount} /></Card>
        <Card><Statistic title="客资总数" value={summary.totalLeads} /></Card>
        <Card><Statistic title="已成交" value={summary.totalDeals} /></Card>
        <Card><Statistic title="成交总额" value={summary.totalAmount} precision={2} prefix="¥" /></Card>
      </div>

      {/* 截断提示 */}
      {total > items.length && (
        <Alert
          type="info"
          showIcon
          message={`仅展示最新 500 条客资，如需查看更多请使用筛选条件（当前共 ${total} 条）`}
        />
      )}

      {/* 搜索 */}
      <Card size="small">
        <Space wrap>
          <Input.Search
            allowClear
            placeholder="搜索客资姓名/联系方式/销售/跟进动作"
            style={{ width: 320 }}
            value={rawKeyword}
            onChange={(e) => setRawKeyword(e.target.value)}
          />
          <Button onClick={() => void load()}>刷新</Button>
        </Space>
      </Card>

      {/* 销售分组列表 */}
      <Spin spinning={loading}>
        {groups.length === 0 ? (
          <Card><Empty description="暂无客资" /></Card>
        ) : (
          <Collapse
            defaultActiveKey={groups.slice(0, 3).map((g) => g.salesId ?? '__unassigned__')}
            items={groups.map((g) => ({
              key: g.salesId ?? '__unassigned__',
              label: (
                <Space size={16}>
                  <Text strong>{g.salesName}</Text>
                  <Text type="secondary">客资 {g.leads.length}</Text>
                  <Text type="secondary">成交 {g.dealCount}</Text>
                  {g.dealAmountSum > 0 && (
                    <Text type="secondary">合计 ¥{g.dealAmountSum.toLocaleString()}</Text>
                  )}
                </Space>
              ),
              children: (
                <Table<AdminLead>
                  rowKey="id"
                  size="small"
                  columns={columns}
                  dataSource={g.leads}
                  pagination={g.leads.length > 20 ? { pageSize: 20, size: 'small' } : false}
                  scroll={{ x: 1500 }}
                />
              ),
            }))}
          />
        )}
      </Spin>

      {/* 跟进详情弹窗 */}
      <Modal
        title={activeLead ? `「${activeLead.customerName}」跟进详情` : '跟进详情'}
        open={followModalOpen}
        onCancel={() => {
          setFollowModalOpen(false);
          setFollowRecords([]);
          setActiveLead(undefined);
        }}
        footer={null}
        width={560}
        destroyOnClose
      >
        <Spin spinning={followLoading}>
          {followRecords.length === 0 && !followLoading ? (
            <Empty description="暂无跟进记录" />
          ) : (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {followRecords.map((item) => (
                <Card key={item.id} size="small" style={{ background: '#fafafa' }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>{item.title}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatDateTime(item.occurredAt)}
                      </Text>
                    </Space>
                    {item.actorName && (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        跟进人：{item.actorName}
                      </Text>
                    )}
                    {item.content && (
                      <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                        {item.content}
                      </Paragraph>
                    )}
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </Spin>
      </Modal>

      {/* 主管建议弹窗 */}
      <Modal
        title={activeLead ? `给「${activeLead.salesName ?? '未分配'}」留主管建议` : '主管建议'}
        open={suggestModalOpen}
        onCancel={() => {
          setSuggestModalOpen(false);
          setActiveLead(undefined);
        }}
        onOk={() => suggestForm.submit()}
        confirmLoading={submitting}
        destroyOnClose
      >
        {activeLead && (
          <Paragraph type="secondary" style={{ marginTop: 0 }}>
            客资：<Text strong>{activeLead.customerName}</Text>
            {activeLead.contact ? ` · ${activeLead.contact}` : ''}
          </Paragraph>
        )}
        <Form form={suggestForm} layout="vertical" onFinish={submitSuggest} preserve={false}>
          <Form.Item
            name="content"
            label="建议内容"
            rules={[
              { required: true, message: '请输入建议内容' },
              { max: 1000, message: '内容最多 1000 字' },
            ]}
          >
            <TextArea rows={5} placeholder="对销售的跟进策略给出建议..." maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
