import { Prisma, RiskFlag, Role } from "@prisma/client";
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

/** Stand-in for the vendor feed: applications arrive already submitted. */
const SEED_CASES = [
  {
    reference: "KYC-1041",
    applicantName: "Nadia Haddad",
    applicantEmail: "nadia.haddad@example.com",
    dateOfBirth: new Date("1991-04-18"),
    nationalId: "AB-7741-2290",
    country: "Portugal",
    address: "Rua das Flores 12, 1200-192 Lisboa",
    occupation: "Freelance designer",
    submittedAt: new Date("2026-09-08T09:12:00Z"),
    riskFlag: RiskFlag.LOW,
    riskNotes: "Document match on first pass. No adverse media.",
  },
  {
    reference: "KYC-1042",
    applicantName: "Tobias Lindqvist",
    applicantEmail: "tobias.lindqvist@example.com",
    dateOfBirth: new Date("1984-11-02"),
    nationalId: "SE-1102-8845",
    country: "Sweden",
    address: "Sveavägen 44, 111 34 Stockholm",
    occupation: "Logistics manager",
    submittedAt: new Date("2026-09-09T14:47:00Z"),
    riskFlag: RiskFlag.MEDIUM,
    riskNotes: "Address differs from utility bill. Manual check needed.",
  },
  {
    reference: "KYC-1043",
    applicantName: "Grace Abiola",
    applicantEmail: "grace.abiola@example.com",
    dateOfBirth: new Date("1996-02-27"),
    nationalId: "NG-9920-3311",
    country: "Nigeria",
    address: "14 Adeola Odeku St, Victoria Island, Lagos",
    occupation: "Company director",
    submittedAt: new Date("2026-09-10T08:05:00Z"),
    riskFlag: RiskFlag.HIGH,
    riskNotes: "PEP screening hit on a namesake. Source of funds unclear.",
  },
  {
    reference: "KYC-1044",
    applicantName: "Marcus Feld",
    applicantEmail: "marcus.feld@example.com",
    dateOfBirth: new Date("1978-07-30"),
    nationalId: "DE-3310-7782",
    country: "Germany",
    address: "Kantstraße 9, 10623 Berlin",
    occupation: "Contractor",
    submittedAt: new Date("2026-09-11T16:30:00Z"),
    riskFlag: RiskFlag.MEDIUM,
    riskNotes: "Two failed selfie liveness attempts before success.",
  },
  {
    reference: "KYC-1045",
    applicantName: "Ana Beltrán",
    applicantEmail: "ana.beltran@example.com",
    dateOfBirth: new Date("1999-12-14"),
    nationalId: "ES-4417-6620",
    country: "Spain",
    address: "Calle Mayor 3, 28013 Madrid",
    occupation: "Student",
    submittedAt: new Date("2026-09-12T11:22:00Z"),
    riskFlag: RiskFlag.LOW,
    riskNotes: "Thin file, but documents are consistent.",
  },
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

  // Cases arrive from the vendor feed rather than from an operator action, so
  // they are inserted directly; every later transition goes through mutate().
  for (const kycCase of SEED_CASES) {
    await prisma.kycCase.upsert({
      where: { reference: kycCase.reference },
      update: {},
      create: kycCase,
    });
  }

  const counts = await prisma.user.groupBy({ by: ["role"], _count: true });
  console.log("Seeded users:", counts);
  console.log("Seeded KYC cases:", await prisma.kycCase.count());
  console.log("Audit entries:", await prisma.auditLogEntry.count());
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
