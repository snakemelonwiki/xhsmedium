import { ROLES } from '../constants/roles';

export function isOperationCompatibleRole(role?: string | null): boolean {
  return role === ROLES.OPERATION || role === ROLES.STAFF;
}

export function isPrivilegedRole(role?: string | null): boolean {
  return role === ROLES.ADMIN || role === ROLES.SUPERVISOR || role === ROLES.OWNER;
}

export function isOwnerPortalRole(role?: string | null): boolean {
  return role === ROLES.OWNER;
}
