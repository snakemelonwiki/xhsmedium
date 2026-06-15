'use client';

import { Select, Segmented, Tabs } from 'antd';
import React from 'react';

import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';

export type ResponsiveSwitchItem = {
  key: string;
  label: React.ReactNode;
};

export type ResponsiveTabsSwitcherProps = {
  items: ResponsiveSwitchItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

/**
 * Responsive tab switcher that adapts between desktop and mobile.
 *
 * - Desktop (isMobile === false): renders Ant Design `Tabs`.
 * - Mobile <= 3 items: renders Ant Design `Segmented`.
 * - Mobile > 3 items: renders Ant Design `Select` dropdown.
 */
export function ResponsiveTabsSwitcher({
  items,
  activeKey,
  onChange,
}: ResponsiveTabsSwitcherProps) {
  const { isMobile } = useResponsiveBreakpoint();

  // Desktop / tablet: use Tabs
  if (!isMobile) {
    return (
      <Tabs
        activeKey={activeKey}
        onChange={onChange}
        items={items.map((item) => ({ key: item.key, label: item.label }))}
      />
    );
  }

  // Mobile with 3 or fewer items: use Segmented
  if (items.length <= 3) {
    return (
      <Segmented
        options={items.map((item) => ({ label: item.label, value: item.key }))}
        value={activeKey}
        onChange={(val) => onChange(val as string)}
      />
    );
  }

  // Mobile with more than 3 items: use Select dropdown
  const selectedItem = items.find((item) => item.key === activeKey);
  return (
    <Select
      value={activeKey}
      onChange={(val) => onChange(val as string)}
      options={items.map((item) => ({ label: item.label, value: item.key }))}
      style={{ width: '100%' }}
      placeholder={selectedItem?.label ?? '请选择'}
    />
  );
}
