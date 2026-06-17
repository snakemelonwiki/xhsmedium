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
import { NotificationAlertModal } from '@/shared/components/notifications/NotificationAlertModal';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';
import type { NotificationItem } from '@/shared/types/notifications';

const POLL_INTERVAL_MS = 60_000;
const BELL_PAGE_SIZE = 8;

/**
 * 高优先级跨角色通知：socket 推送时会弹"必须确认"模态卡片，强制让用户看到。
 *
 * 命中此集合的通知 → NotificationAlertModal 弹窗 + 入铃铛列表 + 不再叠 message.info；
 * 未命中此集合的通知 → 老逻辑：只在右上角弹一条 3s 自动消失的 message.info。
 *
 * 业务覆盖：
 *   - lead_assigned          ：运营 → 销售（新分派客资）
 *   - collaboration_requested：销售/教务 → 运营（请求协同）
 *   - collaboration_handled  ：运营 → 销售（协同已处理）
 *   - reminder               ：销售 ⇄ 运营 / 教务 ⇄ 销售（手动提醒）
 *   - order_handed_over      ：销售 → 教务（订单交接）
 *   - order_accepted         ：教务 → 销售（已接单）
 *   - order_abnormal         ：教务 → 销售（订单异常反馈）
 *
 * 不命中（仍走 toast 即可，避免遮屏）：
 *   - export_done / import_done（个人异步任务，结果可在导入导出中心慢看）
 *   - order_node_due / order_node_overdue（系统自动跑的兜底提醒）
 *   - customer_added / customer_not_passed / lead_status_changed（状态变更类）
 *   - lead_source_confirmed
 */
const HIGH_PRIORITY_NOTIFICATION_TYPES: ReadonlySet<string> = new Set([
  'lead_assigned',
  'collaboration_requested',
  'collaboration_handled',
  'reminder',
  'order_handed_over',
  'order_accepted',
  'order_abnormal',
]);

/**
 * pendingAlerts 持久化策略
 * ─────────────────────────
 * 用户在弹窗上点 "我已知晓" 之前关掉浏览器 / 刷新页面 / 切到其它页面，
 * 重新进入时这些没确认过的高优先级通知 **必须重新弹出来**，不能"刷新就跑掉"。
 *
 * 实现：localStorage 按用户隔离，配合：
 *   1) 多 Tab 同步：监听 `storage` 事件，A Tab 确认 → B Tab 立即同步消失；
 *   2) TTL 兜底：超过 ALERT_TTL_MS 的弹窗不再恢复，避免上线时被几个月前的"僵尸"通知淹没；
 *   3) 容量上限：最多保留 ALERT_PERSIST_MAX 条，防止 localStorage 无限增长；
 *   4) 用户隔离：key = 前缀 + userId，避免共用浏览器时把 A 的待确认弹给 B。
 */
const ALERT_STORAGE_PREFIX = 'xhsmedium.pending-alerts:';
const ALERT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
const ALERT_PERSIST_MAX = 20;

function alertStorageKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${ALERT_STORAGE_PREFIX}${userId}`;
}

/**
 * 把 localStorage 里残留的待确认弹窗读回内存。会做：
 *   - JSON 解析容错
 *   - createdAt 超过 TTL 的过滤掉（避免用户登入时被一堆历史"僵尸"弹窗淹没）
 *   - 仍只保留高优先级类型（防御性：万一 SET 列表收紧，老类型不再硬弹）
 *   - 截断到 ALERT_PERSIST_MAX 条
 */
function loadPersistedAlerts(userId: string | null | undefined): NotificationItem[] {
  if (typeof window === 'undefined') return [];
  const key = alertStorageKey(userId);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const filtered: NotificationItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const id = (entry as { id?: unknown }).id;
      const createdAt = (entry as { createdAt?: unknown }).createdAt;
      if (id === undefined || id === null || !createdAt) continue;
      const ts = Date.parse(String(createdAt));
      if (Number.isNaN(ts) || now - ts > ALERT_TTL_MS) continue;
      const type = String((entry as { notificationType?: unknown }).notificationType || '');
      if (!HIGH_PRIORITY_NOTIFICATION_TYPES.has(type)) continue;
      filtered.push(entry as NotificationItem);
      if (filtered.length >= ALERT_PERSIST_MAX) break;
    }
    return filtered;
  } catch {
    return [];
  }
}

/**
 * 把当前队列写回 localStorage。空队列 → 直接删 key，保持存储干净。
 * 失败完全静默：localStorage 在隐身模式 / 配额满 / SSR 下都可能不可用。
 */
function persistAlerts(userId: string | null | undefined, alerts: NotificationItem[]): void {
  if (typeof window === 'undefined') return;
  const key = alertStorageKey(userId);
  if (!key) return;
  try {
    if (alerts.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(
      key,
      JSON.stringify(alerts.slice(0, ALERT_PERSIST_MAX)),
    );
  } catch {
    /* 配额满 / 隐身模式 / SSR：忽略 */
  }
}

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
  /** 等待用户确认的高优先级通知队列（FIFO） */
  pendingAlerts: NotificationItem[];
  /** 关闭当前弹窗 + 标记已读 + 推进队列 */
  dismissCurrentAlert: () => Promise<void>;
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
  // 高优先级通知队列：socket 推送时入队，用户逐条 "我已知晓" 后出队
  // 初始值：SSR 下为空；客户端 mount 后由 hydrate effect 从 localStorage 拉回。
  const [pendingAlerts, setPendingAlerts] = useState<NotificationItem[]>([]);
  // 防止同一条通知被重复入队（socket 偶尔会双发 notification.created + notification:new）
  const alertedIdsRef = useRef(new Set<string>());
  // 防止 strict mode 双调用 + 多次兜底轮询叠加
  const pollTimerRef = useRef<number | null>(null);
  const toastShownIdsRef = useRef(new Set<string>());
  // hydrate 是否已经跑过：避免首次 setPendingAlerts([]) 误把 localStorage 清空
  const hydratedUserRef = useRef<string | null>(null);

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
        const idKey = String(normalized.id);
        const isHighPriority = HIGH_PRIORITY_NOTIFICATION_TYPES.has(
          String(normalized.notificationType || ''),
        );

        // 高优先级跨角色通知：入弹窗队列（强交互，必须用户点 "我已知晓" 才关闭）；
        // 其它低优先级通知：保留旧的 message.info 短 toast，不打扰用户。
        try {
          if (isHighPriority) {
            if (!alertedIdsRef.current.has(idKey)) {
              alertedIdsRef.current.add(idKey);
              if (alertedIdsRef.current.size > 200) alertedIdsRef.current.clear();
              setPendingAlerts((prev) =>
                prev.some((p) => String(p.id) === idKey) ? prev : [...prev, normalized],
              );
            }
          } else if (!toastShownIdsRef.current.has(idKey)) {
            toastShownIdsRef.current.add(idKey);
            if (toastShownIdsRef.current.size > 100) toastShownIdsRef.current.clear();
            message.info({
              content: normalized.title || '新通知',
              duration: 3,
            });
          }
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

  // ── pendingAlerts 持久化：hydrate / write-through / 多 Tab 同步 ────────
  // (a) hydrate：用户登入 / 切换用户时，把 localStorage 里残留的待确认弹窗读回来；
  //     hydratedUserRef 记录"当前 hydrate 的是哪个 userId"，避免：
  //       - 首次 setPendingAlerts([]) 在 hydrate 之前误把 localStorage 清空
  //       - 多次切换用户时漏 hydrate
  //     登出（user → undefined）：清空内存队列，但 **保留** localStorage —— 同一用户
  //     下次登入时还能再弹回来。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const uid = user?.id ? String(user.id) : null;
    if (!uid) {
      // 登出 / 登录失效：内存队列清空（避免 modal 还遮屏），但不动 localStorage
      hydratedUserRef.current = null;
      setPendingAlerts([]);
      alertedIdsRef.current.clear();
      return;
    }
    if (hydratedUserRef.current === uid) return;
    hydratedUserRef.current = uid;
    const persisted = loadPersistedAlerts(uid);
    if (!persisted.length) return;
    setPendingAlerts((prev) => {
      // 与内存里已有的合并（覆盖以 prev 为准，避免重复）
      const seen = new Set(prev.map((p) => String(p.id)));
      const merged = [...prev];
      for (const item of persisted) {
        const k = String(item.id);
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(item);
        // 同步进 alertedIdsRef，防止 socket 之后再推同一条造成弹两次
        alertedIdsRef.current.add(k);
      }
      return merged;
    });
  }, [user?.id]);

  // (b) write-through：每次 pendingAlerts 变化都同步写回 localStorage。
  //     依赖 hydratedUserRef 防止 hydrate 之前就把 localStorage 清掉。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const uid = user?.id ? String(user.id) : null;
    if (!uid) return;
    // 必须等 hydrate 完成后再写，否则首次 render 的空 [] 会覆盖掉 localStorage 里的旧数据
    if (hydratedUserRef.current !== uid) return;
    persistAlerts(uid, pendingAlerts);
  }, [pendingAlerts, user?.id]);

  // (c) 多 Tab 同步：listen `storage` 事件 —— A Tab 在弹窗上点 "我已知晓" 后，
  //     B Tab 立即同步消失对应弹窗。注意：浏览器只在**其它** tab 写入时触发本 tab 的
  //     storage 事件，所以不会形成"自己写自己读"死循环。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const uid = user?.id ? String(user.id) : null;
    if (!uid) return undefined;
    const watchedKey = alertStorageKey(uid);
    if (!watchedKey) return undefined;
    const handler = (event: StorageEvent) => {
      if (event.key !== watchedKey) return;
      // 拿最新值重新渲染。null = 其它 tab 删了 key（队列清空）。
      const fresh = loadPersistedAlerts(uid);
      setPendingAlerts(fresh);
      // 同步 dedup ref：让那些"已经在另一 tab 被确认掉"的 id 不再次入队
      const live = new Set(fresh.map((a) => String(a.id)));
      // 不能把 alertedIdsRef 完全清掉（其它待入队的 id 可能本 tab 也已经看过），
      // 这里只把"内存已不在队列、又不在 fresh 里"的 id 留着，本 tab 不会再弹。
      // 简单策略：把 fresh 里的 id 都加进去（保证不重复），其它的不动。
      live.forEach((k) => alertedIdsRef.current.add(k));
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [user?.id]);

  // 监听全局 auth:expired：登录失效后立即停掉轮询 + 清空 user，
  // 避免"已经在跳登录页了"的尾巴请求继续 401 → refresh 失败 → 又弹 toast。
  // 同时把 user 置空会让 useNotificationSocket 的 token=null 分支断开 socket，
  // 防止旧 token 触发 socket 鉴权失败循环。
  // pendingAlerts 由 hydrate effect 在 user 置空时清掉内存队列；
  // **不主动删 localStorage** —— 同一用户重新登录时还能再弹回未确认的弹窗。
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onAuthExpired = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setItems([]);
      setUnreadCount(0);
      setUser(undefined);
    };
    window.addEventListener('auth:expired', onAuthExpired);
    return () => window.removeEventListener('auth:expired', onAuthExpired);
  }, []);

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

  /**
   * 关闭当前弹窗：
   *   1) 把队首通知 markRead（写后端 + 同步 items / unreadCount）；
   *   2) 从 pendingAlerts 里出队（下一条会自动顶上来）。
   *
   * markRead 失败不阻塞出队 —— 已经显示给用户看过、用户也确认过，强行卡住反而坏体验。
   */
  const dismissCurrentAlert = useCallback(async () => {
    let dismissed: NotificationItem | undefined;
    setPendingAlerts((prev) => {
      if (!prev.length) return prev;
      dismissed = prev[0];
      return prev.slice(1);
    });
    if (dismissed?.id) {
      try {
        await markRead(dismissed.id);
      } catch {
        // markRead 自身已做乐观回滚 + 失败兜底；这里吞掉，弹窗已经关了
      }
    }
  }, [markRead]);

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
      pendingAlerts,
      dismissCurrentAlert,
    }),
    [
      items,
      unreadCount,
      connected,
      loading,
      refresh,
      markRead,
      markAllRead,
      addNotification,
      pendingAlerts,
      dismissCurrentAlert,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* 高优先级跨角色通知的"必须确认"弹窗。挂在 Provider 内部，确保所有
          消费 useNotifications 的页面共享同一个队列，全局只渲染一份。 */}
      <NotificationAlertModal />
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return ctx;
}
