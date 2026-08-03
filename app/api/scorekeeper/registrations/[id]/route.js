import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { releaseMemberToPool } from "@/lib/roster-eligibility";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";

export const runtime = "nodejs";

const STATUSES = ["submitted", "confirmed", "withdrawn"];

// Behind the scorekeeper session for now (JD, 2026-07-27: defer the security
// work). One shared PIN, no roles. This gate and the one on the page are the
// two places to change when a director-only door arrives.
export async function PATCH(request, { params }) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { status, paid, amountPaidCents, notes, releaseRosterToPool } = body ?? {};
  const patch = {};

  if (status !== undefined) {
    if (!STATUSES.includes(status)) {
      return Response.json({ error: `Status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
    }
    patch.status = status;
  }

  if (paid !== undefined) {
    patch.paid_at = paid ? new Date().toISOString() : null;
    // Undoing payment clears the amount too. Leaving a figure behind on an
    // unpaid registration is the kind of stale number a director would act on.
    if (!paid) patch.amount_paid_cents = null;
  }

  if (amountPaidCents !== undefined) {
    if (amountPaidCents !== null && (!Number.isInteger(amountPaidCents) || amountPaidCents < 0)) {
      return Response.json({ error: "Amount must be a whole number of cents" }, { status: 400 });
    }
    patch.amount_paid_cents = amountPaidCents;
    // Recording an amount implies a payment event if they did not also clear paid.
    if (amountPaidCents !== null && paid === undefined) {
      patch.paid_at = new Date().toISOString();
    }
  }

  if (notes !== undefined) patch.director_notes = notes || null;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to change" }, { status: 400 });
  }

  const supabase = getServiceClient();

  // Load before update so we know if this is a fresh withdraw → pool release.
  const { data: before } = await supabase
    .from("registrations")
    .select("id, status, manager_member_id")
    .eq("id", id)
    .maybeSingle();
  if (!before) return Response.json({ error: "Registration not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("registrations")
    .update(patch)
    .eq("id", id)
    .select("id, status, paid_at, amount_paid_cents, director_notes")
    .maybeSingle();

  if (error) {
    console.error("registration update failed", error);
    return Response.json({ error: "Could not save — please try again" }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Registration not found" }, { status: 404 });

  // Team dropped out: release every non-manager player to the free-agent pool
  // so other managers can claim them (unless the director opts out).
  const justWithdrew =
    status === "withdrawn" && before.status !== "withdrawn" && releaseRosterToPool !== false;
  let pooled = 0;
  if (justWithdrew) {
    const { data: members } = await supabase
      .from("roster_members")
      .select("id")
      .eq("registration_id", id)
      .is("removed_at", null);
    for (const m of members ?? []) {
      if (m.id === before.manager_member_id) continue;
      const result = await releaseMemberToPool(supabase, m.id);
      if (result.ok) pooled += 1;
    }
    try {
      await regenerateAndStoreWaiverPdf(id);
    } catch (err) {
      console.error("PDF regeneration after withdraw pool release failed", err);
    }
  }

  return Response.json({ ok: true, registration: data, pooled });
}
