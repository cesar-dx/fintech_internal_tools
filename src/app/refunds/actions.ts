"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActorError, PermissionError, ReasonRequiredError } from "@/lib/mutate";
import {
  decideRefund,
  isRefundDecision,
  needsApproval,
  parseAmountToCents,
  RefundStateError,
  RefundValidationError,
  requestRefund,
  SelfApprovalError,
} from "@/lib/refunds";
import { getActor } from "@/lib/session";
import { StripeConfigError, StripeRefundError } from "@/lib/stripe";

const HANDLED = [
  PermissionError,
  ReasonRequiredError,
  ActorError,
  RefundValidationError,
  RefundStateError,
  SelfApprovalError,
  StripeConfigError,
  StripeRefundError,
];

function isHandled(error: unknown): error is Error {
  return HANDLED.some((type) => error instanceof type);
}

export async function submitRefund(formData: FormData) {
  const transactionId = String(formData.get("transactionId") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const detail = `/refunds/${transactionId}`;

  const actor = await getActor();
  if (!actor) {
    redirect(`${detail}?error=${encodeURIComponent("No acting user")}`);
  }

  let amountCents: number;
  try {
    amountCents = parseAmountToCents(amount);
    await requestRefund({
      actorId: actor.id,
      transactionId,
      amountCents,
      reason,
    });
  } catch (error) {
    if (isHandled(error)) {
      redirect(`${detail}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(detail);
  revalidatePath("/refunds/approvals");
  redirect(
    `${detail}?done=${needsApproval(amountCents) ? "requested" : "issued"}`,
  );
}

export async function submitRefundDecision(formData: FormData) {
  const refundId = String(formData.get("refundId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const queue = "/refunds/approvals";

  if (!isRefundDecision(decision)) {
    redirect(`${queue}?error=${encodeURIComponent("Unknown decision")}`);
  }

  const actor = await getActor();
  if (!actor) {
    redirect(`${queue}?error=${encodeURIComponent("No acting user")}`);
  }

  let transactionId: string;
  try {
    const refund = await decideRefund({
      actorId: actor.id,
      refundId,
      decision,
      reason,
    });
    transactionId = refund.transactionId;
  } catch (error) {
    if (isHandled(error)) {
      redirect(`${queue}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath(queue);
  revalidatePath(`/refunds/${transactionId}`);
  redirect(`${queue}?done=${decision}`);
}
