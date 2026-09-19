import Stripe from "stripe";
import { TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export class StripeConfigError extends Error {}
export class StripeRefundError extends Error {}

/**
 * Only Stripe *test mode* is supported: the tool is for staff to exercise the
 * refund flow against test data, and a live key would move real money.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

let client: Stripe | undefined;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new StripeConfigError("STRIPE_SECRET_KEY is not configured");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new StripeConfigError(
      "STRIPE_SECRET_KEY must be a test-mode key (sk_test_… or rk_test_…)",
    );
  }
  client ??= new Stripe(key);
  return client;
}

function statusFor(charge: Stripe.Charge): TransactionStatus {
  if (charge.refunded || charge.amount_refunded >= charge.amount) {
    return TransactionStatus.REFUNDED;
  }
  return charge.amount_refunded > 0
    ? TransactionStatus.PARTIALLY_REFUNDED
    : TransactionStatus.SETTLED;
}

/** Maps a Stripe charge onto the columns of the local `Transaction` row. */
export function transactionFromCharge(charge: Stripe.Charge) {
  const paymentIntent =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : charge.payment_intent?.id;
  return {
    reference: paymentIntent ?? charge.id,
    stripeChargeId: charge.id,
    customerName: charge.billing_details.name ?? "Unknown customer",
    customerEmail: charge.billing_details.email ?? charge.receipt_email ?? "",
    cardLast4: charge.payment_method_details?.card?.last4 ?? "",
    merchant: charge.calculated_statement_descriptor ?? "Stripe",
    description: charge.description ?? "",
    amountCents: charge.amount,
    refundedCents: charge.amount_refunded,
    currency: charge.currency.toUpperCase(),
    occurredAt: new Date(charge.created * 1000),
    status: statusFor(charge),
  };
}

/**
 * Mirrors recent succeeded charges from Stripe into the `Transaction` table.
 * Like the seed, this is an inbound processor feed rather than an operator
 * action, so rows are upserted directly; every refund against them still goes
 * through `mutate()`.
 */
export async function syncStripeCharges(limit = 100): Promise<number> {
  const charges = await getStripe().charges.list({ limit });
  let synced = 0;

  for (const charge of charges.data) {
    if (charge.status !== "succeeded") continue;
    const { stripeChargeId, ...data } = transactionFromCharge(charge);
    await prisma.transaction.upsert({
      where: { stripeChargeId: charge.id },
      update: {
        amountCents: data.amountCents,
        refundedCents: data.refundedCents,
        status: data.status,
        description: data.description,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        cardLast4: data.cardLast4,
      },
      create: { stripeChargeId, ...data },
    });
    synced += 1;
  }

  return synced;
}

/**
 * Issues a refund against a Stripe charge. The local refund id doubles as the
 * idempotency key, so a retried request after a transient failure cannot
 * refund the customer twice.
 */
export async function createStripeRefund(params: {
  chargeId: string;
  amountCents: number;
  refundId: string;
  actorId: string;
  reason: string;
}): Promise<Stripe.Refund> {
  try {
    return await getStripe().refunds.create(
      {
        charge: params.chargeId,
        amount: params.amountCents,
        reason: "requested_by_customer",
        metadata: {
          refund_id: params.refundId,
          actor_id: params.actorId,
          reason: params.reason.slice(0, 500),
        },
      },
      { idempotencyKey: `refund_${params.refundId}` },
    );
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      throw new StripeRefundError(`Stripe rejected the refund: ${error.message}`);
    }
    throw error;
  }
}
