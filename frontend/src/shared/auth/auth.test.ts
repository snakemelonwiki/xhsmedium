import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canAccessPath,
  clearAuth,
  getAuthRedirectPath,
  getDefaultHomePath,
  getPortHomePath,
  isAppRole,
  persistAuth,
  readAuthenticatedUser,
  STORAGE_KEYS,
  type AppRole,
} from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auth route helpers', () => {
  it('maps each role to its default home path', () => {
    expect(getDefaultHomePath('operation')).toBe('/operation');
    expect(getDefaultHomePath('sales')).toBe('/sales/leads');
    expect(getDefaultHomePath('academic')).toBe('/academic');
    expect(getDefaultHomePath('admin')).toBe('/admin');
  });

  it('maps known ports to the matching role home path', () => {
    expect(getPortHomePath('3000')).toBe('/operation');
    expect(getPortHomePath('3001')).toBe('/admin');
    expect(getPortHomePath('3302')).toBe('/sales/leads');
    expect(getPortHomePath('3003')).toBe('/academic');
  });

  it('falls back to the supplied user role when the port is not a business port', () => {
    expect(getPortHomePath('5173', 'sales')).toBe('/sales/leads');
    expect(getPortHomePath('', 'academic')).toBe('/academic');
  });

  it('allows public login and same-role paths only', () => {
    expect(canAccessPath(undefined, '/login')).toBe(true);
    expect(canAccessPath('sales', '/sales/leads')).toBe(true);
    expect(canAccessPath('sales', '/sales/leads/42')).toBe(true);
    expect(canAccessPath('sales', '/operation/leads')).toBe(false);
    expect(canAccessPath(undefined, '/sales/leads')).toBe(false);
  });

  it('treats admin as able to enter every protected port shell', () => {
    expect(canAccessPath('admin', '/operation')).toBe(true);
    expect(canAccessPath('admin', '/sales/leads')).toBe(true);
    expect(canAccessPath('admin', '/academic')).toBe(true);
  });

  it('redirects unauthenticated users to login and unauthorized users to forbidden', () => {
    expect(getAuthRedirectPath(undefined, '/operation/leads')).toBe('/login');
    expect(getAuthRedirectPath({ id: '1', name: '销售', role: 'sales' }, '/operation/leads')).toBe('/forbidden');
    expect(getAuthRedirectPath({ id: '1', name: '销售', role: 'sales' }, '/sales/leads')).toBeUndefined();
  });

  it('validates roles and exposes stable localStorage keys', () => {
    const roles: AppRole[] = ['operation', 'sales', 'academic', 'admin'];

    expect(roles.every(isAppRole)).toBe(true);
    expect(isAppRole('staff')).toBe(false);
    expect(STORAGE_KEYS.token).toBe('xhsmedium.token');
    expect(STORAGE_KEYS.user).toBe('xhsmedium.user');
  });

  it('rejects stored users when the token is missing', () => {
    const user = JSON.stringify({ id: '1', name: '运营', role: 'operation' });
    const storage = {
      getItem: (key: string) => key === STORAGE_KEYS.user ? user : null,
    };

    expect(readAuthenticatedUser(storage)).toBeUndefined();
  });

  it('rejects stored users when token belongs to another user', () => {
    const tokenPayload = btoa(JSON.stringify({ sub: 'academic-1', role: 'academic' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const storage = {
      getItem: (key: string) => {
        if (key === STORAGE_KEYS.token) return `header.${tokenPayload}.signature`;
        if (key === STORAGE_KEYS.user) return JSON.stringify({ id: 'admin-1', name: 'admin2', role: 'admin' });
        return null;
      },
    };

    expect(readAuthenticatedUser(storage)).toBeUndefined();
  });

  it('notifies listeners after auth storage changes', () => {
    const events: string[] = [];
    const target = new EventTarget();
    const storage = {
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    const listener = () => events.push('changed');
    vi.stubGlobal('window', {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    });

    window.addEventListener('xhsmedium:auth-changed', listener);

    persistAuth('token-1', { id: '1', name: '主管', role: 'admin' }, storage);
    clearAuth(storage);

    window.removeEventListener('xhsmedium:auth-changed', listener);
    expect(events).toEqual(['changed', 'changed']);
  });
});
