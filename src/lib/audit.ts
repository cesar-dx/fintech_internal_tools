import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { redactName } from "@/lib/redact";

export type AuditEntryView = {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: Date;
};

/** Audit trail for one record, newest first, with actor PII redacted at fetch. */
export async function auditTrailFor(
  entityType: string,
  entityId: string,
  viewerRole: Role,
  limit = 50,
): Promise<AuditEntryView[]> {
  const entries = await prisma.auditLogEntry.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: true },
  });

  return entries.map((entry) => ({
    id: entry.id,
    actor: redactName(entry.actor.name, viewerRole),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason,
    createdAt: entry.createdAt,
  }));
}
