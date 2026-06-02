export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  OWNER: 'owner',
  OPERATION: 'operation',
  SUPERVISOR: 'supervisor',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
