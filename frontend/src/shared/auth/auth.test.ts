import { describe, expect, it } from 'vitest';

import {
  canAccessPath,
  getAuthRedirectPath,
  getDefaultHomePath,
  getPortHomePath,
  isAppRole,
  readAuthenticatedUser,
  STORAGE_KEYS,
  type AppRole,
} from './auth';

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
    expect(getPortHomePath('3002')).toBe('/sales/leads');
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
});
