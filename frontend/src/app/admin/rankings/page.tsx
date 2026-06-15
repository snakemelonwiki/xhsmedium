'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Form, InputNumber, message, Pagination, Radio, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';

import { QuickRangePicker } from '@/shared/components/date';
import type { DateRangeValue } from '@/shared/components/date';
import { isPresetMatch } from '@/shared/utils/date-range';
import type { DateRangePreset } from '@/shared/utils/date-range';
import { apiClient } from '@/shared/api/apiClient';
import { createExport, downloadExportUrl, getExport } from '@/shared/api/exports';
import {
  getLearningBoardThresholds,
  updateLearningBoardThresholds,
  type LearningBoardThresholds,
} from '@/shared/api/learning-board';

import { buildRankingExportFilter } from './exportFilter';

type RankingRow = {
  employeeId: string;
  name: string;
  accountCount?: number;
  postCount?: number;
  xhsPostCount?: number;
  douyinPostCount?: number;
  todayPosts?: number;
  todayLeads?: number;
  todayTraffic?: number;
  todayDeals?: number;
  leadCount?: number;
};

type RankingType = 'posts' | 'leads';
type Platform = '' | 'xhs' | 'douyin';

const RANKING_PRESETS: readonly DateRangePreset[] = [
  { key: 'today', label: '今日', unit: 'day', n: 1, mode: 'calendar' },
  { key: 'thisWeek', label: '本周', unit: 'week', n: 1, mode: 'calendar' },
  { key: 'thisMonth', label: '本月', unit: 'month', n: 1, mode: 'calendar' },
] as const;

/**
 * 主管运营排行榜：支持 type / platform / period 三档筛选，平铺所有员工聚合数据。
 * 后端接口在 1.2 P1-2 之后已支持这三个参数；旧版仅按单日聚合，主管端看到的几乎都是 0。
 */
export default function AdminRankingsPage() {
  const [items, setItems] = useState<RankingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState<RankingType>('posts');
  const [dateRange, setDateRange] = useState<DateRangeValue>({ start: dayjs().startOf('day'), end: dayjs() });
  const [platform, setPlatform] = useState<Platform>('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string>();
  const [thresholdForm] = Form.useForm<LearningBoardThresholds>();
  const [thresholdLoading, setThresholdLoading] = useState(false);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const pageSize = 20;

  /** 根据当前 dateRange 生成请求参数：预设命中则发 period，否则发 from/to */
  function buildPeriodQuery(): Record<string, string> {
    if (!dateRange) return { period: 'today' };
    for (const p of RANKING_PRESETS) {
      if (isPresetMatch(dateRange, p.unit, p.n, p.mode)) {
        return { period: p.key };
      }
    }
    return { from: dateRange.start.format('YYYY-MM-DD'), to: dateRange.end.format('YYYY-MM-DD') };
  }

  async function load(nextPage = page, nextType = type, nextPlatform = platform) {
    setLoading(true);
    setError(undefined);
    try {
      const query: Record<string, string | number> = {
        type: nextType,
        limit: pageSize,
        offset: (nextPage - 1) * pageSize,
        ...buildPeriodQuery(),
      };
      if (nextPlatform) query.platform = nextPlatform;
      const payload = await apiClient.get<any>('/rankings', { query });
      const data = payload?.items ?? payload ?? [];
      const totalCount = payload?.total ?? data.length;
      setItems(Array.isArray(data) ? data : []);
      setTotal(totalCount);
      setPage(nextPage);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : '排行榜加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  useEffect(() => {
    void loadThresholds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns: ColumnsType<RankingRow> = [
    { title: '排名', width: 80, render: (_, __, index) => (page - 1) * pageSize + index + 1 },
    { title: '员工', dataIndex: 'name', render: (name: string) => <Typography.Text strong>{name}</Typography.Text> },
    { title: '账号数', dataIndex: 'accountCount', width: 90 },
    { title: type === 'posts' ? '累计作品' : '累计客资', dataIndex: type === 'posts' ? 'postCount' : 'leadCount', width: 110 },
    { title: '小红书作品', dataIndex: 'xhsPostCount', width: 110 },
    { title: '抖音作品', dataIndex: 'douyinPostCount', width: 100 },
    { title: '区间作品', dataIndex: 'todayPosts', width: 100 },
    { title: '区间客资', dataIndex: 'todayLeads', width: 100 },
    { title: '区间流量', dataIndex: 'todayTraffic', width: 100 },
    { title: '成交数', dataIndex: 'todayDeals', width: 100 },
  ];

  async function handleExport() {
    setExporting(true);
    const hide = message.loading('正在生成导出文件...', 0);
    try {
      const result = await createExport({ exportType: 'rankings', filter: buildRankingExportFilter({ type, ...buildPeriodQuery(), platform }) });
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
    } catch (err) {
      hide();
      message.error(err instanceof Error ? err.message : '排行榜导出失败');
    } finally {
      setExporting(false);
    }
  }

  async function loadThresholds() {
    setThresholdLoading(true);
    try {
      const thresholds = await getLearningBoardThresholds();
      thresholdForm.setFieldsValue(thresholds);
    } catch (err) {
      message.warning(err instanceof Error ? err.message : '学习榜单门槛加载失败');
    } finally {
      setThresholdLoading(false);
    }
  }

  async function saveThresholds(values: LearningBoardThresholds) {
    setThresholdSaving(true);
    try {
      const thresholds = await updateLearningBoardThresholds({
        minLeads: Number(values.minLeads ?? 0),
        minTraffic: Number(values.minTraffic ?? 0),
      });
      thresholdForm.setFieldsValue(thresholds);
      message.success('学习榜单门槛已保存');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '学习榜单门槛保存失败');
    } finally {
      setThresholdSaving(false);
    }
  }

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>运营排行榜</Typography.Title>
        <Typography.Paragraph type="secondary">
          按员工聚合的作品、客资、流量和成交榜单，支持按平台 / 周期筛选。
        </Typography.Paragraph>
      </div>
      <Card>
        <Form
          form={thresholdForm}
          layout="inline"
          disabled={thresholdLoading}
          initialValues={{ minLeads: 10, minTraffic: 10000 }}
          onFinish={saveThresholds}
          style={{ marginBottom: 16 }}
        >
          <Form.Item label="学习榜单门槛" style={{ marginRight: 8 }}>
            <Typography.Text type="secondary">客资或流量任一达标才展示</Typography.Text>
          </Form.Item>
          <Form.Item name="minLeads" label="客资不少于">
            <InputNumber min={0} precision={0} addonAfter="条" style={{ width: 140 }} />
          </Form.Item>
          <Form.Item name="minTraffic" label="流量不少于">
            <InputNumber min={0} precision={0} addonAfter="次" style={{ width: 160 }} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={thresholdSaving}>
              保存门槛
            </Button>
          </Form.Item>
        </Form>
        <Space size={16} wrap style={{ marginBottom: 16 }}>
          <Radio.Group value={type} onChange={(e) => { setType(e.target.value); void load(1, e.target.value, platform); }}>
            <Radio.Button value="posts">作品榜</Radio.Button>
            <Radio.Button value="leads">客资榜</Radio.Button>
          </Radio.Group>
          <QuickRangePicker
            value={dateRange}
            onChange={setDateRange}
            presets={RANKING_PRESETS}
            variant="buttons"
            presetSize="middle"
            selectPlaceholder="快捷周期"
          />
          <Radio.Group value={platform} onChange={(e) => { setPlatform(e.target.value); void load(1, type, e.target.value); }}>
            <Radio.Button value="">全部平台</Radio.Button>
            <Radio.Button value="xhs">小红书</Radio.Button>
            <Radio.Button value="douyin">抖音</Radio.Button>
          </Radio.Group>
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={handleExport}>
            当前筛选导出
          </Button>
        </Space>
        {error ? <Alert type="warning" showIcon message="排行榜暂不可用" description={error} style={{ marginBottom: 16 }} /> : null}
        <Table
          rowKey="employeeId"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <Empty description="暂无榜单数据" /> }}
        />
        <Pagination
          current={page}
          pageSize={pageSize}
          total={total}
          onChange={(nextPage) => load(nextPage)}
          style={{ marginTop: 16, textAlign: 'right' }}
        />
      </Card>
    </Space>
  );
}
