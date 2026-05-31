import { Tag } from 'antd';

import { getStatusMeta, type StatusKind } from '@/shared/constants/status';

type StatusTagProps = {
  kind: StatusKind;
  code?: string | null;
};

/**
 * Displays status codes with the shared V1.1 label and color contract.
 */
export function StatusTag({ kind, code }: StatusTagProps) {
  const meta = getStatusMeta(kind, code);
  return <Tag color={meta.color}>{meta.label}</Tag>;
}
