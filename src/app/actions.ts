"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTOR_COOKIE } from "@/lib/session";

export async function switchActor(formData: FormData) {
  const actorId = String(formData.get("actorId") ?? "");
  const jar = await cookies();
  jar.set(ACTOR_COOKIE, actorId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}
