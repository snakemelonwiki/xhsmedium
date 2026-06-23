'use client';

import { Segmented, Tooltip } from 'antd';
import { useEffect, useState } from 'react';

import { readStoredUser, type AppRole } from '@/shared/auth/auth';

import { useAdminViewMode } from './AdminViewModeContext';

/**
 * 总后台/运营主管视图一键切换按钮。
 * 仅对 owner / admin 角色显示；supervisor 本身已是运营主管视图，无需切换。
 * 切换不动 Token、不动 user.role，只改变菜单可见性 + employees 页面 scope 过滤。
 */
export function AdminViewToggle() {
  const { mode, setMode } = useAdminViewMode();
  const [role, setRole] = useState<AppRole | undefined>();

  useEffect(() => {
    const user = readStoredUser();
    setRole(user?.role);
  }, []);

  if (role !== 'owner' && role !== 'admin') {
    return null;
  }

  return (
    <Tooltip title="仅切换菜单显示范围，账号权限不变">
      <Segmented
        size="small"
        value={mode}
        onChange={(next) => setMode(next as 'full' | 'supervisor')}
        options={[
          { label: '总后台', value: 'full' },
          { label: '运营主管视图', value: 'supervisor' },
        ]}
      />
    </Tooltip>
  );
}
