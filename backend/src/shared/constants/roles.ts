export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  OWNER: 'owner',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
