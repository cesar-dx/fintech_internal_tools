import { Role } from "@prisma/client";

export const REDACTED = "[redacted]";

/** Roles allowed to see raw PII. Everyone else gets redacted values. */
const PII_ROLES: readonly Role[] = ["REVIEWER", "ADMIN"];

export function canSeePii(role: Role): boolean {
  return PII_ROLES.includes(role);
}

export function redactEmail(email: string, viewerRole: Role): string {
  if (canSeePii(viewerRole)) return email;
  const [local, domain] = email.split("@");
  if (!domain) return REDACTED;
  return `${local.slice(0, 1)}${REDACTED}@${domain}`;
}

export function redactName(name: string, viewerRole: Role): string {
  return canSeePii(viewerRole) ? name : REDACTED;
}
