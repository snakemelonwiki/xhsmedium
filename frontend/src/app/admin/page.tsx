'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 主管端入口页，重定向到主管 Dashboard。
 */
export default function AdminHomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/dashboard');
  }, [router]);

  return null;
}
