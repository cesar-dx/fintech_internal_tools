"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CaseClosedError, decideCase, isKycDecision } from "@/lib/kyc";
import { ActorError, PermissionError, ReasonRequiredError } from "@/lib/mutate";
import { getActor } from "@/lib/session";

export async function submitDecision(formData: FormData) {
  const caseId = String(formData.get("caseId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "");

  if (!isKycDecision(decision)) {
    redirect(`/kyc/${caseId}?error=${encodeURIComponent("Unknown decision")}`);
  }

  const actor = await getActor();
  if (!actor) {
    redirect(`/kyc/${caseId}?error=${encodeURIComponent("No acting user")}`);
  }

  try {
    await decideCase({ actorId: actor.id, caseId, decision, reason });
  } catch (error) {
    if (
      error instanceof PermissionError ||
      error instanceof ReasonRequiredError ||
      error instanceof ActorError ||
      error instanceof CaseClosedError
    ) {
      redirect(`/kyc/${caseId}?error=${encodeURIComponent(error.message)}`);
    }
    throw error;
  }

  revalidatePath("/kyc");
  revalidatePath(`/kyc/${caseId}`);
  redirect(`/kyc/${caseId}?done=${decision}`);
}
