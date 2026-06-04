'use client';

import { BarChartOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Select, Space, Spin, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { apiClient } from '@/shared/api/apiClient';
import { PersonalDashboardBoard } from '@/shared/components/dashboard/PersonalDashboardBoard';

type Employee = {
  id: string;
  name: string;
  employeeCode?: string;
};

/**
 * 主管个人看板
 * 1. 顶部员工选择器
 * 2. 选择后复用 PersonalDashboardBoard（传入 employeeId）
 * 3. 主管可在看板内查看员工账号日历、获客榜、效率榜、流量榜、非获客贴榜
 */
export default function AdminPersonalPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | undefined>(undefined);
  const [loadingEmployees, setLoadingEmployees] = useState(false);

  const loadEmployees = useCallback(async () => {
    setLoadingEmployees(true);
    try {
      const payload = await apiClient.get<any>('/employees', { query: { limit: 500, offset: 0 } });
      const data = payload?.items ?? payload ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    } catch {
      setEmployees([]);
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId);

  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>个人看板</Typography.Title>
          <Typography.Paragraph type="secondary">
            选择员工后查看其个人看板数据（作品、客资、点赞数、榜单和账号日历）。
          </Typography.Paragraph>
        </div>
        <Space>
          <Tag color="purple">主管</Tag>
          <Select
            showSearch
            allowClear
            placeholder="选择员工查看其个人看板"
            style={{ width: 280 }}
            value={selectedEmployeeId}
            onChange={setSelectedEmployeeId}
            optionFilterProp="label"
            loading={loadingEmployees}
            options={employees.map((e) => ({
              label: `${e.name || e.id}${e.employeeCode ? `（${e.employeeCode}）` : ''}`,
              value: e.id,
            }))}
            notFoundContent={loadingEmployees ? <Spin size="small" /> : '暂无员工'}
          />
        </Space>
      </div>

      {selectedEmployeeId && selectedEmployee ? (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Typography.Text type="secondary">
              当前查看：<Typography.Text strong>{selectedEmployee.name || selectedEmployee.id}</Typography.Text>
            </Typography.Text>
            {/* v1.3 SUP-2: 同步到账号分析子菜单 — 跳到该员工对应的账号页 */}
            <Link
              href={`/admin/accounts?employeeId=${encodeURIComponent(selectedEmployeeId)}`}
            >
              <Button size="small" icon={<BarChartOutlined />}>
                查看账号分析
                <RightOutlined />
              </Button>
            </Link>
          </div>
          <PersonalDashboardBoard
            employeeId={selectedEmployeeId}
            showRefreshButton
          />
        </>
      ) : (
        <Typography.Text type="secondary" style={{ padding: 24, display: 'block', textAlign: 'center' }}>
          请从上方选择员工以查看其个人看板
        </Typography.Text>
      )}
    </div>
  );
}
