'use client';

import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';

/**
 * Ant Design 客户端主题和中文 locale 入口。
 */
export function AntdProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          borderRadius: 8,
          colorPrimary: '#1677ff',
          fontFamily: 'Arial, "Microsoft YaHei", sans-serif',
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}
