import { Prisma, Role } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { mutate } from "../src/lib/mutate";
import { USER_ENTITY } from "../src/lib/users";

const BOOTSTRAP_ADMIN = {
  email: "dana.okafor@example.com",
  name: "Dana Okafor",
  role: Role.ADMIN,
};

const SEED_USERS = [
  { email: "arun.mehta@example.com", name: "Arun Mehta", role: Role.ANALYST },
  { email: "lena.fischer@example.com", name: "Lena Fischer", role: Role.ANALYST },
  { email: "maya.torres@example.com", name: "Maya Torres", role: Role.REVIEWER },
  { email: "sam.whitfield@example.com", name: "Sam Whitfield", role: Role.REVIEWER },
  { email: "priya.raman@example.com", name: "Priya Raman", role: Role.ADMIN },
];

async function createUser(
  tx: Prisma.TransactionClient,
  user: { email: string; name: string; role: Role },
) {
  return tx.user.create({ data: user });
}

async function main() {
  // The first admin is the bootstrap of the audit chain: there is no actor yet
  // to attribute the change to, so it is created directly and audited as a
  // self-attributed entry once the row exists.
  const admin = await prisma.user.upsert({
    where: { email: BOOTSTRAP_ADMIN.email },
    update: {},
    create: BOOTSTRAP_ADMIN,
  });

  await prisma.auditLogEntry.create({
    data: {
      actorId: admin.id,
      action: "user.create",
      entityType: USER_ENTITY,
      entityId: admin.id,
      reason: "Seed: bootstrap the first administrator",
    },
  });

  // Every other state change goes through `mutate()`, exactly like app code.
  for (const user of SEED_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (existing) continue;

    await mutate({
      actorId: admin.id,
      action: "user.create",
      entityType: USER_ENTITY,
      reason: `Seed: onboard ${user.role.toLowerCase()} for local development`,
      metadata: { role: user.role },
      apply: (tx) => createUser(tx, user),
      resolveEntityId: (created) => created.id,
    });
  }

  const counts = await prisma.user.groupBy({ by: ["role"], _count: true });
  console.log("Seeded users:", counts);
  console.log("Audit entries:", await prisma.auditLogEntry.count());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
