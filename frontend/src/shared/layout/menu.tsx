import {
  BarChartOutlined,
  BookOutlined,
  DatabaseOutlined,
  FormOutlined,
  FundOutlined,
  ImportOutlined,
  MessageOutlined,
  OrderedListOutlined,
  ProjectOutlined,
  ShopOutlined,
  TeamOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
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
    key: 'operation-home',
    label: '运营首页',
    path: '/operation',
    icon: <BarChartOutlined />,
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
    key: 'operation-posts',
    label: '作品列表',
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
    key: 'operation-rankings',
    label: '排行榜',
    path: '/operation/rankings',
    icon: <FundOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-dashboard',
    label: '个人看板',
    path: '/operation/dashboard',
    icon: <BarChartOutlined />,
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
    key: 'operation-source-pending',
    label: '待确认来源',
    path: '/operation/leads/source-pending',
    icon: <ProjectOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-imports',
    label: '导入记录',
    path: '/operation/imports',
    icon: <ImportOutlined />,
    roles: ['operation'],
  },
  {
    key: 'operation-messages',
    label: '消息',
    path: '/operation/messages',
    icon: <MessageOutlined />,
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
    key: 'sales-followups',
    label: '待跟进',
    path: '/sales/followups',
    icon: <BookOutlined />,
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
    key: 'sales-passive-leads',
    label: '被动添加',
    path: '/sales/passive-leads',
    icon: <DatabaseOutlined />,
    roles: ['sales'],
  },
  {
    key: 'sales-orders',
    label: '订单跟进',
    path: '/sales/orders',
    icon: <OrderedListOutlined />,
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
    key: 'academic-messages',
    label: '消息',
    path: '/academic/messages',
    icon: <MessageOutlined />,
    roles: ['academic'],
  },
  {
    key: 'admin-home',
    label: '主管首页',
    path: '/admin',
    icon: <TeamOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-leads',
    label: '客资看板',
    path: '/admin/leads',
    icon: <DatabaseOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-employees',
    label: '员工管理',
    path: '/admin/employees',
    icon: <TeamOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-orders',
    label: '订单看板',
    path: '/admin/orders',
    icon: <OrderedListOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-accounts',
    label: '账号管理',
    path: '/admin/accounts',
    icon: <ShopOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-analytics',
    label: '基础分析',
    path: '/admin/analytics',
    icon: <FundOutlined />,
    roles: ['admin'],
  },
  {
    key: 'admin-messages',
    label: '消息',
    path: '/admin/messages',
    icon: <MessageOutlined />,
    roles: ['admin'],
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
export function toAntdMenuItems(items: AppMenuItem[]): MenuProps['items'] {
  return items.map((item) => ({
    key: item.path,
    icon: item.icon,
    label: item.label,
  }));
}
