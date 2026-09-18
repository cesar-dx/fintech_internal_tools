import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "@/lib/db";
import { requestRefund, RefundValidationError } from "@/lib/refunds";

const RUN = `test-${Date.now()}-${process.pid}`;

async function createAnalyst(name: string) {
  return prisma.user.create({
    data: { email: `${RUN}-${name}@example.test`, name, role: "ANALYST" },
  });
}

async function createTransaction(amountCents: number) {
  return prisma.transaction.create({
    data: {
      reference: `${RUN}-${Math.random().toString(36).slice(2, 8)}`,
      customerName: "Test Customer",
      customerEmail: `${RUN}-customer@example.test`,
      cardLast4: "0000",
      merchant: "Test Merchant",
      description: "Concurrency test",
      amountCents,
      occurredAt: new Date(),
    },
  });
}

describe("requestRefund under concurrency", () => {
  let analystA: { id: string };
  let analystB: { id: string };

  before(async () => {
    [analystA, analystB] = await Promise.all([
      createAnalyst("Analyst A"),
      createAnalyst("Analyst B"),
    ]);
  });

  after(async () => {
    await prisma.auditLogEntry.deleteMany({
      where: { actorId: { in: [analystA.id, analystB.id] } },
    });
    await prisma.refund.deleteMany({
      where: { transaction: { reference: { startsWith: RUN } } },
    });
    await prisma.transaction.deleteMany({
      where: { reference: { startsWith: RUN } },
    });
    await prisma.user.deleteMany({ where: { email: { startsWith: RUN } } });
    await prisma.$disconnect();
  });

  it("lets only one of two simultaneous requests consume the balance", async () => {
    const transaction = await createTransaction(10_000);
    const request = (actorId: string) =>
      requestRefund({
        actorId,
        transactionId: transaction.id,
        amountCents: 6_000,
        reason: "Customer disputed the charge",
      });

    const results = await Promise.allSettled([
      request(analystA.id),
      request(analystB.id),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0].status === "rejected" &&
        rejected[0].reason instanceof RefundValidationError,
      "the loser must fail the refundable balance check",
    );

    const after = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
      include: { refunds: true },
    });
    assert.equal(after.refunds.length, 1);
    assert.equal(after.refundedCents, 6_000);
    assert.ok(after.refundedCents <= after.amountCents);
  });

  it("caps many simultaneous requests at the refundable balance", async () => {
    const transaction = await createTransaction(10_000);
    const actors = [analystA.id, analystB.id];

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        requestRefund({
          actorId: actors[i % actors.length],
          transactionId: transaction.id,
          amountCents: 3_000,
          reason: "Duplicate charge",
        }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(fulfilled, 3);

    const after = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
      include: { refunds: true },
    });
    assert.equal(after.refunds.length, 3);
    assert.equal(after.refundedCents, 9_000);
  });
});
