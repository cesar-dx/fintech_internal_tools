import { RefundStatus, Role, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { mutate } from "@/lib/mutate";
import { AuditAction } from "@/lib/permissions";
import { redactEmail } from "@/lib/redact";

export const TRANSACTION_ENTITY = "Transaction";
export const REFUND_ENTITY = "Refund";

/** Refunds above this amount cannot be issued without a reviewer's approval. */
export const APPROVAL_THRESHOLD_CENTS = 50_000;

export function needsApproval(amountCents: number): boolean {
  return amountCents > APPROVAL_THRESHOLD_CENTS;
}

export function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    amountCents / 100,
  );
}

/** Parses an operator-entered amount ("1,250.00") into minor units. */
export function parseAmountToCents(input: string): number {
  const normalised = input.trim().replace(/[,$\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    throw new RefundValidationError(
      "Enter a refund amount such as 125 or 125.50",
    );
  }
  return Math.round(Number(normalised) * 100);
}

export class RefundValidationError extends Error {}
export class RefundStateError extends Error {}
export class SelfApprovalError extends Error {}

export type TransactionSummary = {
  id: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  cardLast4: string;
  merchant: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  occurredAt: Date;
  status: TransactionStatus;
};

export type RefundView = {
  id: string;
  transactionId: string;
  transactionReference: string;
  customerName: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  requestedBy: string;
  requestedById: string;
  requestedAt: Date;
  reviewedBy: string | null;
  reviewedAt: Date | null;
};

export type TransactionDetail = TransactionSummary & {
  description: string;
  refunds: RefundView[];
  refundableCents: number;
};

/**
 * Card details and the customer email are PII, so they are redacted here at
 * the fetch: a viewer without PII access never receives the raw values.
 */
function toSummary(
  transaction: {
    id: string;
    reference: string;
    customerName: string;
    customerEmail: string;
    cardLast4: string;
    merchant: string;
    amountCents: number;
    refundedCents: number;
    currency: string;
    occurredAt: Date;
    status: TransactionStatus;
  },
  viewerRole: Role,
): TransactionSummary {
  return {
    id: transaction.id,
    reference: transaction.reference,
    customerName: transaction.customerName,
    customerEmail: redactEmail(transaction.customerEmail, viewerRole),
    cardLast4: transaction.cardLast4,
    merchant: transaction.merchant,
    amountCents: transaction.amountCents,
    refundedCents: transaction.refundedCents,
    currency: transaction.currency,
    occurredAt: transaction.occurredAt,
    status: transaction.status,
  };
}

function toRefundView(refund: {
  id: string;
  transactionId: string;
  transaction: { reference: string; customerName: string; currency: string };
  amountCents: number;
  reason: string;
  status: RefundStatus;
  requestedById: string;
  requestedBy: { name: string };
  requestedAt: Date;
  reviewedBy: { name: string } | null;
  reviewedAt: Date | null;
}): RefundView {
  return {
    id: refund.id,
    transactionId: refund.transactionId,
    transactionReference: refund.transaction.reference,
    customerName: refund.transaction.customerName,
    amountCents: refund.amountCents,
    currency: refund.transaction.currency,
    reason: refund.reason,
    status: refund.status,
    requestedBy: refund.requestedBy.name,
    requestedById: refund.requestedById,
    requestedAt: refund.requestedAt,
    reviewedBy: refund.reviewedBy?.name ?? null,
    reviewedAt: refund.reviewedAt,
  };
}

/**
 * Transaction search for support staff: matches the payment reference, the
 * customer's name or email, or the last four digits of the card.
 */
export async function searchTransactions(
  query: string,
  viewerRole: Role,
  limit = 25,
): Promise<TransactionSummary[]> {
  const term = query.trim();
  if (term.length === 0) return [];

  const transactions = await prisma.transaction.findMany({
    where: {
      OR: [
        { reference: { contains: term, mode: "insensitive" } },
        { customerName: { contains: term, mode: "insensitive" } },
        { customerEmail: { contains: term, mode: "insensitive" } },
        { cardLast4: { contains: term } },
      ],
    },
    orderBy: { occurredAt: "desc" },
    take: limit,
  });

  return transactions.map((transaction) => toSummary(transaction, viewerRole));
}

export async function getTransaction(
  id: string,
  viewerRole: Role,
): Promise<TransactionDetail | null> {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
    include: {
      refunds: {
        orderBy: { requestedAt: "desc" },
        include: {
          transaction: {
            select: { reference: true, customerName: true, currency: true },
          },
          requestedBy: true,
          reviewedBy: true,
        },
      },
    },
  });
  if (!transaction) return null;

  return {
    ...toSummary(transaction, viewerRole),
    description: transaction.description,
    refunds: transaction.refunds.map(toRefundView),
    refundableCents: refundableCents(transaction),
  };
}

export async function listRefundsAwaitingApproval(): Promise<RefundView[]> {
  const refunds = await prisma.refund.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { requestedAt: "asc" },
    include: {
      transaction: {
        select: { reference: true, customerName: true, currency: true },
      },
      requestedBy: true,
      reviewedBy: true,
    },
  });

  return refunds.map(toRefundView);
}

/** What is still refundable once issued and pending refunds are reserved. */
function refundableCents(transaction: {
  amountCents: number;
  refundedCents: number;
  refunds?: { amountCents: number; status: RefundStatus }[];
}): number {
  const pending = (transaction.refunds ?? [])
    .filter((refund) => refund.status === "PENDING_APPROVAL")
    .reduce((total, refund) => total + refund.amountCents, 0);
  return transaction.amountCents - transaction.refundedCents - pending;
}

/**
 * Records a refund against a transaction. Amounts over
 * `APPROVAL_THRESHOLD_CENTS` are parked for a reviewer; anything at or below
 * it is issued straight away. Either way the permission check, the write and
 * the audit entry happen inside one `mutate()` transaction.
 */
export async function requestRefund(params: {
  actorId: string;
  transactionId: string;
  amountCents: number;
  reason: string;
}) {
  const requiresApproval = needsApproval(params.amountCents);
  const action: AuditAction = requiresApproval
    ? "refund.request"
    : "refund.issue";
  const status: RefundStatus = requiresApproval ? "PENDING_APPROVAL" : "ISSUED";

  return mutate({
    actorId: params.actorId,
    action,
    entityType: REFUND_ENTITY,
    reason: params.reason,
    metadata: {
      transactionId: params.transactionId,
      amountCents: params.amountCents,
      status,
    },
    apply: async (tx) => {
      if (params.amountCents <= 0) {
        throw new RefundValidationError("Refund amount must be positive");
      }

      const transaction = await tx.transaction.findUnique({
        where: { id: params.transactionId },
        include: { refunds: { select: { amountCents: true, status: true } } },
      });
      if (!transaction) {
        throw new RefundStateError("Transaction not found");
      }

      const refundable = refundableCents(transaction);
      if (params.amountCents > refundable) {
        throw new RefundValidationError(
          `Only ${formatAmount(refundable, transaction.currency)} of ${
            transaction.reference
          } is still refundable`,
        );
      }

      const refund = await tx.refund.create({
        data: {
          transactionId: transaction.id,
          amountCents: params.amountCents,
          reason: params.reason.trim(),
          status,
          requestedById: params.actorId,
          issuedAt: requiresApproval ? null : new Date(),
        },
      });

      if (!requiresApproval) {
        await settle(tx, transaction.id, params.amountCents);
      }

      return refund;
    },
    resolveEntityId: (refund) => refund.id,
  });
}

type Tx = Parameters<Parameters<typeof mutate>[0]["apply"]>[0];

/** Moves money on the transaction once a refund is issued. */
async function settle(tx: Tx, transactionId: string, amountCents: number) {
  const transaction = await tx.transaction.update({
    where: { id: transactionId },
    data: { refundedCents: { increment: amountCents } },
  });

  return tx.transaction.update({
    where: { id: transactionId },
    data: {
      status:
        transaction.refundedCents >= transaction.amountCents
          ? TransactionStatus.REFUNDED
          : TransactionStatus.PARTIALLY_REFUNDED,
    },
  });
}

const REVIEW_DECISIONS = {
  approve: { action: "refund.approve", status: "ISSUED" },
  reject: { action: "refund.reject", status: "REJECTED" },
} as const satisfies Record<
  string,
  { action: AuditAction; status: RefundStatus }
>;

export type RefundDecision = keyof typeof REVIEW_DECISIONS;

export function isRefundDecision(value: string): value is RefundDecision {
  return value in REVIEW_DECISIONS;
}

/**
 * A reviewer's decision on a refund that exceeded the approval threshold.
 * Requesters cannot approve their own refund, so the two signatures always
 * come from different members of staff.
 */
export async function decideRefund(params: {
  actorId: string;
  refundId: string;
  decision: RefundDecision;
  reason: string;
}) {
  const { action, status } = REVIEW_DECISIONS[params.decision];

  return mutate({
    actorId: params.actorId,
    action,
    entityType: REFUND_ENTITY,
    entityId: params.refundId,
    reason: params.reason,
    metadata: { status },
    apply: async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: params.refundId },
        include: { transaction: true },
      });
      if (!refund) {
        throw new RefundStateError("Refund not found");
      }
      if (refund.status !== "PENDING_APPROVAL") {
        throw new RefundStateError(
          `Refund is already ${refund.status.toLowerCase().replace("_", " ")}`,
        );
      }
      if (refund.requestedById === params.actorId) {
        throw new SelfApprovalError(
          "A refund must be reviewed by someone other than the person who requested it",
        );
      }

      const decided = await tx.refund.update({
        where: { id: refund.id },
        data: {
          status,
          reviewedById: params.actorId,
          reviewedAt: new Date(),
          issuedAt: status === "ISSUED" ? new Date() : null,
        },
      });

      if (status === "ISSUED") {
        await settle(tx, refund.transactionId, refund.amountCents);
      }

      return decided;
    },
  });
}
