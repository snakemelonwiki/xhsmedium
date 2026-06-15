'use client';

import {
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { App as AntApp, Avatar, Button, Drawer, Dropdown, Form, Input, Layout, Menu, Modal, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';
import { apiClient } from '@/shared/api/apiClient';

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
  const { message: messageApi } = AntApp.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AppUser>();
  const [pendingPath, setPendingPath] = useState<string>();
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwForm] = Form.useForm();
  const logoutInProgress = useRef(false);

  /* ---- 侧边栏响应式状态 ---- */
  const { isMobile, isTablet } = useResponsiveBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

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
      key: 'change-password',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => { pwForm.resetFields(); setPwModalOpen(true); },
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: async () => {
        if (logoutInProgress.current) return;
        logoutInProgress.current = true;
        try {
          await apiClient.post('/auth/logout');
        } catch {
          // 后端登出失败不应阻塞前端清理
        }
        clearAuth();
        router.replace('/login');
      },
    },
  ];

  async function submitChangePassword(values: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    if (values.newPassword !== values.confirmPassword) {
      messageApi.warning('两次输入的新密码不一致');
      return;
    }
    setPwLoading(true);
    try {
      const res = await apiClient.request<{ ok: boolean; message?: string }>(
        '/users/self/change-password',
        { method: 'PATCH', body: { oldPassword: values.oldPassword, newPassword: values.newPassword } },
      );
      if (res.ok) {
        messageApi.success('密码修改成功');
        setPwModalOpen(false);
        pwForm.resetFields();
      } else {
        messageApi.error(res.message || '修改失败');
      }
    } catch (err: unknown) {
      messageApi.error((err as Error)?.message || '修改失败');
    } finally {
      setPwLoading(false);
    }
  }

  const sidebarMenu = (
    <Menu
      mode="inline"
      selectedKeys={pendingPath ? [pendingPath] : selectedKey ? [selectedKey] : []}
      items={toAntdMenuItems(menuItems, prefetchMenuItem)}
      onClick={({ key }) => {
        setPendingPath(String(key) === pathname ? undefined : String(key));
        if (isMobile) setMobileDrawerOpen(false);
      }}
    />
  );

  return (
    <AuthGuard onAuthenticated={handleAuthenticated}>
      <NotificationProvider>
        <UploadConfigProvider>
          <Layout className="app-shell">
            {/* 桌面/平板：固定 Sider */}
            {!isMobile && (
              <Sider
                width={232}
                collapsedWidth={isTablet ? 64 : undefined}
                collapsible={isTablet}
                collapsed={isTablet ? collapsed : undefined}
                onCollapse={isTablet ? setCollapsed : undefined}
                className="app-sider"
                trigger={isTablet ? undefined : null}
              >
                <div className="app-brand" style={collapsed && isTablet ? { padding: '0 12px', justifyContent: 'center' } : undefined}>
                  <span className="app-brand-mark">X</span>
                  {(!collapsed || !isTablet) && <span>运营中台</span>}
                </div>
                {sidebarMenu}
              </Sider>
            )}

            {/* 移动端：Drawer 菜单 */}
            {isMobile && (
              <Drawer
                title={<><span className="app-brand-mark" style={{ marginRight: 10 }}>X</span>{title}</>}
                placement="left"
                width={260}
                open={mobileDrawerOpen}
                onClose={() => setMobileDrawerOpen(false)}
                styles={{ body: { padding: 0 } }}
              >
                <nav aria-label="主导航">
                  {sidebarMenu}
                </nav>
              </Drawer>
            )}

            <Layout>
              <Header className="app-header">
                <div className="app-header-context">
                  {/* 移动端：显示汉堡按钮 */}
                  {isMobile && (
                    <Button
                      type="text"
                      icon={mobileDrawerOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                      onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
                      aria-label={mobileDrawerOpen ? '关闭菜单' : '打开菜单'}
                      style={{ marginRight: 8 }}
                    />
                  )}
                  {/* 平板折叠时：也显示展开按钮 */}
                  {isTablet && collapsed && (
                    <Button
                      type="text"
                      icon={<MenuUnfoldOutlined />}
                      onClick={() => setCollapsed(false)}
                      aria-label="打开菜单"
                      style={{ marginRight: 8 }}
                    />
                  )}
                  <div>
                    <Typography.Text className="app-header-eyebrow" type="secondary">当前端口</Typography.Text>
                    <Typography.Title className="app-header-title" level={4}>{title}</Typography.Title>
                  </div>
                </div>
                <Space size={isMobile ? 8 : 16}>
                  <NotificationBell pollIntervalMs={60000} />
                  <Dropdown menu={{ items: userMenu }} placement="bottomRight">
                    <Button type="text" aria-label="用户菜单">
                      <Space>
                        <Avatar size="small" icon={<UserOutlined />} />
                        {!isMobile && <span>{user?.name ?? '未登录'}</span>}
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
      <Modal
        title="修改密码"
        open={pwModalOpen}
        onCancel={() => { setPwModalOpen(false); pwForm.resetFields(); }}
        onOk={() => pwForm.submit()}
        confirmLoading={pwLoading}
        destroyOnClose
      >
        <Form form={pwForm} layout="vertical" onFinish={submitChangePassword} preserve={false}>
          <Form.Item name="oldPassword" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
            <Input.Password placeholder="请输入当前密码" autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
              { pattern: /[a-zA-Z]/, message: '密码必须包含字母' },
              { pattern: /[0-9]/, message: '密码必须包含数字' },
            ]}
          >
            <Input.Password placeholder="至少6位，包含字母和数字" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </AuthGuard>
  );
}
