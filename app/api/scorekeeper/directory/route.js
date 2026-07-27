import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";

export const runtime = "nodejs";

// Every director action that changes who belongs to what. One route, one
// gate, one shape — the UI sends {action, ...} and gets {ok} or {error}.
//
// JD, 2026-07-27: "they need to be able to move teams around, players
// around... Drill downs everywhere, simple confirms."
//
// Nothing here deletes. Moving re-points a row; merging marks a duplicate and
// forwards it. A director who does the wrong thing can always do the opposite.

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const supabase = getServiceClient();
  const { action } = body ?? {};

  switch (action) {
    // ---- Move a team to a different division -------------------------
    case "moveRegistration": {
      const { registrationId, divisionId } = body;
      if (!registrationId || !divisionId) return bad("Which team, and to which division?");

      const { data: division } = await supabase
        .from("divisions")
        .select("id, name, tournament_id")
        .eq("id", divisionId)
        .maybeSingle();
      if (!division) return bad("That division does not exist", 404);

      const { data: registration } = await supabase
        .from("registrations")
        .select("id, team_name, tournament_id")
        .eq("id", registrationId)
        .maybeSingle();
      if (!registration) return bad("That team is not registered", 404);

      // A team cannot be moved into another tournament's division — that is
      // not a move, it is a different registration, and it would silently
      // detach the team from the event it paid for.
      if (division.tournament_id !== registration.tournament_id) {
        return bad("That division belongs to a different tournament", 409);
      }

      const { error } = await supabase
        .from("registrations")
        .update({ division_id: divisionId })
        .eq("id", registrationId);
      if (error) {
        if (error.code === "23505") {
          return bad(`${registration.team_name} is already registered in that division`, 409);
        }
        console.error("move registration failed", error);
        return bad("Could not move that team — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Move a player onto another team -----------------------------
    case "movePlayer": {
      const { memberId, toRegistrationId } = body;
      if (!memberId || !toRegistrationId) return bad("Which player, and to which team?");

      const { data: member } = await supabase
        .from("roster_members")
        .select("id, name, registration_id")
        .eq("id", memberId)
        .maybeSingle();
      if (!member) return bad("That player is not on any roster", 404);
      if (member.registration_id === toRegistrationId) {
        return bad(`${member.name} is already on that team`, 409);
      }

      const { data: target } = await supabase
        .from("registrations")
        .select("id, team_name, manager_member_id")
        .eq("id", toRegistrationId)
        .maybeSingle();
      if (!target) return bad("That team is not registered", 404);

      // A manager cannot be moved off her own team without leaving it without
      // one. Change the manager first, then move her.
      const { data: from } = await supabase
        .from("registrations")
        .select("manager_member_id, team_name")
        .eq("id", member.registration_id)
        .maybeSingle();
      if (from?.manager_member_id === member.id) {
        return bad(
          `${member.name} manages ${from.team_name}. Pick a new manager there first.`,
          409
        );
      }

      const { error } = await supabase
        .from("roster_members")
        .update({ registration_id: toRegistrationId, removed_at: null })
        .eq("id", memberId);
      if (error) {
        console.error("move player failed", error);
        return bad("Could not move that player — please try again", 500);
      }

      // Both waivers change: one loses a name, one gains it.
      for (const id of [member.registration_id, toRegistrationId]) {
        try {
          await regenerateAndStoreWaiverPdf(id);
        } catch (err) {
          console.error("PDF regeneration after move failed", err);
        }
      }
      return Response.json({ ok: true });
    }

    // ---- Hand the team to a different manager ------------------------
    case "setManager": {
      const { registrationId, memberId } = body;
      if (!registrationId || !memberId) return bad("Which team, and which person?");

      const { data: member } = await supabase
        .from("roster_members")
        .select("id, name, registration_id, removed_at")
        .eq("id", memberId)
        .maybeSingle();
      if (!member || member.registration_id !== registrationId) {
        return bad("That person is not on this team", 404);
      }
      if (member.removed_at) return bad("That person is off the roster", 409);

      const { error } = await supabase
        .from("registrations")
        .update({ manager_member_id: memberId, manager_name: member.name })
        .eq("id", registrationId);
      if (error) {
        console.error("set manager failed", error);
        return bad("Could not change the manager — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Merge two duplicates ----------------------------------------
    case "mergePlayers":
    case "mergeTeams": {
      const { keepId, dropId } = body;
      if (!keepId || !dropId) return bad("Which one to keep, and which to merge in?");
      if (keepId === dropId) return bad("Those are the same record");

      const fn = action === "mergePlayers" ? "merge_players" : "merge_teams";
      const { error } = await supabase.rpc(fn, { keep_id: keepId, drop_id: dropId });
      if (error) {
        console.error(`${fn} failed`, error);
        return bad(error.message || "Could not merge — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    default:
      return bad("Unknown action");
  }
}
