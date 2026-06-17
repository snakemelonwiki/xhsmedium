'use client';

import { ExclamationCircleFilled } from '@ant-design/icons';
import { App as AntdApp, Button, ConfigProvider, message, notification } from 'antd';
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

/**
 * 触发 `auth:expired` 时统一去重的 antd notification key。同 key 会被
 * antd 自动覆盖 / 合并，避免 N 个并发 401 弹 N 条 toast。
 */
const AUTH_EXPIRED_KEY = 'auth-expired';
const AUTH_EXPIRED_HINT = '登录已失效';

/**
 * 把"登录已失效"这类来自 AuthExpiredError 的 message.error 调用
 * 统一压成单条带 key 的 toast，避免大量重复堆叠。
 *
 * 业务侧大多通过 `import { message } from 'antd'` + `message.error(err.message)`
 * 渲染错误，本桥接层在转发到 useApp() 实例之前先做一次"内容嗅探"。
 */
function shouldDedupeAsAuthExpired(args: unknown[]): boolean {
  if (!args.length) return false;
  const first = args[0];
  if (typeof first === 'string') return first.includes(AUTH_EXPIRED_HINT);
  if (first && typeof first === 'object') {
    const content = (first as { content?: unknown }).content;
    if (typeof content === 'string') return content.includes(AUTH_EXPIRED_HINT);
  }
  return false;
}

function bindBridgeMethod(bridge: Record<string, unknown>, key: string, fn: (...args: unknown[]) => unknown) {
  bridge[key] = (...args: unknown[]) => Reflect.apply(fn, undefined, args);
}

function bindErrorMethodWithDedupe(
  bridge: Record<string, unknown>,
  key: string,
  errorFn: (...args: unknown[]) => unknown,
  _warningFn: (...args: unknown[]) => unknown,
) {
  bridge[key] = (...args: unknown[]) => {
    if (shouldDedupeAsAuthExpired(args)) {
      // 把"登录已失效"统一压成单条带 key 的红色 message，配合
      // notification 醒目大卡片形成"主-辅"提示。调用方仍可保持
      // message.error(err.message) 的写法，但不再叠 N 条 toast。
      return Reflect.apply(errorFn, undefined, [
        {
          content: '登录已失效，请重新登录',
          key: AUTH_EXPIRED_KEY,
          duration: 6,
          icon: <ExclamationCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />,
          style: { fontWeight: 600, fontSize: 15 },
        },
      ]);
    }
    return Reflect.apply(errorFn, undefined, args);
  };
}

function StaticMessageBridge() {
  const { message: messageApi, notification: notificationApi } = AntdApp.useApp();

  useEffect(() => {
    const bridge = message as unknown as Record<string, unknown>;
    const target = messageApi as unknown as BridgeTarget;
    bindBridgeMethod(bridge, 'open', target.open);
    bindBridgeMethod(bridge, 'success', target.success);
    bindBridgeMethod(bridge, 'info', target.info);
    bindBridgeMethod(bridge, 'warning', target.warning);
    bindBridgeMethod(bridge, 'warn', target.warning);
    bindErrorMethodWithDedupe(bridge, 'error', target.error, target.warning);
    bindBridgeMethod(bridge, 'loading', target.loading);
    bindBridgeMethod(bridge, 'destroy', target.destroy);

    // notification 静态 API 桥接（与 message 同思路）。
    const notifBridge = notification as unknown as Record<string, unknown>;
    const notifTarget = notificationApi as unknown as Record<string, (...args: unknown[]) => unknown>;
    ['open', 'success', 'info', 'warning', 'error', 'destroy'].forEach((k) => {
      const fn = notifTarget[k];
      if (typeof fn === 'function') bindBridgeMethod(notifBridge, k, fn);
    });
  }, [messageApi, notificationApi]);

  // 监听全局 auth:expired —— 用 notification.error 弹一条 **强视觉** 顶部提示
  // （带 key 去重 + 不自动关闭 + 醒目红边 + 行动按钮）。
  // 这里和 message.error 桥接的 dedupe 形成"双保险"：
  //   - 即使没有任何 catch 调 message.error，用户也能看到提醒；
  //   - 即使 N 个 catch 都调了 message.error，也只会显示一条 message + 一条 notification。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ reason?: string; userId?: string; role?: string }>).detail;
      const reason = detail?.reason ?? 'unknown';
      // eslint-disable-next-line no-console
      console.warn('[auth] 登录已失效，reason=', reason);

      // 把"登录已失效"事件远程上报到 NestJS（Public 路由，无需带 token），
      // 让运维只看 pm2 logs lan-backend 就能掌握全量"被踢"事件分布。
      // 注意：
      //   1) 用原生 fetch + 不带 Authorization，避免 apiClient 触发 refresh 死循环；
      //   2) keepalive 让浏览器即使在 unload 期间也能完成上报；
      //   3) userId/role 从 event.detail 取（apiClient 在 clearToken **之前**做的快照），
      //      以 localStorage 兜底（用于直接 dispatch 的极端场景）；
      //   4) 失败完全静默——这是非关键遥测，不能阻塞 UI / 跳转。
      try {
        let userId = detail?.userId ?? '';
        let role = detail?.role ?? '';
        if (!userId || !role) {
          const lastUserRaw = window.localStorage.getItem('xhsmedium.user');
          if (lastUserRaw) {
            try {
              const parsed = JSON.parse(lastUserRaw) as { id?: unknown; role?: unknown };
              if (!userId && parsed?.id != null) userId = String(parsed.id);
              if (!role && parsed?.role != null) role = String(parsed.role);
            } catch {
              /* localStorage 里不是 JSON 也无所谓 */
            }
          }
        }
        const payload = JSON.stringify({
          reason,
          userId,
          role,
          route: window.location.pathname + window.location.search,
        });
        // 用相对路径（/api/auth/expired-event），不论用户在 3000 / 3001 / 3003 / 3302
        // 都会被各自的反代规则转发到同一个 NestJS 后端。
        void fetch('/api/auth/expired-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
          // 显式不带 cookie / credentials，避免和别的鉴权机制纠缠
          credentials: 'omit',
        }).catch(() => {
          /* 静默：遥测失败不影响主流程 */
        });
      } catch {
        /* 兜底：localStorage / fetch 在极端环境下不可用，吞掉即可 */
      }

      try {
        notificationApi.open({
          key: AUTH_EXPIRED_KEY,
          type: 'error',
          icon: (
            <ExclamationCircleFilled
              style={{ color: '#ff4d4f', fontSize: 28, marginTop: 2 }}
            />
          ),
          message: (
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: '#cf1322',
                letterSpacing: 1,
              }}
            >
              登录已失效，请重新登录
            </span>
          ),
          description: (
            <span style={{ fontSize: 14, color: '#434343', lineHeight: 1.7 }}>
              为了你的账号安全，请点击下方按钮重新登录后继续操作。
              <br />
              当前页面的未保存内容仍然保留，登录后会自动返回当前页。
            </span>
          ),
          placement: 'top',
          duration: 0, // 不自动关闭，用户必须手动确认
          style: {
            width: 460,
            border: '2px solid #ff4d4f',
            borderRadius: 12,
            boxShadow:
              '0 12px 32px rgba(255, 77, 79, 0.32), 0 4px 12px rgba(255, 77, 79, 0.18)',
            background: 'linear-gradient(135deg, #fff5f5 0%, #ffffff 60%)',
            padding: 18,
          },
          className: 'auth-expired-notification',
          btn: (
            <Button
              type="primary"
              danger
              size="middle"
              style={{ fontWeight: 600, minWidth: 120 }}
              onClick={() => {
                try {
                  notificationApi.destroy(AUTH_EXPIRED_KEY);
                } catch {
                  /* ignore */
                }
                if (typeof window !== 'undefined') {
                  // 强制跳到登录页（router.replace 在 AppLayout 已挂监听做兜底，
                  // 但用户也可能在登录页之外的纯客户端组件上看到此提示，这里用
                  // location 保证一致跳转）。
                  window.location.href = '/login';
                }
              }}
            >
              立即重新登录
            </Button>
          ),
        });
      } catch {
        // notificationApi 在 SSR / 卸载边缘可能不可用，吞掉即可
      }
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [notificationApi]);

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
