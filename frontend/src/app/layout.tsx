import 'antd/dist/reset.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AntdProvider } from '@/shared/styles/AntdProvider';

export const metadata: Metadata = {
  title: '运营中台',
  description: '运营到销售核心协同新前端',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdProvider>{children}</AntdProvider>
      </body>
    </html>
  );
}
