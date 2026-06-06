import {
  BarChartOutlined,
  BookOutlined,
  DatabaseOutlined,
  ExportOutlined,
  FormOutlined,
  FundOutlined,
  ImportOutlined,
  MessageOutlined,
  OrderedListOutlined,
  ProjectOutlined,
  ScheduleOutlined,
  ShopOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import type { ReactNode } from 'react';

import type { AppRole } from '@/shared/auth/auth';

export type AppMenuItem = {
  key: string;
  label: string;
  path: string;
  icon: ReactNode;
  roles: AppRole[];
};

export const APP_MENU_ITEMS: AppMenuItem[] = [
  {
    key: 'operation-today-tasks',
    label: '今日任务',
    path: '/operation/today-tasks',
    icon: <BarChartOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-home',
    label: '总览',
    path: '/operation',
    icon: <BarChartOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-rankings',
    label: '运营排行榜',
    path: '/operation/rankings',
    icon: <FundOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-rankings-study',
    label: '学习榜单',
    path: '/operation/rankings/study',
    icon: <BookOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-dashboard',
    label: '个人看板',
    path: '/operation/dashboard/personal',
    icon: <BarChartOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-dashboard-account-analysis',
    label: '账号分析',
    path: '/operation/dashboard/account-analysis',
    icon: <FundOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-post-new',
    label: '作品录入',
    path: '/operation/posts/new',
    icon: <FormOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-lead-new',
    label: '客资录入',
    path: '/operation/leads/new',
    icon: <UsergroupAddOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-leads',
    label: '客资看板',
    path: '/operation/leads',
    icon: <DatabaseOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-collaboration',
    label: '协同处理',
    path: '/operation/collaboration',
    icon: <ProjectOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-posts',
    label: '我的作品',
    path: '/operation/posts',
    icon: <OrderedListOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-gallery',
    label: '作品广场',
    path: '/operation/gallery',
    icon: <ShopOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-accounts',
    label: '账号管理',
    path: '/operation/accounts',
    icon: <DatabaseOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-messages',
    label: '消息中心',
    path: '/operation/messages',
    icon: <MessageOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-favorites',
    label: '我的收藏',
    path: '/operation/favorites',
    icon: <BookOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-exports',
    label: '导出中心',
    path: '/operation/exports',
    icon: <ExportOutlined />,
    roles: ['operation'],
  },
  {
    key: 'sales-leads',
    label: '我的客资',
    path: '/sales/leads',
    icon: <UsergroupAddOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-lead-followup',
    label: '客资跟进',
    path: '/sales/lead-followup',
    icon: <ScheduleOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-orders',
    label: '订单跟进',
    path: '/sales/orders',
    icon: <BookOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-today-followups',
    label: '当日待跟进',
    path: '/sales/today-followups',
    icon: <ScheduleOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-deals',
    label: '我的成交',
    path: '/sales/deals',
    icon: <FundOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-collaboration',
    label: '协同',
    path: '/sales/collaboration',
    icon: <ProjectOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-messages',
    label: '消息',
    path: '/sales/messages',
    icon: <MessageOutlined />,
    roles: ['sales'],
  },
  {
    key: 'academic-home',
    label: '教务首页',
    path: '/academic',
    icon: <BookOutlined />,
    roles: ['academic'],
  },
  {
    key: 'academic-orders',
    label: '订单池',
    path: '/academic/orders',
    icon: <OrderedListOutlined />,
    roles: ['academic'],
  },
  {
    key: 'academic-abnormal',
    label: '异常订单',
    path: '/academic/abnormal',
    icon: <ProjectOutlined />,
    roles: ['academic'],
  },
  {
    key: 'academic-reminders',
    label: '节点提醒',
    path: '/academic/reminders',
    icon: <ProjectOutlined />,
    roles: ['academic'],
  },
  {
    key: 'academic-exports',
    label: '导出中心',
    path: '/academic/exports',
    icon: <ExportOutlined />,
    roles: ['academic'],
  },
  {
    key: 'academic-messages',
    label: '消息',
    path: '/academic/messages',
    icon: <MessageOutlined />,
    roles: ['academic'],
  },
  {
    key: 'owner-home',
    label: '总后台首页',
    path: '/owner',
    icon: <TeamOutlined />,
    roles: ['owner'],
  },
  {
    key: 'admin-home',
    label: '总览',
    path: '/admin/dashboard',
    icon: <TeamOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-rankings',
    label: '运营排行榜',
    path: '/admin/rankings',
    icon: <FundOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-personal',
    label: '个人看板',
    path: '/admin/personal',
    icon: <BarChartOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-posts',
    label: '作品看板',
    path: '/admin/posts',
    icon: <OrderedListOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-leads',
    label: '客资看板',
    path: '/admin/leads',
    icon: <DatabaseOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-employees',
    label: '员工管理',
    path: '/admin/employees',
    icon: <TeamOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-accounts',
    label: '账号管理',
    path: '/admin/accounts',
    icon: <ShopOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-analytics',
    label: '分析看板',
    path: '/admin/analytics',
    icon: <FundOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-messages',
    label: '消息中心',
    path: '/admin/messages',
    icon: <MessageOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-imports',
    label: '导出中心',
    path: '/admin/exports',
    icon: <ImportOutlined />,
    roles: ['admin', 'owner'],
  },
];

/**
 * 根据角色返回可见菜单。
 */
export function getMenuItemsByRole(role: AppRole): AppMenuItem[] {
  return APP_MENU_ITEMS.filter((item) => item.roles.includes(role));
}

/**
 * 转成 Ant Design Menu 需要的数据结构。
 */
export function toAntdMenuItems(
  items: AppMenuItem[],
  onNavigateIntent?: (path: string) => void,
): MenuProps['items'] {
  return items.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: (
      <Link href={item.path} onMouseEnter={() => onNavigateIntent?.(item.path)}>
        {item.label}
      </Link>
    ),
  }));
}
