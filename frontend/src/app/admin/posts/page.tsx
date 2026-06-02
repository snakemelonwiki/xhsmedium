'use client';

import { DownloadOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Image, Input, message, Modal, Pagination, Select, Space, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { createExport } from '@/shared/api/exports';

import { buildPostExportFilter, getPostDetailDisplay } from './postDetail';

type AdminPost = {
  id: string;
  employeeId: string;
  accountId: string;
  platform: string;
  postType: string;
  title: string;
  postUrl?: string | null;
  traffic?: number;
  likes?: number;
  comments?: number;
  favorites?: number;
  copywriting?: string | null;
  coverImageUrl?: string | null;
  coverThumbUrl?: string | null;
  supervisorSuggestion?: string | null;
  publishedAt?: string;
  employeeName?: string | null;
  accountName?: string | null;
};

type Employee = { id: string; name: string };

/**
 * 主管端作品看板：跨员工聚合作品列表，支持员工 / 平台 / 关键字筛选。
 */
export default function AdminPostsPage() {
  const [items, setItems] = useState<AdminPost[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>();
  const [platform, setPlatform] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [selectedPost, setSelectedPost] = useState<AdminPost | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState('');

  async function load(nextPage = page, nextPageSize = pageSize, eId = employeeId, pf = platform, kw = keyword) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (eId) query.employeeId = eId;
      if (pf) query.platform = pf;
      if (kw) query.search = kw;
      const payload = await apiClient.get<any>('/posts', { query });
      const data = payload?.items ?? payload ?? [];
      const totalCount = payload?.total ?? data.length;
      setItems(Array.isArray(data) ? data : []);
      setTotal(totalCount);
      setPage(nextPage);
      setPageSize(nextPageSize);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployees() {
    try {
      const payload = await apiClient.get<any>('/employees');
      const data = payload?.items ?? payload ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    }
  }

  async function openDetail(row: AdminPost) {
    setSelectedPost(row);
    setSuggestionDraft(row.supervisorSuggestion || '');
    setDetailLoading(true);
    try {
      const detail = await apiClient.get<AdminPost>(`/posts/${encodeURIComponent(row.id)}`);
      const merged = { ...row, ...detail };
      setSelectedPost(merged);
      setSuggestionDraft(merged.supervisorSuggestion || '');
    } catch (err) {
      message.warning(err instanceof Error ? err.message : '作品详情加载失败，已展示列表数据');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await createExport({ exportType: 'posts', filter: buildPostExportFilter({ employeeId, platform, keyword }) });
      message.success('已创建作品导出任务，可到导出中心下载');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '作品导出创建失败');
    } finally {
      setExporting(false);
    }
  }

  async function saveSuggestion() {
    if (!selectedPost) return;
    setSavingSuggestion(true);
    try {
      await apiClient.request(`/posts/${encodeURIComponent(selectedPost.id)}/supervisor-suggestion`, {
        method: 'PUT',
        body: { supervisorSuggestion: suggestionDraft },
      });
      setSelectedPost({ ...selectedPost, supervisorSuggestion: suggestionDraft });
      setItems((current) => current.map((item) => (
        item.id === selectedPost.id ? { ...item, supervisorSuggestion: suggestionDraft } : item
      )));
      message.success('主管建议已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '主管建议保存失败');
    } finally {
      setSavingSuggestion(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<AdminPost> = [
    { title: '员工', dataIndex: 'employeeName', render: (v, r) => v || r.employeeId },
    { title: '账号', dataIndex: 'accountName', render: (v, r) => v || r.accountId },
    { title: '平台', dataIndex: 'platform', width: 80 },
    { title: '类型', dataIndex: 'postType', width: 90 },
    { title: '标题', dataIndex: 'title', render: (v, r) => r.postUrl ? <a href={r.postUrl} target="_blank" rel="noreferrer">{v}</a> : v },
    { title: '流量', dataIndex: 'traffic', width: 80 },
    { title: '赞', dataIndex: 'likes', width: 70 },
    { title: '评', dataIndex: 'comments', width: 70 },
    { title: '藏', dataIndex: 'favorites', width: 70 },
    { title: '发布日', dataIndex: 'publishedAt', width: 110 },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, row) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  const detailDisplay = selectedPost ? getPostDetailDisplay(selectedPost) : null;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>作品看板</Typography.Title>
        <Typography.Paragraph type="secondary">查看跨员工的作品聚合数据。</Typography.Paragraph>
      </div>
      <Card>
        <Space size={12} wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="选择员工"
            style={{ width: 180 }}
            value={employeeId}
            onChange={(v) => { setEmployeeId(v); void load(1, pageSize, v, platform, keyword); }}
            options={employees.map((e) => ({ label: e.name || e.id, value: e.id }))}
          />
          <Select
            allowClear
            placeholder="平台"
            style={{ width: 120 }}
            value={platform}
            onChange={(v) => { setPlatform(v); void load(1, pageSize, employeeId, v, keyword); }}
            options={[{ label: '小红书', value: '小红书' }, { label: '抖音', value: '抖音' }]}
          />
          <Input.Search
            allowClear
            placeholder="搜索标题/文案"
            style={{ width: 240 }}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={(v) => load(1, pageSize, employeeId, platform, v)}
          />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            当前筛选导出
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无作品" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          showSizeChanger
          onChange={(p, ps) => load(p, ps)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>
      <Modal
        title={selectedPost?.title || '作品详情'}
        open={Boolean(selectedPost)}
        onCancel={() => setSelectedPost(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedPost(null)}>关闭</Button>,
          <Button key="save" type="primary" loading={savingSuggestion} onClick={saveSuggestion}>保存建议</Button>,
        ]}
        width={760}
      >
        {selectedPost && detailDisplay ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space size={12} wrap>
              <Typography.Text type="secondary">员工：{selectedPost.employeeName || selectedPost.employeeId}</Typography.Text>
              <Typography.Text type="secondary">账号：{selectedPost.accountName || selectedPost.accountId}</Typography.Text>
              <Typography.Text type="secondary">平台：{selectedPost.platform || '-'}</Typography.Text>
              <Typography.Text type="secondary">类型：{selectedPost.postType || '-'}</Typography.Text>
            </Space>
            <Card size="small" loading={detailLoading}>
              <Typography.Text strong>完整文案</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginTop: 8, marginBottom: 0 }}>
                {detailDisplay.copywriting}
              </Typography.Paragraph>
            </Card>
            <Space size={12} wrap>
              {detailDisplay.metrics.map((metric) => (
                <Card size="small" key={metric.label} style={{ width: 110 }}>
                  <Statistic title={metric.label} value={metric.value} />
                </Card>
              ))}
            </Space>
            <Card size="small">
              <Typography.Text strong>截图/封面</Typography.Text>
              <div style={{ marginTop: 8 }}>
                {detailDisplay.screenshotUrl ? (
                  <Image
                    src={detailDisplay.screenshotUrl}
                    alt={selectedPost.title || '作品截图'}
                    style={{ maxHeight: 260, objectFit: 'contain' }}
                  />
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无截图" />
                )}
              </div>
            </Card>
            <Input.TextArea
              rows={4}
              value={suggestionDraft}
              onChange={(event) => setSuggestionDraft(event.target.value)}
              placeholder="填写主管建议"
            />
          </Space>
        ) : null}
      </Modal>
    </Space>
  );
}
