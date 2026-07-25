import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Confirm the bracket, or reopen pool play (redesign spec §1).
 *
 * Confirming is the hinge of the tournament: pool play becomes final and
 * its scores stop being editable, and the scorekeeper moves to the bracket
 * stage. It writes ONE column and touches no games, so it can never
 * disturb a score.
 *
 * Reopening is deliberately available. A locked screen with no way out is
 * a trap at a ballpark at midnight, and directors do fix wrong scores. It
 * clears the timestamp and leaves the bracket exactly as it is — a
 * re-opened pool does not un-write anything already seeded.
 */
export async function POST(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { divisionId, confirmed, by } = body ?? {};
  if (!divisionId) return Response.json({ error: "Missing divisionId" }, { status: 400 });
  if (typeof confirmed !== "boolean") {
    return Response.json({ error: "confirmed must be true or false" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const patch = confirmed
    ? { bracket_confirmed_at: new Date().toISOString(), bracket_confirmed_by: by ?? null }
    : { bracket_confirmed_at: null, bracket_confirmed_by: null };

  const { data, error } = await supabase
    .from("divisions")
    .update(patch)
    .eq("id", divisionId)
    .select("id, bracket_confirmed_at")
    .maybeSingle();

  if (error) {
    // The migration may not be applied yet. Say so plainly rather than
    // failing with a Postgres error string a director cannot act on.
    // PostgREST says "Could not find the 'x' column of 'y' in the schema
    // cache"; Postgres itself says "column x does not exist". Catch both,
    // because which one you get depends on whether the schema cache has
    // been reloaded, not on anything the director did.
    const msg = error.message ?? "";
    const missing =
      /column .* does not exist/i.test(msg) ||
      /could not find the .*column/i.test(msg) ||
      /schema cache/i.test(msg);
    return Response.json(
      {
        error: missing
          ? "This tournament's database has not been migrated for bracket confirmation yet."
          : error.message || "Could not update the division",
      },
      { status: missing ? 501 : 500 }
    );
  }

  return Response.json({ ok: true, confirmedAt: data?.bracket_confirmed_at ?? null });
}
