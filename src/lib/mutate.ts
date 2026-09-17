import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AuditAction, can, rolesFor } from "@/lib/permissions";

export class ActorError extends Error {}
export class PermissionError extends Error {}
export class ReasonRequiredError extends Error {}

type MutateBase<T> = {
  /** Who is making the change. Role and status are read inside the transaction. */
  actorId: string;
  action: AuditAction;
  entityType: string;
  /** Regulatory evidence: the business justification, not a debug message. */
  reason: string;
  metadata?: Prisma.InputJsonValue;
  /** The change itself. Must use `tx`, never the global client. */
  apply: (tx: Prisma.TransactionClient) => Promise<T>;
};

export type MutateInput<T> = MutateBase<T> &
  (
    | { entityId: string; resolveEntityId?: never }
    | { entityId?: never; resolveEntityId: (result: T) => string }
  );

/**
 * The only supported way to change state. In a single transaction it:
 * 1. loads the actor and checks the action against their role,
 * 2. applies the change,
 * 3. appends the audit entry describing who / what / which / why / when.
 *
 * If any step fails the whole transaction rolls back, so a change can never
 * exist without its audit entry and vice versa.
 */
export async function mutate<T>(input: MutateInput<T>): Promise<T> {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new ReasonRequiredError(`Action ${input.action} requires a reason`);
  }

  return prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUnique({ where: { id: input.actorId } });
    if (!actor) {
      throw new ActorError(`Unknown actor ${input.actorId}`);
    }
    if (!actor.isActive) {
      throw new ActorError(`Actor ${actor.id} is deactivated`);
    }
    if (!can(actor.role, input.action)) {
      throw new PermissionError(
        `Role ${actor.role} cannot perform ${input.action} (allowed: ${rolesFor(
          input.action,
        ).join(", ")})`,
      );
    }

    const result = await input.apply(tx);
    const entityId = input.entityId ?? input.resolveEntityId(result);

    await tx.auditLogEntry.create({
      data: {
        actorId: actor.id,
        action: input.action,
        entityType: input.entityType,
        entityId,
        reason,
        metadata: input.metadata,
      },
    });

    return result;
  });
}
