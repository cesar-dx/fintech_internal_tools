import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mutate } from "@/lib/mutate";
import { redactEmail, redactName } from "@/lib/redact";

export const USER_ENTITY = "User";

export type UserView = {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
};

/** Reads users for a viewer, redacting PII at the point of fetch. */
export async function listUsers(viewerRole: Role): Promise<UserView[]> {
  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });
  return users.map((user) => ({
    id: user.id,
    name: redactName(user.name, viewerRole),
    email: redactEmail(user.email, viewerRole),
    role: user.role,
    isActive: user.isActive,
  }));
}

export async function changeUserRole(params: {
  actorId: string;
  userId: string;
  role: Role;
  reason: string;
}) {
  return mutate({
    actorId: params.actorId,
    action: "user.change_role",
    entityType: USER_ENTITY,
    entityId: params.userId,
    reason: params.reason,
    metadata: { role: params.role },
    apply: (tx) =>
      tx.user.update({
        where: { id: params.userId },
        data: { role: params.role },
      }),
  });
}

export async function deactivateUser(params: {
  actorId: string;
  userId: string;
  reason: string;
}) {
  return mutate({
    actorId: params.actorId,
    action: "user.deactivate",
    entityType: USER_ENTITY,
    entityId: params.userId,
    reason: params.reason,
    apply: (tx) =>
      tx.user.update({
        where: { id: params.userId },
        data: { isActive: false },
      }),
  });
}
