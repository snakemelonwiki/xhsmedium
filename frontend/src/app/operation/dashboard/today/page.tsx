'use client';

import { FireOutlined, ReloadOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Empty, Row, Segmented, Skeleton, Space, Statistic, Typography } from 'antd';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  getPersonalToday,
  type PersonalPlatform,
  type PersonalTodayResponse,
} from '@/shared/api/content';

const PLATFORM_OPTIONS: { label: string; value: PersonalPlatform }[] = [
  { label: '全部', value: 'all' },
  { label: '小红书', value: 'xiaohongshu' },
  { label: '抖音', value: 'douyin' },
];

/**
 * v1.3 OP-4 运营总览（今日数据卡）
 * - 顶部数据卡：今日作品 / 今日客资 / 今日流量
 * - 去除今日成交（OP-4）
 * - 流量口径：likes + comments + favorites
 * - 平台过滤支持
 *
 * 不再展示「今日成交」（与 v1.2 旧版的差异点），与 OP-16 重构口径一致。
 */
export default function OperationTodayPage() {
  const [platform, setPlatform] = useState<PersonalPlatform>('all');
  const [data, setData] = useState<PersonalTodayResponse | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await getPersonalToday({ platform });
      setData(result);
    } catch (err) {
      setData(undefined);
      setError(err instanceof Error ? err.message : '今日数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [platform]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>运营总览</Typography.Title>
          <Typography.Paragraph type="secondary">
            今日产能与流量（口径 likes+comments+favorites），不展示成交数。点击「个人看板」查看完整指标。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={platform}
            onChange={(v) => setPlatform(v as PersonalPlatform)}
            options={PLATFORM_OPTIONS}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
            刷新
          </Button>
          <Link href="/operation/dashboard/personal">
            <Button type="primary">个人看板</Button>
          </Link>
        </Space>
      </div>

      {error ? <Alert type="warning" showIcon message="今日数据暂不可用" description={error} /> : null}

      <Skeleton loading={loading} active paragraph={{ rows: 2 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="今日作品"
                value={data?.todayPostCount ?? 0}
                prefix={<ThunderboltOutlined style={{ color: '#1890ff' }} />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="今日客资"
                value={data?.todayLeadCount ?? 0}
                prefix={<TeamOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="今日流量（点赞+评论+收藏）"
                value={data?.todayTraffic ?? 0}
                prefix={<FireOutlined style={{ color: '#fa541c' }} />}
                valueStyle={{ color: '#fa541c' }}
              />
            </Card>
          </Col>
        </Row>
        {data && data.todayPostCount === 0 && data.todayLeadCount === 0 && data.todayTraffic === 0 ? (
          <Empty description="今日暂无数据" />
        ) : null}
      </Skeleton>
    </Space>
  );
}
