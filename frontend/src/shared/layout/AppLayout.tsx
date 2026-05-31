'use client';

import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import {
  clearAuth,
  type AppRole,
  type AppUser,
} from '@/shared/auth/auth';
import { AuthGuard } from '@/shared/auth/AuthGuard';
import { NotificationBell } from '@/shared/components/notifications';
import { getMenuItemsByRole, toAntdMenuItems } from '@/shared/layout/menu';

const { Content, Header, Sider } = Layout;

type AppLayoutProps = {
  role: AppRole;
  title: string;
  children: ReactNode;
};

/**
 * 四端口共用后台布局，提供菜单、用户区和消息入口。
 */
export function AppLayout({ role, title, children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AppUser>();
  const handleAuthenticated = useCallback((nextUser: AppUser) => setUser(nextUser), []);

  const visibleRole = user?.role ?? role;
  const menuItems = useMemo(() => getMenuItemsByRole(visibleRole), [visibleRole]);
  const selectedKey = menuItems
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        clearAuth();
        router.replace('/login');
      },
    },
  ];

  return (
    <AuthGuard onAuthenticated={handleAuthenticated}>
      <Layout className="app-shell">
        <Sider width={232} className="app-sider">
          <div className="app-brand">
            <span className="app-brand-mark">X</span>
            <span>运营中台</span>
          </div>
          <Menu
            mode="inline"
            selectedKeys={selectedKey ? [selectedKey] : []}
            items={toAntdMenuItems(menuItems)}
            onClick={({ key }) => router.push(String(key))}
          />
        </Sider>
        <Layout>
          <Header className="app-header">
            <div>
              <Typography.Text type="secondary">当前端口</Typography.Text>
              <Typography.Title level={4}>{title}</Typography.Title>
            </div>
            <Space size={16}>
              <NotificationBell pollIntervalMs={60000} />
              <Dropdown menu={{ items: userMenu }} placement="bottomRight">
                <Button type="text">
                  <Space>
                    <Avatar size="small" icon={<UserOutlined />} />
                    <span>{user?.name ?? '未登录'}</span>
                  </Space>
                </Button>
              </Dropdown>
            </Space>
          </Header>
          <Content className="app-content">{children}</Content>
        </Layout>
      </Layout>
    </AuthGuard>
  );
}
