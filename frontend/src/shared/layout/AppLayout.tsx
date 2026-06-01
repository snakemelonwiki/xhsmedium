'use client';

import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Button, Dropdown, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  clearAuth,
  type AppRole,
  type AppUser,
} from '@/shared/auth/auth';
import { AuthGuard } from '@/shared/auth/AuthGuard';
import { NotificationBell } from '@/shared/components/notifications';
import { NotificationProvider } from '@/shared/contexts/NotificationContext';
import { UploadConfigProvider } from '@/shared/contexts/UploadConfigProvider';
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
  const [pendingPath, setPendingPath] = useState<string>();
  const handleAuthenticated = useCallback((nextUser: AppUser) => setUser(nextUser), []);
  const prefetchMenuItem = useCallback((path: string) => router.prefetch(path), [router]);

  const visibleRole = user?.role ?? role;
  const menuItems = useMemo(() => getMenuItemsByRole(visibleRole), [visibleRole]);
  const selectedKey = menuItems
    .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  useEffect(() => {
    setPendingPath(undefined);
  }, [pathname]);

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
      <NotificationProvider>
        <UploadConfigProvider>
          <Layout className="app-shell">
            <Sider width={232} className="app-sider">
              <div className="app-brand">
                <span className="app-brand-mark">X</span>
                <span>运营中台</span>
              </div>
              <Menu
                mode="inline"
                selectedKeys={pendingPath ? [pendingPath] : selectedKey ? [selectedKey] : []}
                items={toAntdMenuItems(menuItems, prefetchMenuItem)}
                onClick={({ key }) => setPendingPath(String(key) === pathname ? undefined : String(key))}
              />
            </Sider>
            <Layout>
              <Header className="app-header">
                <div className="app-header-context">
                  <Typography.Text className="app-header-eyebrow" type="secondary">当前端口</Typography.Text>
                  <Typography.Title className="app-header-title" level={4}>{title}</Typography.Title>
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
                <div className={`app-route-progress${pendingPath ? ' is-visible' : ''}`} aria-hidden="true" />
              </Header>
              <Content className="app-content" aria-busy={Boolean(pendingPath)}>{children}</Content>
            </Layout>
          </Layout>
        </UploadConfigProvider>
      </NotificationProvider>
    </AuthGuard>
  );
}
