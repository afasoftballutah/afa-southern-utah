import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  getSessionRole,
  hasValidDirectorSession,
  hasValidScorekeeperSession,
} from "@/lib/scorekeeper-auth";

/** Any staff session or redirect is handled by the page (show PIN). */
export async function getStaffRole() {
  const store = await cookies();
  return getSessionRole(store);
}

/** Director-only pages. Scorekeepers get bounced to the field hub. */
export async function requireDirectorPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { ok: false, needPin: true };
  if (!hasValidDirectorSession(store)) {
    redirect("/scorekeeper");
  }
  return { ok: true, needPin: false, role: "director" };
}

/** Field scorekeeper OR director. */
export async function requireStaffPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) return { ok: false, needPin: true };
  return { ok: true, needPin: false, role: getSessionRole(store) };
}
