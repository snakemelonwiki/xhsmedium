'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * 通知 WebSocket Hook.
 *
 * 单例连接 /notifications 命名空间；通过 auth.token 携带登录态，
 * 后端 NotificationsGateway 会用 JwtService 校验并把 userId 写进
 * socket.data。组件只关心「是否连上」「有新事件」「手动重连」。
 */
type NotificationMessage = Record<string, unknown>;

type UseNotificationSocketOptions = {
  /** 登录 token；为空时不连接（未登录） */
  token: string | null;
  /** 已登录用户 id，作为连接成功的兜底；空时也不连接 */
  userId?: string | null;
  /** 关闭时是否真正断开；默认 false（保持单例） */
  disconnectOnUnmount?: boolean;
};

type UseNotificationSocketResult = {
  connected: boolean;
  /** 注册消息回调，返回卸载函数。多次调用彼此独立。 */
  onMessage: (handler: (payload: NotificationMessage) => void) => () => void;
  /** 主动触发重连（disconnect → connect） */
  reconnect: () => void;
};

type SocketState = {
  socket: Socket | null;
  refCount: number;
  listeners: Set<(payload: NotificationMessage) => void>;
};

const NAMESPACE = '/notifications';

// 单例：跨组件复用同一个 socket。SSR 阶段不创建。
let globalState: SocketState | null = null;
let currentToken: string | null = null;
let currentUserId: string | null = null;

function resolveBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  // 优先使用构建期注入的后端地址
  const fromEnv = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  // 兜底：使用当前 origin。Next 客户端拿不到后端端口，依赖 next.config.mjs
  // 的 rewrite 把 /api 转发到后端；WebSocket 需要绕过 rewrite，所以这里要
  // 显式走与 API 一致的主机。开发期在 .env 中设置 NEXT_PUBLIC_BACKEND_URL
  // 指向真实后端地址即可；如未设置，回退到当前 origin（同源场景）。
  return window.location.origin;
}

function ensureSocket(token: string, userId: string | null): SocketState {
  if (globalState) return globalState;
  const state: SocketState = {
    socket: null,
    refCount: 0,
    listeners: new Set(),
  };
  globalState = state;
  currentToken = token;
  currentUserId = userId;

  const baseUrl = resolveBaseUrl();
  const socket = io(`${baseUrl}${NAMESPACE}`, {
    transports: ['websocket', 'polling'],
    auth: { token, userId: userId ?? '' },
    query: { token, userId: userId ?? '' },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000,
    autoConnect: true,
  });

  socket.on('connect', () => {
    // 连接建立；如果 token 变化（登录切换）则重连
    if (currentToken && currentToken !== token) {
      socket.auth = { token: currentToken, userId: currentUserId ?? '' };
      socket.disconnect();
      socket.connect();
    }
  });

  socket.on('connect_error', (err: Error) => {
    // eslint-disable-next-line no-console
    console.warn('[useNotificationSocket] connect_error', err?.message || err);
  });

  // 后端约定事件：notification.created（首选）、notification:new（兼容）
  const dispatch = (payload: NotificationMessage) => {
    state.listeners.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[useNotificationSocket] handler error', err);
      }
    });
  };
  socket.on('notification.created', dispatch);
  socket.on('notification:new', dispatch);

  state.socket = socket;
  return state;
}

function disposeSocket(force: boolean) {
  const state = globalState;
  if (!state || !state.socket) return;
  if (!force && state.refCount > 0) return;
  try {
    state.socket.removeAllListeners();
    state.socket.disconnect();
  } catch {
    // ignore
  }
  state.socket = null;
  state.listeners.clear();
  globalState = null;
  currentToken = null;
  currentUserId = null;
}

export function useNotificationSocket(options: UseNotificationSocketOptions): UseNotificationSocketResult {
  const { token, userId, disconnectOnUnmount = false } = options;
  const [connected, setConnected] = useState(false);

  // 订阅 / 取消订阅单例 socket
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!token) {
      setConnected(false);
      return undefined;
    }
    const isFresh = !globalState;
    const state = ensureSocket(token, userId ?? null);
    if (isFresh) {
      state.refCount = 1;
    } else {
      state.refCount += 1;
    }
    // 让最新的 token / userId 写入（用于 connect 时检测 token 变化）
    const previousToken = state.socket?.auth && (state.socket.auth as any).token;
    currentToken = token;
    currentUserId = userId ?? null;
    if (!isFresh && previousToken && previousToken !== token && state.socket) {
      // token 变了，主动重连让后端用新 token 重新校验
      try {
        state.socket.auth = { token, userId: userId ?? '' };
        state.socket.disconnect();
        state.socket.connect();
      } catch {
        // ignore
      }
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const socket = state.socket;
    socket?.on('connect', onConnect);
    socket?.on('disconnect', onDisconnect);
    setConnected(Boolean(socket?.connected));

    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      state.refCount = Math.max(0, state.refCount - 1);
      if (disconnectOnUnmount || state.refCount === 0) {
        disposeSocket(disconnectOnUnmount);
      }
    };
  }, [token, userId, disconnectOnUnmount]);

  const onMessage = useCallback((handler: (payload: NotificationMessage) => void) => {
    if (globalState) {
      globalState.listeners.add(handler);
    }
    return () => {
      globalState?.listeners.delete(handler);
    };
  }, []);

  const reconnect = useCallback(() => {
    const state = globalState;
    if (!state?.socket) return;
    try {
      state.socket.disconnect();
      state.socket.connect();
    } catch {
      // ignore
    }
  }, []);

  return useMemo(() => ({ connected, onMessage, reconnect }), [connected, onMessage, reconnect]);
}
