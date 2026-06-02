'use client';

import { BellOutlined, DownloadOutlined, ReloadOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Input, message, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType, TablePaginationConfig } from 'antd';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { listAdminLeads } from '@/shared/api/admin';
import { listAssignableSalesUsers, type CatalogOption } from '@/shared/api/catalog';
import { createExport } from '@/shared/api/exports';
import { getStatusMeta } from '@/shared/constants/status';
import type { AdminLead } from '@/shared/types/admin';

import { buildLeadsExportFilter } from './exportFilter';
import { buildLeadReassignPayload, buildLeadReminderPayload } from './leadActions';

const DEFAULT_PAGE_SIZE = 20;

function formatDate(value?: string): string {
  if (!value) return '-';
  return value.slice(0, 10);
}

export default function AdminLeadsPage() {
  const [rows, setRows] = useState<AdminLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0 });
  const [salesUsers, setSalesUsers] = useState<CatalogOption[]>([]);
  const [reassignLead, setReassignLead] = useState<AdminLead | null>(null);
  const [reminderLead, setReminderLead] = useState<AdminLead | null>(null);
  const [selectedSalesUserId, setSelectedSalesUserId] = useState<string>();
  const [reminderNote, setReminderNote] = useState('');

  const loadData = (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    setError(false);
    listAdminLeads({ page, pageSize })
      .then((result) => {
        setRows(result.items);
        setPagination({ current: result.page, pageSize: result.pageSize, total: result.total });
      })
      .catch(() => {
        setRows([]);
        setPagination((current) => ({ ...current, total: 0 }));
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData(1, DEFAULT_PAGE_SIZE);
    listAssignableSalesUsers()
      .then(setSalesUsers)
      .catch(() => setSalesUsers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openReassign = (lead: AdminLead) => {
    setReassignLead(lead);
    setSelectedSalesUserId(undefined);
  };

  const openReminder = (lead: AdminLead) => {
    setReminderLead(lead);
    setReminderNote('');
  };

  const columns: TableColumnsType<AdminLead> = [
    { title: '客户', dataIndex: 'customerName', key: 'customerName', render: (value: string) => value || '未命名客户' },
    { title: '联系方式', dataIndex: 'contact', key: 'contact', render: (value?: string) => value || '-' },
    { title: '平台', dataIndex: 'platform', key: 'platform', render: (value?: string) => value || '-' },
    { title: '运营', dataIndex: 'operatorName', key: 'operatorName', render: (value?: string) => value || '-' },
    { title: '销售', dataIndex: 'salesName', key: 'salesName', render: (value?: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => {
        const meta = getStatusMeta('leadStatus', value);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '跟进',
      dataIndex: 'processStatus',
      key: 'processStatus',
      render: (value?: string) => {
        const meta = getStatusMeta('processStatus', value);
        return value ? <Tag color={meta.color}>{meta.label}</Tag> : '-';
      },
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: formatDate },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, row) => (
        <Space size={8} wrap>
          <Button size="small" icon={<SwapOutlined />} onClick={() => openReassign(row)}>
            改派
          </Button>
          <Button size="small" icon={<BellOutlined />} onClick={() => openReminder(row)}>
            提醒
          </Button>
        </Space>
      ),
    },
  ];

  const handleTableChange = (next: TablePaginationConfig) => {
    loadData(next.current ?? 1, next.pageSize ?? DEFAULT_PAGE_SIZE);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await createExport({
        exportType: 'leads',
        filter: buildLeadsExportFilter({
          page: pagination.current,
          pageSize: pagination.pageSize,
        }),
      });
      message.success('已创建客资导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资导出创建失败');
    } finally {
      setExporting(false);
    }
  };

  const confirmReassign = async () => {
    if (!reassignLead || !selectedSalesUserId) {
      message.warning('请选择要改派的销售');
      return;
    }
    const salesUser = salesUsers.find((item) => item.id === selectedSalesUserId);
    if (!salesUser) {
      message.warning('销售候选不存在，请刷新后重试');
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.request(`/leads/${encodeURIComponent(reassignLead.id)}`, {
        method: 'PUT',
        body: buildLeadReassignPayload(salesUser),
      });
      message.success('客资已改派');
      setReassignLead(null);
      loadData();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '客资改派失败');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmReminder = async () => {
    if (!reminderLead) return;
    setActionLoading(true);
    try {
      await apiClient.post(
        `/leads/${encodeURIComponent(reminderLead.id)}/remind`,
        buildLeadReminderPayload(reminderLead, reminderNote),
      );
      message.success('提醒已发送');
      setReminderLead(null);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '提醒发送失败');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>主管客资</Typography.Title>
          <Typography.Paragraph type="secondary">查看全部客资、销售归属和跟进状态。</Typography.Paragraph>
        </div>
        <Space wrap>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            当前筛选导出
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => loadData()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>
      <Card>
        <Table<AdminLead>
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={{ ...pagination, showSizeChanger: true }}
          onChange={handleTableChange}
          locale={{ emptyText: <Empty description={error ? '客资加载失败' : '暂无客资'} /> }}
        />
      </Card>
      <Modal
        title="改派客资"
        open={Boolean(reassignLead)}
        onCancel={() => setReassignLead(null)}
        onOk={confirmReassign}
        confirmLoading={actionLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {reassignLead ? `${reassignLead.customerName} 当前销售：${reassignLead.salesName || '未分配'}` : ''}
          </Typography.Text>
          <Select
            showSearch
            placeholder="选择新的销售"
            value={selectedSalesUserId}
            onChange={setSelectedSalesUserId}
            options={salesUsers.map((item) => ({ label: item.name, value: item.id }))}
            optionFilterProp="label"
            style={{ width: '100%' }}
          />
        </Space>
      </Modal>
      <Modal
        title="发送跟进提醒"
        open={Boolean(reminderLead)}
        onCancel={() => setReminderLead(null)}
        onOk={confirmReminder}
        confirmLoading={actionLoading}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            {reminderLead ? `${reminderLead.customerName} / ${reminderLead.salesName || '未分配销售'}` : ''}
          </Typography.Text>
          <Input.TextArea
            rows={4}
            value={reminderNote}
            onChange={(event) => setReminderNote(event.target.value)}
            placeholder="填写提醒内容，留空将使用默认提醒"
          />
        </Space>
      </Modal>
    </Space>
  );
}
