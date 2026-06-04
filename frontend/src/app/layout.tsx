import 'antd/dist/reset.css';
import './globals.css';

import type { Metadata } from 'next';
import Script from 'next/script';
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
        {/* echarts 通过 CDN 全局注入，admin/analytics + PersonalDashboardBoard 复用同一份。
            与老前端 public/index.html 加载方式保持一致，避免在每个页面里重复 import 整包。 */}
        <Script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
