import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

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

  const { status, paid, amountPaidCents, notes } = body ?? {};
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
  }

  if (notes !== undefined) patch.director_notes = notes || null;

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to change" }, { status: 400 });
  }

  const supabase = getServiceClient();
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

  return Response.json({ ok: true, registration: data });
}
