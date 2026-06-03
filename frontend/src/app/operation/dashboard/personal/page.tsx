'use client';

import { Tag, Typography } from 'antd';

import { PersonalDashboardBoard } from '@/shared/components/dashboard/PersonalDashboardBoard';

/**
 * 运营个人看板
 * 展示当前运营自己的：作品数、客资数、点赞数、账号统计、榜单和账号日历。
 * 主管端 /admin/personal 也复用同一套 PersonalDashboardBoard 组件（传入 employeeId）。
 */
export default function OperationPersonalDashboardPage() {
  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <div>
          <Typography.Title level={2}>个人看板</Typography.Title>
          <Typography.Paragraph type="secondary">
            查看当前周期的作品、客资、点赞数和账号发帖节奏，支持切换今日/本周/本月/累计。
          </Typography.Paragraph>
        </div>
        <Tag color="blue">运营</Tag>
      </div>
      <PersonalDashboardBoard employeeId={undefined} showRefreshButton />
    </div>
  );
}
