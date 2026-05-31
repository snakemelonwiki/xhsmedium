'use client';

import { Button, Popconfirm } from 'antd';
import type { ButtonProps } from 'antd';
import type { ReactNode } from 'react';

import { useSubmitLock } from '@/shared/hooks/useSubmitLock';

type ConfirmActionButtonProps = Omit<ButtonProps, 'onClick'> & {
  confirmTitle?: ReactNode;
  confirmDescription?: ReactNode;
  onConfirm: () => Promise<void> | void;
};

/**
 * Action button with confirmation and duplicate-submit protection.
 */
export function ConfirmActionButton({
  children,
  confirmTitle = '确认执行该操作？',
  confirmDescription,
  onConfirm,
  ...buttonProps
}: ConfirmActionButtonProps) {
  const { submitting, run } = useSubmitLock();

  return (
    <Popconfirm
      title={confirmTitle}
      description={confirmDescription}
      onConfirm={() => run(onConfirm)}
      okText="确认"
      cancelText="取消"
    >
      <Button {...buttonProps} loading={submitting}>
        {children}
      </Button>
    </Popconfirm>
  );
}
