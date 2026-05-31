'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { getAuthRedirectPath, readAuthenticatedUser, type AppUser } from '@/shared/auth/auth';

type AuthGuardProps = {
  children: ReactNode;
  onAuthenticated?: (user: AppUser) => void;
};

/**
 * 保护业务路由：未登录跳转登录，无权限跳转 403 页面。
 */
export function AuthGuard({ children, onAuthenticated }: AuthGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = readAuthenticatedUser();
    const redirectPath = getAuthRedirectPath(user, pathname);

    if (redirectPath) {
      router.replace(redirectPath);
      return;
    }

    if (user) {
      onAuthenticated?.(user);
    }
    setReady(true);
  }, [onAuthenticated, pathname, router]);

  return ready ? children : null;
}
