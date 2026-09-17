import { Role } from "@prisma/client";

/**
 * The set of state-changing actions the ops tools can perform, and the roles
 * allowed to perform them. Feature apps register their actions here so that
 * permission checks and audit action names stay in sync.
 */
export const ACTION_PERMISSIONS = {
  "user.create": ["ADMIN"],
  "user.change_role": ["ADMIN"],
  "user.deactivate": ["ADMIN"],
  "user.reactivate": ["ADMIN"],
  "record.annotate": ["ANALYST", "REVIEWER", "ADMIN"],
  "record.escalate": ["ANALYST", "REVIEWER", "ADMIN"],
  "record.approve": ["REVIEWER", "ADMIN"],
  "record.reject": ["REVIEWER", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type AuditAction = keyof typeof ACTION_PERMISSIONS;

export function rolesFor(action: AuditAction): readonly Role[] {
  return ACTION_PERMISSIONS[action];
}

export function can(role: Role, action: AuditAction): boolean {
  return rolesFor(action).includes(role);
}
