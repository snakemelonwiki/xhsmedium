'use client';

import { Tag, Typography } from 'antd';

import { PersonalDashboardBoard } from '@/shared/components/dashboard/PersonalDashboardBoard';

/**
 * 运营个人看板（v1.3 OP-1/2/3/4/16/17/24 统一入口）
 *
 * 数据范围：仅当前登录运营员工（OP-3），由后端从 session.userId 解析 employeeId 后
 * 走 /api/dashboard/personal/overview + /api/dashboard/personal/rankings 两个端点。
 *
 * 主管端查看员工时使用 /api/dashboard/supervisor/employee/:id/overview + /rankings，
 * 由传入 PersonalDashboardBoard 的 employeeId prop 触发。
 */
export default function OperationPersonalDashboardPage() {
  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>个人看板</Typography.Title>
          <Typography.Paragraph type="secondary">
            切换指标 / 平台 / 时间查看自己的流量、获客、效率数据与名次；下方三榜提供运营节奏参考。
          </Typography.Paragraph>
        </div>
        <Tag color="blue">运营</Tag>
      </div>
      <PersonalDashboardBoard employeeId={undefined} showRefreshButton />
    </div>
  );
}
