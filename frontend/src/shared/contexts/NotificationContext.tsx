'use client';

import { message } from 'antd';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/shared/api/notifications';
import { readAuthenticatedUser } from '@/shared/auth/auth';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';
import type { NotificationItem } from '@/shared/types/notifications';

const POLL_INTERVAL_MS = 60_000;
const BELL_PAGE_SIZE = 8;

type NotificationContextValue = {
  /** 顶部下拉用列表 */
  items: NotificationItem[];
  /** 未读数量（红点用） */
  unreadCount: number;
  /** socket 是否已连上 */
  connected: boolean;
  loading: boolean;
  /** 主动拉一次最新 */
  refresh: () => Promise<void>;
  /** 单条标记已读 */
  markRead: (id: string | number) => Promise<void>;
  /** 全部已读 */
  markAllRead: () => Promise<void>;
  /** 收到 socket 事件时调用：把 payload 转成 NotificationItem 插到列表里 */
  addNotification: (item: NotificationItem) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * 把 socket.io 推过来的原始 payload 归一化为 NotificationItem。
 * 后端 NotificationsService.map 的形状与 API list 形状一致，复用同样的字段读取。
 */
function normalizeFromSocket(raw: Record<string, unknown>): NotificationItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String((raw as any).id ?? '').trim();
  if (!id) return null;
  const readStatus = Number((raw as any).readStatus ?? 0);
  const relatedType = (raw as any).relatedType ?? (raw as any).targetType;
  const relatedId = (raw as any).relatedId ?? (raw as any).targetId;
  const portType = (raw as any).portType;
  const notificationType =
    (raw as any).notificationType ??
    (raw as any).typeCode ??
    (raw as any).type ??
    'system';
  return {
    id,
    notificationType: String(notificationType),
    title: String((raw as any).title ?? '消息提醒'),
    content: (raw as any).content ?? (raw as any).message ?? undefined,
    unread: (raw as any).unread !== undefined ? Boolean((raw as any).unread) : readStatus === 0,
    readAt: ((raw as any).readAt as string | undefined) ?? null,
    createdAt: String((raw as any).createdAt ?? new Date().toISOString()),
    targetType: relatedType != null ? String(relatedType) : undefined,
    targetId: relatedId != null ? String(relatedId) : undefined,
    portType: portType != null ? String(portType) : undefined,
    routeHint: (raw as any).routeHint != null ? String((raw as any).routeHint) : undefined,
  };
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(() =>
    typeof window === 'undefined' ? undefined : readAuthenticatedUser(),
  );
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  // 防止 strict mode 双调用 + 多次兜底轮询叠加
  const pollTimerRef = useRef<number | null>(null);

  const token =
    user?.id && typeof window !== 'undefined' ? window.localStorage.getItem('xhsmedium.token') : null;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listNotifications({ pageSize: BELL_PAGE_SIZE });
      setItems(result.items);
      setUnreadCount(Number(result.unreadCount || result.items.filter((i) => i.unread).length));
    } catch {
      setItems([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const addNotification = useCallback((item: NotificationItem) => {
    if (!item || !item.id) return;
    setItems((prev) => {
      // 去重
      if (prev.some((p) => String(p.id) === String(item.id))) return prev;
      return [item, ...prev].slice(0, 50);
    });
    if (item.unread) {
      setUnreadCount((n) => n + 1);
    }
  }, []);

  const { connected, onMessage } = useNotificationSocket({
    token: token ?? null,
    userId: user?.id ?? null,
  });

  // 监听 socket 事件：把新通知加到列表，并异步校准未读数
  useEffect(() => {
    const unsubscribe = onMessage((raw) => {
      const normalized = normalizeFromSocket(raw);
      if (normalized) {
        addNotification(normalized);
        // 弹一个 toast
        try {
          message.info({
            content: `${normalized.title}${normalized.content ? `: ${normalized.content}` : ''}`,
            duration: 3,
          });
        } catch {
          // message 在未挂载时调用可能抛错，吞掉
        }
        // 后端用 listForUser 维护未读；这里兜底再校准一次
        refresh();
      }
    });
    return unsubscribe;
  }, [onMessage, addNotification, refresh]);

  // 60s 兜底轮询：socket 断线时也能拿到最新
  useEffect(() => {
    if (!user?.id) return undefined;
    refresh();
    pollTimerRef.current = window.setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [user?.id, refresh]);

  // 监听登录态变化（同一 tab 登录/登出）
  useEffect(() => {
    const sync = () => setUser(readAuthenticatedUser());
    window.addEventListener('storage', sync);
    window.addEventListener('xhsmedium:auth-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('xhsmedium:auth-changed', sync);
    };
  }, []);

  const markRead = useCallback(
    async (id: string | number) => {
      // 乐观更新
      let prevUnread = false;
      setItems((prev) =>
        prev.map((entry) => {
          if (String(entry.id) === String(id) && entry.unread) {
            prevUnread = true;
            return { ...entry, unread: false };
          }
          return entry;
        }),
      );
      if (prevUnread) setUnreadCount((n) => Math.max(0, n - 1));
      try {
        await markNotificationRead(id);
      } catch {
        if (prevUnread) {
          setItems((prev) =>
            prev.map((entry) =>
              String(entry.id) === String(id) ? { ...entry, unread: true } : entry,
            ),
          );
          setUnreadCount((n) => n + 1);
        }
        // 静默失败：bell 已做本地兜底
      }
    },
    [],
  );

  const markAllRead = useCallback(async () => {
    const before = unreadCount;
    setUnreadCount(0);
    setItems((prev) => prev.map((entry) => ({ ...entry, unread: false })));
    try {
      await markAllNotificationsRead();
    } catch {
      // 失败时回滚
      setUnreadCount(before);
      setItems((prev) => prev.map((entry) => ({ ...entry, unread: true })));
      throw new Error('全部已读失败');
    }
  }, [unreadCount]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unreadCount,
      connected,
      loading,
      refresh,
      markRead,
      markAllRead,
      addNotification,
    }),
    [items, unreadCount, connected, loading, refresh, markRead, markAllRead, addNotification],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
