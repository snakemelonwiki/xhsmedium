'use client';

import { Button, Form, Input, Typography, message } from 'antd';
import { useRouter } from 'next/navigation';

import { apiClient } from '@/shared/api/apiClient';
import { getDefaultHomePath, isAppRole, persistAuth, type AppRole } from '@/shared/auth/auth';

type LoginFormValues = {
  username: string;
  password: string;
};

type LoginResponse = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    employeeId?: string;
    employeeName?: string;
  };
};

function normalizeRole(role: string): AppRole {
  if (role === 'staff') return 'operation';
  if (role === 'owner') return 'admin';
  return isAppRole(role) ? role : 'operation';
}

export default function LoginPage() {
  const router = useRouter();
  const isOwnerPortal = typeof window !== 'undefined' && window.location.port === '3001';
  const title = isOwnerPortal ? '总后台入口' : '运营协作中台';
  const subtitle = isOwnerPortal ? '查看整体经营、主管管理和销售推进。' : '统一管理员工、账号、作品和客资。';
  const bullets = isOwnerPortal ? ['总后台登录', '适合负责人查看全局'] : ['运营、主管、销售共用一套数据', '登录后直接进入对应工作台'];

  async function handleFinish(values: LoginFormValues) {
    try {
      const result = await apiClient.post<LoginResponse>('/auth/login', values);
      const role = normalizeRole(result.user.role);
      persistAuth(result.token, {
        id: result.user.id,
        name: result.user.employeeName || result.user.username,
        role,
        employeeId: result.user.employeeId,
        portType: role,
      });
      router.replace(getDefaultHomePath(role));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '登录失败');
    }
  }

  return (
    <main className="login-shell">
      <div className="login-layout">
        <section className="login-aside">
          <span className="login-kicker">{isOwnerPortal ? '总后台' : '运营管理'}</span>
          <Typography.Title level={1}>{title}</Typography.Title>
          <Typography.Paragraph>{subtitle}</Typography.Paragraph>
          <div className="login-bullets">
            {bullets.map((item) => (
              <div className="login-bullet" key={item}>
                <span className="login-bullet-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <Form<LoginFormValues> className="login-card" layout="vertical" onFinish={handleFinish}>
          <div className="login-card-head">
            <div>
              <Typography.Title level={2}>{isOwnerPortal ? '登录总后台' : '登录工作台'}</Typography.Title>
              <Typography.Paragraph type="secondary">请输入账号和密码。</Typography.Paragraph>
            </div>
            <span className="login-port-tag">{isOwnerPortal ? '3001' : '3000'}</span>
          </div>
          <div className="login-fields">
            <Form.Item name="username" rules={[{ required: true, message: '请输入账号' }]}>
              <Input placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password placeholder="密码" autoComplete="current-password" />
            </Form.Item>
          </div>
          <Button className="login-submit" block type="primary" htmlType="submit">
            登录
          </Button>
        </Form>
      </div>
    </main>
  );
}
