'use client';

import { Button, Result } from 'antd';
import { useRouter } from 'next/navigation';

import { getDefaultHomePath, readStoredUser } from '@/shared/auth/auth';

export default function ForbiddenPage() {
  const router = useRouter();

  function returnHome() {
    const user = readStoredUser();
    router.replace(user ? getDefaultHomePath(user.role) : '/login');
  }

  return (
    <Result
      status="403"
      title="403"
      subTitle="当前账号没有权限访问这个页面。"
      extra={<Button type="primary" onClick={returnHome}>返回工作台</Button>}
    />
  );
}
