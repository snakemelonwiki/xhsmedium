'use client';

import { Alert, Button, Space } from 'antd';
import type { FormInstance } from 'antd';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { clearDraft, loadDraft } from './draftStorage';

type DraftFormShellProps = {
  draftKey: string;
  form: FormInstance;
  children: ReactNode;
};

/**
 * 为录入表单提供本地草稿恢复提示和放弃草稿入口。
 */
export function DraftFormShell({ draftKey, form, children }: DraftFormShellProps) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const draft = loadDraft<Record<string, unknown>>(draftKey);
    if (!draft || Object.keys(draft).length === 0) return;
    form.setFieldsValue(draft);
    setRestored(true);
  }, [draftKey, form]);

  function discardDraft() {
    clearDraft(draftKey);
    form.resetFields();
    setRestored(false);
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {restored ? (
        <Alert
          type="info"
          showIcon
          message="已恢复本地草稿"
          action={<Button size="small" onClick={discardDraft}>放弃草稿</Button>}
        />
      ) : null}
      {children}
    </Space>
  );
}
