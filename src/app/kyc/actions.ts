"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CaseClosedError, decideCase, isKycDecision } from "@/lib/kyc";
import { ActorError, PermissionError, ReasonRequiredError } from "@/lib/mutate";
import { ACTOR_COOKIE, getActor } from "@/lib/session";
import { cookies } from "next/headers";

export async function switchActor(formData: FormData) {
  const actorId = String(formData.get("actorId") ?? "");
  const jar = await cookies();
  jar.set(ACTOR_COOKIE, actorId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/kyc");
}

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
