'use client';

import { BellOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Card, Empty, Input, message, Modal, Select, Segmented, Space, Spin, Typography } from 'antd';
import type { TablePaginationConfig } from 'antd';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import { getLeadDetail, listCollaborationTasks, listLeadFollowRecords, listSalesLeads } from '@/shared/api/leads';
import { getAdminLeadsStats } from '@/shared/api/admin';
import { ReminderButton } from '@/shared/components/notifications/ReminderButton';
import { LeadTimeline } from '@/shared/components/leads';
import { StatusTag } from '@/shared/components/status';
import { CollaborationStatus } from '@/shared/constants/lead-status-enums';
import { formatDateTime } from '@/shared/utils/date-format';
import type { LeadTimelineItem, SalesLead } from '@/shared/types/leads';

import { buildOperationLeadsExportFilter } from './exportFilter';

type Period = 'today' | 'week' | 'month' | 'all' | 'custom';

type LeadFilters = {
  period: Period;
  from?: string;
  to?: string;
  platform?: string;
  sourceAccount?: string;
  sourcePost?: string;
  processStatus?: string;
  addStatus?: string;
  collaborationStatus?: string;
};

/** 手机号中间4位脱敏 */
function maskPhone(phone?: string): string {
  if (!phone) return '-';
  if (/^\d{7,}$/.test(phone)) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
  return phone.slice(0, 2) + '****' + phone.slice(-2);
}

/** 微信号中间脱敏 */
function maskWechat(wechat?: string): string {
  if (!wechat) return '-';
  if (wechat.length <= 4) return wechat;
  return wechat.slice(0, 2) + '****' + wechat.slice(-2);
}

export default function OperationLeadsPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>({ period: 'all' });
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });

  const [detailLead, setDetailLead] = useState<SalesLead | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTimeline, setDetailTimeline] = useState<LeadTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // 从 URL 参数初始化筛选条件
  useEffect(() => {
    const urlFrom = searchParams.get('from');
    const urlTo = searchParams.get('to');
    if (urlFrom && urlTo) {
      setFilters({ period: 'custom', from: urlFrom, to: urlTo });
    }
  }, [searchParams]);

  const loadLeadDetail = useCallback(async function loadLeadDetail(leadId: string) {
    setDetailLoading(true);
    setTimelineLoading(true);
    setDetailOpen(true);
    try {
      const [lead, followRecords, collabsResult] = await Promise.all([
        getLeadDetail(leadId).catch(() => undefined),
        listLeadFollowRecords(leadId).catch(() => []),
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

  /**
   * 构造与列表/统计完全一致的筛选 query（不含分页），
   * load / stats / export 三处共用，避免重复实现。
   */
  const buildQuery = useCallback(function buildQuery(src: LeadFilters = filters) {
    const query: Record<string, unknown> = {};
    if (src.platform) query.platform = src.platform;
    if (src.processStatus) query.processStatus = src.processStatus;
    if (src.addStatus) query.addStatus = src.addStatus;
    if (src.collaborationStatus) query.collaborationStatus = src.collaborationStatus;
    if (src.sourcePost) query.search = src.sourcePost;
    if (src.sourceAccount) query.sourceAccountId = src.sourceAccount;

    const now = new Date();
    if (src.period === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      query.from = start.toISOString().slice(0, 10);
      query.to = now.toISOString().slice(0, 10);
    } else if (src.period === 'week') {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      query.from = start.toISOString().slice(0, 10);
      query.to = now.toISOString().slice(0, 10);
    } else if (src.period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      query.from = start.toISOString().slice(0, 10);
      query.to = now.toISOString().slice(0, 10);
    } else if (src.period === 'custom' && src.from && src.to) {
      query.from = `${src.from} 00:00:00`;
      query.to = `${src.to} 23:59:59`;
    }
    return query;
  }, [filters]);

  const load = useCallback(async function load(
    nextPage = pagination.current,
    nextPageSize = pagination.pageSize,
    nextFilters = filters,
  ) {
    setLoading(true);
    try {
      const query: Record<string, unknown> = {
        scope: 'self',
        page: nextPage,
        pageSize: nextPageSize,
        ...buildQuery(nextFilters),
      };

      const result = await listSalesLeads(query as Parameters<typeof listSalesLeads>[0]);
      setItems(result.items);
      setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
    } finally {
      setLoading(false);
    }
  }, [buildQuery, filters, pagination.current, pagination.pageSize]);

  useEffect(() => {
    // 延迟加载，确保 URL 参数初始化完成
    const timer = setTimeout(() => {
      void load(1, pagination.pageSize, filters).catch(() => setItems([]));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function handleExport() {
    setExporting(true);
    try {
      // 1) 先用当前筛选条件查 total,无数据直接短路提示
      const statsResult = await getAdminLeadsStats({ scope: 'self', ...buildQuery() } as Parameters<typeof getAdminLeadsStats>[0]).catch(() => null);
      const total = statsResult?.total ?? 0;
      if (total === 0) {
        message.warning('当前筛选条件下无数据,无需导出');
        return;
      }
      // 2) 有数据:走 createExport + 轮询 + 自动下载
      const hide = message.loading('正在生成导出文件...', 0);
      try {
        const result = await createExport({
          exportType: 'leads',
          filter: buildOperationLeadsExportFilter({
            page: pagination.current,
            pageSize: pagination.pageSize,
            platform: filters.platform,
            status: filters.processStatus,
            search: filters.sourcePost,
          }),
        });

        if (!result?.id) {
          hide();
          message.warning('导出任务已创建，请在导出中心查看进度');
          return;
        }

        let attempts = 0;
        const maxAttempts = 30;
        while (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const exportTask = await getExport(result.id);
          if (exportTask.status === 'completed' || exportTask.status === 'success') {
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
      } catch (err) {
        hide();
        message.error(err instanceof Error ? err.message : '导出失败');
      }
    } finally {
      setExporting(false);
    }
  }

  const columns: ProColumns<SalesLead>[] = [
    {
      title: '客户',
      dataIndex: 'customerName',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{record.customerName || record.nickname || `客资 ${record.id}`}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {maskPhone(record.phone || record.contact)} / {maskWechat(record.wechat)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '来源作品',
      width: 150,
      render: (_, record) => record.source?.postTitle || record.source?.postId || '-',
    },
    {
      title: '来源账号',
      width: 120,
      render: (_, record) => record.source?.accountName || record.source?.accountId || '-',
    },
    {
      title: '分配销售',
      width: 100,
      render: (_, record) => record.sales?.name || record.sales?.id || '-',
    },
    {
      title: '添加状态',
      width: 100,
      render: (_, record) => <StatusTag kind="addStatus" code={record.addStatus} />,
    },
    {
      title: '协同状态',
      width: 100,
      render: (_, record) => <StatusTag kind="collaborationStatus" code={record.collaborationStatus} />,
    },
    {
      title: '处理状态',
      width: 100,
      render: (_, record) => <StatusTag kind="processStatus" code={record.processStatus} />,
    },
    {
      title: '最后更新',
      dataIndex: 'updatedAt',
      width: 160,
      sorter: (a, b) => String(a.updatedAt || '').localeCompare(String(b.updatedAt || '')),
      render: (_, record) => formatDateTime(record.updatedAt || record.latestFollowAt),
    },
    {
      title: '操作',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const recipientId = record.sales?.id ? String(record.sales.id) : '';
        const recipientName = record.sales?.name ? String(record.sales.name) : '';
        const hasContact = Boolean(record.contact || record.phone);
        return (
          <Space size={4} wrap>
            <Button size="small" icon={<EyeOutlined />} onClick={() => void loadLeadDetail(String(record.id))}>
              详情
            </Button>
            <ReminderButton
              size="small"
              recipientId={recipientId}
              recipientRole="sales"
              relatedType="lead"
              relatedId={String(record.id || '')}
              content={
                hasContact
                  ? `请关注客资 ${record.customerName || record.nickname || record.id} 的最新跟进情况`
                  : `运营端提醒：关注客资 ${record.customerName || record.nickname || record.id}`
              }
              disabled={!recipientId}
            >
              提醒销售
            </ReminderButton>
            {!recipientId ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {recipientName ? `${recipientName}(未关联用户)` : '未分配'}
              </Typography.Text>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>运营客资看板</Typography.Title>
          <Typography.Paragraph type="secondary">回看自己录入客资的分配、添加、跟进和协同状态。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={filters.period}
            onChange={(value) => {
              const next = { ...filters, period: value as Period };
              setFilters(next);
              void load(1, pagination.pageSize, next);
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
            aria-label="筛选平台"
            placeholder="全部平台"
            style={{ width: 120 }}
            value={filters.platform}
            options={[
              { label: '小红书', value: 'xiaohongshu' },
              { label: '抖音', value: 'douyin' },
            ]}
            onChange={(platform) => {
              const next = { ...filters, platform };
              setFilters(next);
              void load(1, pagination.pageSize, next);
            }}
          />
          <Select
            allowClear
            aria-label="筛选处理状态"
            placeholder="处理状态"
            style={{ width: 120 }}
            value={filters.processStatus}
            options={[
              { label: '未联系', value: 'not_contacted' },
              { label: '待通过', value: 'waiting_pass' },
              { label: '沟通中', value: 'communicating' },
              { label: '已报价', value: 'quoted' },
              { label: '待成交', value: 'deal_pending' },
              { label: '已成交', value: 'deal_done' },
              { label: '无效', value: 'invalid' },
            ]}
            onChange={(processStatus) => {
              const next = { ...filters, processStatus };
              setFilters(next);
              void load(1, pagination.pageSize, next);
            }}
          />
          <Select
            allowClear
            aria-label="筛选添加状态"
            placeholder="添加状态"
            style={{ width: 130 }}
            value={filters.addStatus}
            options={[
              { label: '未添加', value: 'not_added' },
              { label: '已申请', value: 'applied' },
              { label: '未通过', value: 'not_passed' },
              { label: '运营已提醒', value: 'operation_reminded' },
              { label: '已添加', value: 'added' },
            ]}
            onChange={(addStatus) => {
              const next = { ...filters, addStatus };
              setFilters(next);
              void load(1, pagination.pageSize, next);
            }}
          />
          <Select
            allowClear
            aria-label="筛选协同状态"
            placeholder="协同状态"
            style={{ width: 130 }}
            value={filters.collaborationStatus}
            options={[
              { label: '无', value: 'none' },
              { label: '协同中', value: 'pending' },
              { label: '处理中', value: 'handling' },
              { label: '已处理', value: 'handled' },
            ]}
            onChange={(collaborationStatus) => {
              const next = { ...filters, collaborationStatus };
              setFilters(next);
              void load(1, pagination.pageSize, next);
            }}
          />
          <Input.Search
            allowClear
            placeholder="搜索来源作品"
            style={{ width: 160 }}
            onSearch={(sourcePost) => {
              const next = { ...filters, sourcePost };
              setFilters(next);
              void load(1, pagination.pageSize, next);
            }}
          />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            导出
          </Button>
          <Button onClick={() => void load()}>刷新</Button>
        </Space>
      </div>
      <Card>
        <ProTable<SalesLead>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={(next: TablePaginationConfig) => void load(next.current ?? 1, next.pageSize ?? 20, filters)}
          locale={{ emptyText: <Empty description="暂无客资" /> }}
          search={false}
          options={false}
        />
      </Card>

      {/* 客资详情弹窗 */}
      <Modal
        title={`客资详情 - ${detailLead?.customerName ?? ''}`}
        open={detailOpen}
        onCancel={() => {
          setDetailOpen(false);
          setDetailLead(null);
          setDetailTimeline([]);
        }}
        footer={null}
        width={720}
      >
        <Spin spinning={detailLoading}>
          {detailLead ? (
            <>
              <Card size="small" style={{ marginBottom: 16 }}>
                <Space wrap size={16}>
                  <Typography.Text>
                    添加状态：<StatusTag kind="addStatus" code={detailLead.addStatus} />
                  </Typography.Text>
                  <Typography.Text>
                    协同状态：<StatusTag kind="collaborationStatus" code={detailLead.collaborationStatus} />
                  </Typography.Text>
                  <Typography.Text>
                    处理状态：<StatusTag kind="processStatus" code={detailLead.processStatus} />
                  </Typography.Text>
                </Space>
              </Card>
              <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <Typography.Text>客户昵称：{detailLead.customerName || detailLead.nickname || '-'}</Typography.Text>
                  <Typography.Text>手机号：{maskPhone(detailLead.phone || detailLead.contact)}</Typography.Text>
                  <Typography.Text>微信号：{maskWechat(detailLead.wechat)}</Typography.Text>
                  <Typography.Text>IP/地区：{detailLead.ip || '-'}</Typography.Text>
                  <Typography.Text>需求备注：{detailLead.requirementNote || '-'}</Typography.Text>
                  <Typography.Text>来源平台：{detailLead.source?.platform || '-'}</Typography.Text>
                  <Typography.Text>
                    来源账号：{detailLead.source?.accountName || detailLead.source?.accountId || '-'}
                  </Typography.Text>
                  <Typography.Text>
                    来源作品：{detailLead.source?.postTitle || detailLead.source?.postId || '-'}
                  </Typography.Text>
                  <Typography.Text>分配销售：{detailLead.sales?.name || detailLead.sales?.id || '-'}</Typography.Text>
                  <Typography.Text>运营备注：{detailLead.note || '-'}</Typography.Text>
                  <Typography.Text>主管备注：{detailLead.supervisorNote || '-'}</Typography.Text>
                  <Typography.Text type="secondary">
                    最后更新：{formatDateTime(detailLead.updatedAt || detailLead.latestFollowAt)}
                  </Typography.Text>
                </Space>
              </Card>
              <Card size="small" title="跟进/协同时间线">
                <Spin spinning={timelineLoading}>
                  <LeadTimeline items={detailTimeline} />
                </Spin>
              </Card>
            </>
          ) : (
            <Empty description="加载失败" />
          )}
        </Spin>
      </Modal>
    </Space>
  );
}
