export const STORAGE_KEYS = {
  token: 'xhsmedium.token',
  user: 'xhsmedium.user',
} as const;

export const APP_ROLES = ['operation', 'sales', 'academic', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AppUser = {
  id: string;
  name: string;
  role: AppRole;
  employeeId?: string;
  portType?: AppRole;
};

const DEFAULT_HOME_BY_ROLE: Record<AppRole, string> = {
  operation: '/operation',
  sales: '/sales/leads',
  academic: '/academic',
  admin: '/admin',
};

const HOME_BY_PORT: Record<string, AppRole> = {
  '3000': 'operation',
  '3001': 'admin',
  '3002': 'sales',
  '3003': 'academic',
};

const PORT_PREFIX_BY_ROLE: Record<AppRole, string> = {
  operation: '/operation',
  sales: '/sales',
  academic: '/academic',
  admin: '/admin',
};

/**
 * 判断字符串是否为新前端支持的业务角色。
 */
export function isAppRole(role: unknown): role is AppRole {
  return typeof role === 'string' && APP_ROLES.includes(role as AppRole);
}

/**
 * 返回角色登录后的默认业务首页。
 */
export function getDefaultHomePath(role: AppRole): string {
  return DEFAULT_HOME_BY_ROLE[role];
}

/**
 * 根据当前端口推断首页；开发端口无法匹配时回退到用户角色。
 */
export function getPortHomePath(port: string, fallbackRole: AppRole = 'operation'): string {
  const portRole = HOME_BY_PORT[port];
  return getDefaultHomePath(portRole ?? fallbackRole);
}

/**
 * 判断角色是否可以访问目标路径。
 */
export function canAccessPath(role: AppRole | undefined, path: string): boolean {
  if (path === '/' || path.startsWith('/login') || path.startsWith('/forbidden')) {
    return true;
  }

  if (!role) {
    return false;
  }

  if (role === 'admin') {
    return Object.values(PORT_PREFIX_BY_ROLE).some((prefix) => isPathInPrefix(path, prefix));
  }

  return isPathInPrefix(path, PORT_PREFIX_BY_ROLE[role]);
}

/**
 * 返回受保护页面需要执行的认证跳转；无需跳转时返回 undefined。
 */
export function getAuthRedirectPath(user: AppUser | undefined, path: string): string | undefined {
  if (!user) {
    return canAccessPath(undefined, path) ? undefined : '/login';
  }

  return canAccessPath(user.role, path) ? undefined : '/forbidden';
}

/**
 * 从 localStorage 读取当前用户，解析失败时返回 undefined。
 */
export function readStoredUser(storage: Pick<Storage, 'getItem'> = window.localStorage): AppUser | undefined {
  const rawUser = storage.getItem(STORAGE_KEYS.user);
  if (!rawUser) {
    return undefined;
  }

  try {
    const user = JSON.parse(rawUser) as Partial<AppUser>;
    if (user.id && user.name && isAppRole(user.role)) {
      return user as AppUser;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * 读取完整认证态；token 缺失时忽略残留用户信息。
 */
export function readAuthenticatedUser(storage: Pick<Storage, 'getItem'> = window.localStorage): AppUser | undefined {
  if (!storage.getItem(STORAGE_KEYS.token)) {
    return undefined;
  }

  return readStoredUser(storage);
}

/**
 * 保存认证信息，供布局、请求客户端和业务页面复用。
 */
export function persistAuth(token: string, user: AppUser, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  storage.setItem(STORAGE_KEYS.token, token);
  storage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
}

/**
 * 清理认证信息。
 */
export function clearAuth(storage: Pick<Storage, 'removeItem'> = window.localStorage): void {
  storage.removeItem(STORAGE_KEYS.token);
  storage.removeItem(STORAGE_KEYS.user);
}

function isPathInPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}
