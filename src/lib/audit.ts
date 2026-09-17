import { prisma } from "@/lib/db";

export type AuditEntryView = {
  id: string;
  actor: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: Date;
};

/** Audit trail covering several records of one type, newest first. */
export async function auditTrailForMany(
  entityType: string,
  entityIds: string[],
  limit = 50,
): Promise<AuditEntryView[]> {
  if (entityIds.length === 0) return [];

  const entries = await prisma.auditLogEntry.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: true },
  });

  return entries.map(toView);
}

/**
 * Audit trail for one record, newest first. The actor is internal staff, so
 * their identity is part of the evidence and is never redacted.
 */
export async function auditTrailFor(
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditEntryView[]> {
  const entries = await prisma.auditLogEntry.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: true },
  });

  return entries.map(toView);
}

function toView(entry: {
  id: string;
  actor: { name: string; role: string };
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  createdAt: Date;
}): AuditEntryView {
  return {
    id: entry.id,
    actor: entry.actor.name,
    actorRole: entry.actor.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reason: entry.reason,
    createdAt: entry.createdAt,
  };
}
