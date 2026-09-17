import { User } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const ACTOR_COOKIE = "ops_actor";

/**
 * Stand-in for SSO: the acting user is held in a cookie so roles can be
 * exercised locally. Everything downstream still re-reads the actor inside
 * `mutate()`, so this never grants permission on its own.
 */
export async function getActor(): Promise<User | null> {
  const jar = await cookies();
  const actorId = jar.get(ACTOR_COOKIE)?.value;

  if (actorId) {
    const actor = await prisma.user.findFirst({
      where: { id: actorId, isActive: true },
    });
    if (actor) return actor;
  }

  return prisma.user.findFirst({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
}

export async function listActors(): Promise<User[]> {
  return prisma.user.findMany({
    where: { isActive: true },
    orderBy: [{ role: "asc" }, { email: "asc" }],
  });
}
