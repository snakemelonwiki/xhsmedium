'use client';

import { EyeOutlined, SyncOutlined } from '@ant-design/icons';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { getLeadDetail, listCollaborationTasks, listLeadFollowRecords } from '@/shared/api/leads';
import { LeadTimeline } from '@/shared/components/leads';
import { StatusTag } from '@/shared/components/status';
import { useSubmitLock } from '@/shared/hooks/useSubmitLock';
import { formatDateTime } from '@/shared/utils/date-format';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';

type Period = 'today' | 'week' | 'month' | 'all';
type CollabStatus = 'pending' | 'handling' | 'handled' | 'closed' | 'timeout';

const COLLAB_TYPE_LABELS: Record<string, string> = {
  remind_customer: '提醒客户',
  supplement_info: '补充来源',
  verify_identity: '确认身份',
  second_touch: '二次触达',
};

const STATUS_OPTIONS = [
  { label: '待处理', value: 'pending' },
  { label: '处理中', value: 'handling' },
  { label: '已处理', value: 'handled' },
  { label: '已关闭', value: 'closed' },
  { label: '超时', value: 'timeout' },
];

export default function OperationCollaborationPage() {
  const [items, setItems] = useState<LeadTimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [period, setPeriod] = useState<Period>('all');
  const [statusFilter, setStatusFilter] = useState<CollabStatus | undefined>(undefined);
  const { submitting, run } = useSubmitLock();

  const [selectedItem, setSelectedItem] = useState<LeadTimelineItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTimeline, setDetailTimeline] = useState<LeadTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [handleOpen, setHandleOpen] = useState(false);
  const [handleForm] = Form.useForm();

  const load = useCallback(async function load(
    nextPage = pagination.current,
    nextPageSize = pagination.pageSize,
    nextPeriod = period,
    nextStatus = statusFilter,
  ) {
    setLoading(true);
    try {
      const query: Record<string, unknown> = {
        scope: 'inbox',
        page: nextPage,
        pageSize: nextPageSize,
      };
      if (nextStatus) query.status = nextStatus;

      const now = new Date();
      if (nextPeriod === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.from = start.toISOString().slice(0, 10);
        query.to = now.toISOString().slice(0, 10);
      } else if (nextPeriod === 'week') {
        const start = new Date(now);
        start.setDate(now.getDate() - 7);
        query.from = start.toISOString().slice(0, 10);
        query.to = now.toISOString().slice(0, 10);
      } else if (nextPeriod === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        query.from = start.toISOString().slice(0, 10);
        query.to = now.toISOString().slice(0, 10);
      }

      const result = await listCollaborationTasks(query as Parameters<typeof listCollaborationTasks>[0]);
      setItems(result.items);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } finally {
      setLoading(false);
    }
  }, [pagination.current, pagination.pageSize, period, statusFilter]);

  useEffect(() => {
    void load(1, pagination.pageSize, period, statusFilter).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = useCallback(async function openDetail(item: LeadTimelineItem) {
    setSelectedItem(item);
    setDetailOpen(true);
    setDetailLoading(true);
    setTimelineLoading(true);
    try {
      const leadId = String(item.extra?.leadId || item.extra?.id || '');
      const [lead, followRecords, collabsResult] = await Promise.all([
        leadId ? getLeadDetail(leadId).catch(() => undefined) : Promise.resolve(undefined),
        leadId ? listLeadFollowRecords(leadId).catch(() => []) : Promise.resolve([]),
        listCollaborationTasks({ scope: 'requester', leadId, pageSize: 50 }).catch(() => ({ items: [] })),
      ]);
      setDetailLead(lead ?? null);
      setDetailTimeline([...followRecords, ...(collabsResult.items ?? [])].sort((a, b) => {
        const ta = new Date(a.occurredAt).getTime();
        const tb = new Date(b.occurredAt).getTime();
        return tb - ta;
      }));
    } finally {
      setDetailLoading(false);
      setTimelineLoading(false);
    }
  }, []);

  async function handleTask(values: { handledNote: string }) {
    if (!selectedItem) return;
    await run(async () => {
      await apiClient.request(`/collaboration-tasks/${selectedItem.id}/handle`, {
        method: 'PUT',
        body: { handledNote: values.handledNote },
      });
      message.success('协同任务已处理');
      setHandleOpen(false);
      handleForm.resetFields();
      await load(pagination.current, pagination.pageSize, period, statusFilter);
    });
  }

  const columns: ProColumns<LeadTimelineItem>[] = [
    {
      title: '客户',
      width: 120,
      render: (_, record) => {
        const name = record.extra?.customerName || record.extra?.nickname || record.extra?.contactInfo || '-';
        return <Typography.Text>{name as string}</Typography.Text>;
      },
    },
    {
      title: '协同类型',
      width: 110,
      render: (_, record) => COLLAB_TYPE_LABELS[record.type || ''] || record.type || '-',
    },
    {
      title: '协同原因',
      width: 200,
      render: (_, record) => {
        const reason = record.content || record.extra?.reason || '-';
        return <Typography.Text ellipsis={{ tooltip: reason as string }}>{reason as string}</Typography.Text>;
      },
    },
    {
      title: '期望处理时间',
      width: 160,
      render: (_, record) => {
        const t = record.extra?.expectedHandleTime || record.extra?.expectTime;
        return t ? formatDateTime(String(t)) : '-';
      },
    },
    {
      title: '创建时间',
      dataIndex: 'occurredAt',
      width: 160,
      sorter: (a, b) => String(a.occurredAt || '').localeCompare(String(b.occurredAt || '')),
      render: (_, record) => formatDateTime(record.occurredAt),
    },
    {
      title: '状态',
      width: 100,
      render: (_, record) => <StatusTag kind="collaborationStatus" code={record.status} />,
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(record)}>
            详情
          </Button>
          {record.status === 'pending' || record.status === 'handling' ? (
            <Button
              size="small"
              type="primary"
              onClick={() => {
                void openDetail(record);
                setHandleOpen(true);
              }}
            >
              处理
            </Button>
          ) : null}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>协同处理</Typography.Title>
          <Typography.Paragraph type="secondary">处理销售发起的协同任务，包括提醒客户、补充来源、确认身份和二次触达。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={period}
            onChange={(v) => {
              setPeriod(v as Period);
              void load(1, pagination.pageSize, v as Period, statusFilter);
            }}
            options={[
              { label: '今日', value: 'today' },
              { label: '本周', value: 'week' },
              { label: '本月', value: 'month' },
              { label: '全部', value: 'all' },
            ]}
          />
          <Select
            allowClear
            placeholder="协同状态"
            style={{ width: 120 }}
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={(v) => {
              setStatusFilter(v);
              void load(1, pagination.pageSize, period, v);
            }}
          />
          <Button icon={<SyncOutlined spin={loading} />} onClick={() => void load()}>
            刷新
          </Button>
        </Space>
      </div>

      <Card>
        <ProTable<LeadTimelineItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={(next: TablePaginationConfig) => void load(next.current ?? 1, next.pageSize ?? 20, period, statusFilter)}
          locale={{ emptyText: <Empty description="暂无协同任务" /> }}
          search={false}
          options={false}
        />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title={`协同详情 - ${selectedItem?.title || ''}`}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetailLead(null);
          setDetailTimeline([]);
        }}
        footer={
          selectedItem && (selectedItem.status === 'pending' || selectedItem.status === 'handling') ? (
            <Button type="primary" onClick={() => setHandleOpen(true)}>
              处理协同
            </Button>
          ) : undefined
        }
        width={720}
      >
        <Spin spinning={detailLoading}>
          {selectedItem ? (
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              <Card size="small" title="协同信息">
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="协同类型">
                    {COLLAB_TYPE_LABELS[selectedItem.type || ''] || selectedItem.type || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="协同原因">
                    {selectedItem.content || String(selectedItem.extra?.reason || '-')}
                  </Descriptions.Item>
                  <Descriptions.Item label="期望处理时间">
                    {selectedItem.extra?.expectedHandleTime
                      ? formatDateTime(String(selectedItem.extra.expectedHandleTime))
                      : selectedItem.extra?.expectTime
                        ? formatDateTime(String(selectedItem.extra.expectTime))
                        : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <StatusTag kind="collaborationStatus" code={selectedItem.status} />
                  </Descriptions.Item>
                  <Descriptions.Item label="创建时间">{formatDateTime(selectedItem.occurredAt)}</Descriptions.Item>
                  <Descriptions.Item label="协同人">{selectedItem.actorName || '-'}</Descriptions.Item>
                </Descriptions>
              </Card>

              {detailLead ? (
                <Card size="small" title="客户信息">
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="客户名称">
                      {detailLead.customerName || detailLead.nickname || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="分配销售">{detailLead.sales?.name || '-'}</Descriptions.Item>
                    <Descriptions.Item label="来源平台">{detailLead.source?.platform || '-'}</Descriptions.Item>
                    <Descriptions.Item label="来源作品">
                      {detailLead.source?.postTitle || detailLead.source?.postId || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="添加状态">
                      <StatusTag kind="addStatus" code={detailLead.addStatus} />
                    </Descriptions.Item>
                    <Descriptions.Item label="处理状态">
                      <StatusTag kind="processStatus" code={detailLead.processStatus} />
                    </Descriptions.Item>
                    <Descriptions.Item label="协同状态" span={2}>
                      <StatusTag kind="collaborationStatus" code={detailLead.collaborationStatus} />
                    </Descriptions.Item>
                    <Descriptions.Item label="需求备注" span={2}>
                      {detailLead.requirementNote || '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label="运营备注" span={2}>
                      {detailLead.note || '-'}
                    </Descriptions.Item>
                  </Descriptions>
                </Card>
              ) : null}

              <Card size="small" title="时间线">
                <Spin spinning={timelineLoading}>
                  <LeadTimeline items={detailTimeline} />
                </Spin>
              </Card>
            </Space>
          ) : (
            <Empty description="加载失败" />
          )}
        </Spin>
      </Modal>

      {/* 处理协同弹窗 */}
      <Modal
        title="处理协同"
        open={handleOpen}
        onCancel={() => {
          setHandleOpen(false);
          handleForm.resetFields();
        }}
        footer={null}
      >
        <Form form={handleForm} layout="vertical" onFinish={handleTask}>
          <Form.Item name="handledNote" label="处理备注" rules={[{ required: true, message: '请输入处理备注' }]}>
            <Input.TextArea rows={4} placeholder="说明已完成的处理动作和结果" />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={submitting}>
              提交
            </Button>
            <Button
              onClick={() => {
                setHandleOpen(false);
                handleForm.resetFields();
              }}
            >
              取消
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
