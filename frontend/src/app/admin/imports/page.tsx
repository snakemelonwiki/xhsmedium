'use client';

import { Card, Empty, Pagination, Progress, Radio, Space, Spin, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type ImportTask = {
  id: string;
  importType: string;
  userId: string;
  totalCount: number;
  successCount: number;
  failCount: number;
  status: string;
  errorFileUrl?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  finishedAt?: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  processing: 'blue',
  done: 'green',
  failed: 'red',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '等待中',
  processing: '处理中',
  done: '已完成',
  failed: '失败',
};

const POLL_INTERVAL = 2000; // 2秒轮询一次
const MAX_POLL_COUNT = 150; // 最多轮询 5 分钟 (150 * 2s)

/**
 * 主管端导入历史：展示全部用户的客资/作品批量导入记录，含成功/失败统计与错误文件下载。
 * 支持轮询 pending/processing 状态的任务直到完成。
 */
export default function AdminImportsPage() {
  const [items, setItems] = useState<ImportTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<string>('');

  // 轮询相关状态
  const [pollingTaskId, setPollingTaskId] = useState<string | null>(null);
  const [pollingTask, setPollingTask] = useState<ImportTask | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const searchParams = useSearchParams();

  // 初始化：从 URL 读取 taskId 参数
  useEffect(() => {
    const taskId = searchParams.get('taskId');
    if (taskId) {
      setPollingTaskId(taskId);
      setPollCount(0);
    }
  }, [searchParams]);

  // 获取单个任务详情
  const fetchTask = useCallback(async (taskId: string): Promise<ImportTask | null> => {
    try {
      const payload = await apiClient.get<ImportTask>(`/import-tasks/${taskId}`);
      return payload;
    } catch {
      return null;
    }
  }, []);

  // 轮询任务状态
  useEffect(() => {
    if (!pollingTaskId) {
      return;
    }

    const poll = async () => {
      const task = await fetchTask(pollingTaskId);
      if (!task) {
        message.error('获取任务状态失败');
        setPollingTaskId(null);
        return;
      }

      setPollingTask(task);
      setPollCount((c) => c + 1);

      // 如果任务已完成或失败，停止轮询
      if (task.status === 'done' || task.status === 'failed' || task.status === 'pending') {
        setPollingTaskId(null);
        if (task.status === 'done') {
          message.success(`导入完成：成功 ${task.successCount}，失败 ${task.failCount}`);
        } else if (task.status === 'failed') {
          message.error(`导入失败：${task.errorMessage || '未知错误'}`);
        }
        // 刷新列表
        void load(1, pageSize, type);
        return;
      }

      // 超过最大轮询次数，停止轮询
      if (pollCount >= MAX_POLL_COUNT) {
        message.warning('轮询超时，请手动刷新页面查看任务状态');
        setPollingTaskId(null);
      }
    };

    // 立即执行一次
    void poll();

    // 设置定时器
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL);

    return () => {
      clearInterval(timer);
    };
  }, [pollingTaskId, fetchTask, pollCount, pageSize, type]);

  async function load(nextPage = page, nextPageSize = pageSize, t = type) {
    setLoading(true);
    try {
      const query: Record<string, string | number> = {
        limit: nextPageSize,
        offset: (nextPage - 1) * nextPageSize,
      };
      if (t) query.type = t;
      const payload = await apiClient.get<any>('/import-tasks', { query });
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

  useEffect(() => {
    void load(1, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<ImportTask> = [
    { title: '导入类型', dataIndex: 'importType', width: 100 },
    { title: '发起人', dataIndex: 'userId', width: 140, ellipsis: true },
    { title: '总行数', dataIndex: 'totalCount', width: 90 },
    { title: '成功', dataIndex: 'successCount', width: 80 },
    { title: '失败', dataIndex: 'failCount', width: 80 },
    { title: '状态', dataIndex: 'status', width: 100, render: (v) => <Tag color={STATUS_COLORS[v] || 'default'}>{STATUS_LABELS[v] || v}</Tag> },
    {
      title: '错误文件',
      dataIndex: 'errorFileUrl',
      width: 110,
      render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">下载</a> : '-',
    },
    { title: '开始时间', dataIndex: 'createdAt', width: 170 },
    { title: '完成时间', dataIndex: 'finishedAt', width: 170, render: (v) => v || '-' },
  ];

  // 计算轮询进度
  const pollProgress = pollingTask && pollingTask.totalCount > 0
    ? Math.round(((pollingTask.successCount + pollingTask.failCount) / pollingTask.totalCount) * 100)
    : 0;

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>导入记录</Typography.Title>
        <Typography.Paragraph type="secondary">查看客资/作品批量导入历史与失败明细。</Typography.Paragraph>
      </div>

      {/* 轮询状态面板 */}
      {pollingTask && (
        <Card
          title={
            <Space>
              <Spin size="small" />
              <span>正在导入...</span>
              <Tag color={STATUS_COLORS[pollingTask.status]}>{STATUS_LABELS[pollingTask.status]}</Tag>
            </Space>
          }
          extra={
            <a onClick={() => setPollingTaskId(null)}>关闭</a>
          }
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            <Typography.Text>任务ID: {pollingTask.id}</Typography.Text>
            <Typography.Text>类型: {pollingTask.importType === 'leads' ? '客资导入' : '作品导入'}</Typography.Text>
            <Progress
              percent={pollProgress}
              status={pollingTask.status === 'failed' ? 'exception' : 'active'}
              format={(percent) => `${pollingTask.successCount} / ${pollingTask.totalCount} (${percent}%)`}
            />
            <Typography.Text type="secondary">
              轮询 {pollCount} / {MAX_POLL_COUNT} 次
            </Typography.Text>
          </Space>
        </Card>
      )}

      <Card>
        <Radio.Group
          value={type}
          style={{ marginBottom: 16 }}
          onChange={(e) => { setType(e.target.value); void load(1, pageSize, e.target.value); }}
        >
          <Radio.Button value="">全部</Radio.Button>
          <Radio.Button value="leads">客资</Radio.Button>
          <Radio.Button value="posts">作品</Radio.Button>
        </Radio.Group>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无导入记录" /> }}
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
    </Space>
  );
}
