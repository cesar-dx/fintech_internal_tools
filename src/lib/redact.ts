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

/** Keeps the last four characters so cases stay distinguishable. */
export function redactIdNumber(idNumber: string, viewerRole: Role): string {
  if (canSeePii(viewerRole)) return idNumber;
  return `••••${idNumber.slice(-4)}`;
}

export function redactAddress(address: string, viewerRole: Role): string {
  return canSeePii(viewerRole) ? address : REDACTED;
}

/** Year only for viewers without PII access, so age checks still work. */
export function redactDateOfBirth(dob: Date, viewerRole: Role): string {
  if (canSeePii(viewerRole)) return dob.toISOString().slice(0, 10);
  return `${dob.getUTCFullYear()}-••-••`;
}
