'use client';

import { Card, Empty, Select, Space, Statistic, Typography } from 'antd';
import { useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';

type Employee = { id: string; name: string; employeeCode?: string };

type EmployeeSnapshot = {
  postCount: number;
  leadCount: number;
  recentPostTitle?: string;
  recentLeadContact?: string;
};

/**
 * 主管端"个人看板选择器"：先选员工，再呈现其作品 / 客资聚合。
 * 当前只读基础数据，里程碑 1.2 后续可扩展跟进时间线 / 排行榜对比。
 */
export default function AdminPersonalPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string>();
  const [snapshot, setSnapshot] = useState<EmployeeSnapshot>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiClient
      .get<any>('/employees')
      .then((payload) => {
        const data = payload?.items ?? payload ?? [];
        setEmployees(Array.isArray(data) ? data : []);
      })
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    if (!selected) {
      setSnapshot(undefined);
      return;
    }
    setLoading(true);
    Promise.all([
      apiClient.get<any>('/posts', { query: { employeeId: selected, limit: 1, offset: 0 } }),
      apiClient.get<any>('/leads', { query: { employeeId: selected, scope: 'employee', limit: 1, offset: 0 } }),
    ])
      .then(([postsPayload, leadsPayload]) => {
        const postItems = postsPayload?.items ?? postsPayload ?? [];
        const leadItems = leadsPayload?.items ?? leadsPayload ?? [];
        setSnapshot({
          postCount: postsPayload?.total ?? postItems.length,
          leadCount: leadsPayload?.total ?? leadItems.length,
          recentPostTitle: postItems[0]?.title,
          recentLeadContact: leadItems[0]?.contactInfo,
        });
      })
      .catch(() => setSnapshot(undefined))
      .finally(() => setLoading(false));
  }, [selected]);

  const employee = employees.find((e) => e.id === selected);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <div>
        <Typography.Title level={2}>个人看板</Typography.Title>
        <Typography.Paragraph type="secondary">挑选员工后查看其作品、客资基础聚合。</Typography.Paragraph>
      </div>
      <Card>
        <Select
          showSearch
          allowClear
          placeholder="选择员工"
          style={{ width: 280 }}
          value={selected}
          onChange={setSelected}
          optionFilterProp="label"
          options={employees.map((e) => ({
            label: `${e.name || e.id}${e.employeeCode ? `（${e.employeeCode}）` : ''}`,
            value: e.id,
          }))}
        />
      </Card>
      {!selected ? (
        <Card>
          <Empty description="请先选择员工" />
        </Card>
      ) : (
        <>
          <Typography.Title level={4}>{employee?.name || selected}</Typography.Title>
          <div className="metric-grid">
            <Card loading={loading}>
              <Statistic title="累计作品" value={snapshot?.postCount ?? 0} />
            </Card>
            <Card loading={loading}>
              <Statistic title="累计客资" value={snapshot?.leadCount ?? 0} />
            </Card>
            <Card loading={loading}>
              <Statistic title="最近作品" value={snapshot?.recentPostTitle || '-'} />
            </Card>
            <Card loading={loading}>
              <Statistic title="最近客资" value={snapshot?.recentLeadContact || '-'} />
            </Card>
          </div>
        </>
      )}
    </Space>
  );
}
