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
  ShareAltOutlined,
  ShopOutlined,
  TagsOutlined,
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
  /**
   * 可选的导航目标。默认与 path 相同；当需要 path 保持纯净（用于 pathname 匹配高亮）
   * 但导航时带 query/hash 时使用，例如主管视图下 /admin/employees?scope=operation。
   */
  link?: string;
  icon: ReactNode;
  roles: AppRole[];
};

const ACADEMIC_ROLE_SCOPE: AppRole[] = ['academic', 'academic_supervisor'];

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
    key: 'operation-recommend',
    label: '推荐作品录入',
    path: '/operation/recommend',
    icon: <ShareAltOutlined />,
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
    key: 'sales-recommend',
    label: '推荐作品录入',
    path: '/sales/recommend',
    icon: <ShareAltOutlined />,
    roles: ['sales'],
  },
  {
    key: 'academic-home',
    label: '教务首页',
    path: '/academic',
    icon: <BookOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-teachers',
    label: '稳定老师库',
    path: '/academic/teachers',
    icon: <TeamOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-teacher-specialties',
    label: '专业方向管理',
    path: '/academic/teacher-specialties',
    icon: <TagsOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-teacher-order-types',
    label: '接单类型管理',
    path: '/academic/teacher-order-types',
    icon: <TagsOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-orders',
    label: '订单池',
    path: '/academic/orders',
    icon: <OrderedListOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-followup',
    label: '订单跟进',
    path: '/academic/followup',
    icon: <ScheduleOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-abnormal',
    label: '异常订单',
    path: '/academic/abnormal',
    icon: <ProjectOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-reminders',
    label: '节点提醒',
    path: '/academic/reminders',
    icon: <ProjectOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-exports',
    label: '导出中心',
    path: '/academic/exports',
    icon: <ExportOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-messages',
    label: '消息',
    path: '/academic/messages',
    icon: <MessageOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
  },
  {
    key: 'academic-recommend',
    label: '推荐作品录入',
    path: '/academic/recommend',
    icon: <ShareAltOutlined />,
    roles: ACADEMIC_ROLE_SCOPE,
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
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-rankings',
    label: '运营排行榜',
    path: '/admin/rankings',
    icon: <FundOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-rankings-study',
    label: '学习榜单',
    path: '/admin/rankings/study',
    icon: <BookOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-personal',
    label: '个人看板',
    path: '/admin/personal',
    icon: <BarChartOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-posts',
    label: '作品看板',
    path: '/admin/posts',
    icon: <OrderedListOutlined />,
    // A-② 修复（2026-06-23）：supervisor 也需要进入主管端作品看板查看详情敏感信息。
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-gallery',
    label: '作品广场',
    path: '/admin/gallery',
    icon: <ShopOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-recommend',
    label: '推荐作品录入',
    path: '/admin/posts/recommend',
    icon: <ShareAltOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-account-analysis',
    label: '账号分析',
    path: '/admin/account-analysis',
    icon: <FundOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-leads',
    label: '客资看板',
    path: '/admin/leads',
    icon: <DatabaseOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-sales-board',
    label: '销售看板',
    path: '/admin/sales-board',
    icon: <UsergroupAddOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-orders',
    label: '订单管理',
    path: '/admin/orders',
    icon: <OrderedListOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-employees',
    label: '员工管理',
    path: '/admin/employees',
    icon: <TeamOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-academic-orders',
    label: '教务订单池',
    path: '/academic/orders',
    icon: <OrderedListOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-academic-followup',
    label: '教务订单跟进',
    path: '/academic/followup',
    icon: <ScheduleOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-finance',
    label: '财务系统',
    path: '/admin/finance',
    icon: <FundOutlined />,
    roles: ['admin', 'owner'],
  },
  {
    key: 'admin-accounts',
    label: '账号管理',
    path: '/admin/accounts',
    icon: <ShopOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-analytics',
    label: '分析看板',
    path: '/admin/analytics',
    icon: <FundOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-messages',
    label: '消息中心',
    path: '/admin/messages',
    icon: <MessageOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
  {
    key: 'admin-imports',
    label: '导出中心',
    path: '/admin/exports',
    icon: <ImportOutlined />,
    roles: ['admin', 'owner', 'supervisor'],
  },
];

/**
 * 主管视图（owner/admin 切到 supervisor 视图，或 supervisor 自己登录）的菜单 link 覆盖。
 * path 保持原值（用于 pathname 高亮匹配）；只覆盖 link（用于导航 URL）。
 * 仅对 admin-employees 生效：员工管理在主管视图下默认带 ?scope=operation 过滤，避免主管误操作其他端账号。
 */
const SUPERVISOR_VIEW_LINK_OVERRIDES: Record<string, string> = {
  'admin-employees': '/admin/employees?scope=operation',
};

/**
 * 根据角色返回可见菜单。
 * supervisor 角色（包括 owner/admin 切到主管视图时显式传入的 role）会应用 link 覆盖。
 */
export function getMenuItemsByRole(role: AppRole): AppMenuItem[] {
  const items = APP_MENU_ITEMS.filter((item) => item.roles.includes(role));
  if (role !== 'supervisor') return items;
  return items.map((item) => {
    const override = SUPERVISOR_VIEW_LINK_OVERRIDES[item.key];
    return override ? { ...item, link: override } : item;
  });
}

/**
 * 转成 Ant Design Menu 需要的数据结构。
 */
export function toAntdMenuItems(
  items: AppMenuItem[],
  onNavigateIntent?: (path: string) => void,
): MenuProps['items'] {
  return items.map((item) => {
    const href = item.link ?? item.path;
    return {
      // key 仍用 path（不含 query），与 AppLayout 的 selectedKey 计算保持一致
      key: item.path,
      icon: item.icon,
      label: (
        <Link href={href} onMouseEnter={() => onNavigateIntent?.(href)}>
          {item.label}
        </Link>
      ),
    };
  });
}
