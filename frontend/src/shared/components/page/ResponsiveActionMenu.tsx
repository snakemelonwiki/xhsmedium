'use client';

import React, { useState } from 'react';
import { Button, Drawer, Dropdown, List, Space } from 'antd';

import { useResponsiveBreakpoint } from '@/shared/hooks/useResponsiveBreakpoint';

export type ResponsiveActionItem = {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
};

export type ResponsiveActionMenuProps = {
  triggerLabel: string;
  triggerIcon?: React.ReactNode;
  mobileTitle: string;
  items: ResponsiveActionItem[];
};

/**
 * Renders a dropdown menu on desktop and a bottom drawer on mobile.
 * Uses the shared `useResponsiveBreakpoint` hook (mobile: width < 768).
 */
export function ResponsiveActionMenu({
  triggerLabel,
  triggerIcon,
  mobileTitle,
  items,
}: ResponsiveActionMenuProps) {
  const { isMobile } = useResponsiveBreakpoint();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <Button icon={triggerIcon} onClick={() => setMobileOpen(true)}>
          {triggerLabel}
        </Button>
        <Drawer
          placement="bottom"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          title={mobileTitle}
          height="auto"
        >
          <List
            dataSource={items}
            renderItem={(item) => (
              <List.Item
                key={item.key}
                onClick={() => {
                  item.onClick?.();
                  setMobileOpen(false);
                }}
                style={{ cursor: 'pointer' }}
              >
                <Space>
                  {item.icon}
                  <span style={item.danger ? { color: '#ff4d4f' } : undefined}>
                    {item.label}
                  </span>
                </Space>
              </List.Item>
            )}
          />
        </Drawer>
      </>
    );
  }

  return (
    <Dropdown
      menu={{
        items: items.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
          onClick: item.onClick,
          danger: item.danger,
        })),
      }}
      trigger={['click']}
    >
      <Button icon={triggerIcon}>{triggerLabel}</Button>
    </Dropdown>
  );
}
