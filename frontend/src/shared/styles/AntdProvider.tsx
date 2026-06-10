'use client';

import { App as AntdApp, ConfigProvider, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import type { ReactNode } from 'react';
import { useEffect } from 'react';

type BridgeTarget = {
  open: (...args: unknown[]) => unknown;
  success: (...args: unknown[]) => unknown;
  info: (...args: unknown[]) => unknown;
  warning: (...args: unknown[]) => unknown;
  error: (...args: unknown[]) => unknown;
  loading: (...args: unknown[]) => unknown;
  destroy: (...args: unknown[]) => unknown;
};

function bindBridgeMethod(bridge: Record<string, unknown>, key: string, fn: (...args: unknown[]) => unknown) {
  bridge[key] = (...args: unknown[]) => Reflect.apply(fn, undefined, args);
}

function StaticMessageBridge() {
  const { message: messageApi } = AntdApp.useApp();

  useEffect(() => {
    const bridge = message as unknown as Record<string, unknown>;
    const target = messageApi as unknown as BridgeTarget;
    bindBridgeMethod(bridge, 'open', target.open);
    bindBridgeMethod(bridge, 'success', target.success);
    bindBridgeMethod(bridge, 'info', target.info);
    bindBridgeMethod(bridge, 'warning', target.warning);
    bindBridgeMethod(bridge, 'warn', target.warning);
    bindBridgeMethod(bridge, 'error', target.error);
    bindBridgeMethod(bridge, 'loading', target.loading);
    bindBridgeMethod(bridge, 'destroy', target.destroy);
  }, [messageApi]);

  return null;
}

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
      <AntdApp>
        <StaticMessageBridge />
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}
