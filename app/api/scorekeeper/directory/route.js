import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer, resolveTeam } from "@/lib/identity";
import { RELEASE_TEXT_VERSION } from "@/lib/waiver";

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

    // ---- Create a tournament -----------------------------------------
    case "createTournament": {
      const { name, startDate, endDate, venueName, region } = body;
      if (!name?.trim()) return bad("A name is required");
      if (!startDate) return bad("A start date is required");

      // slug is NOT NULL and is what every public URL hangs off, so it is
      // derived here rather than typed — a director should never have to
      // think about URLs, and a hand-typed one goes wrong quietly.
      const base = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const year = String(startDate).slice(0, 4);
      let slug = `${year}-${base}`;

      const { data: taken } = await supabase.from("tournaments").select("slug").like("slug", `${slug}%`);
      if ((taken ?? []).some((t) => t.slug === slug)) {
        let n = 2;
        while ((taken ?? []).some((t) => t.slug === `${slug}-${n}`)) n += 1;
        slug = `${slug}-${n}`;
      }

      const { data, error } = await supabase
        .from("tournaments")
        .insert({
          name: name.trim(),
          slug,
          start_date: startDate,
          end_date: endDate || startDate,
          venue_name: venueName?.trim() || "TBD",
          region: region || "southern_utah",
          status: "upcoming",
          is_placeholder: false,
          contacts: [],
        })
        .select("id, slug")
        .single();
      if (error) {
        console.error("create tournament failed", error);
        return bad("Could not create that tournament — please try again", 500);
      }
      return Response.json({ ok: true, tournament: data });
    }

    // ---- Edit a tournament's terms -----------------------------------
    case "updateTournament": {
      const { tournamentId, patch: fields } = body;
      if (!tournamentId || !fields) return bad("Which tournament, and what changed?");

      // Only these. A whitelist rather than a spread, so a stray key from the
      // form can never reach a column nobody meant to expose.
      const ALLOWED = [
        "name",
        "start_date",
        "end_date",
        "venue_name",
        "venue_address",
        "entry_fee_cents",
        "deposit_cents",
        "ump_fee_cents",
        "game_guarantee",
        "registration_closes",
        "registration_note",
        "notes",
      ];
      const patch = {};
      for (const key of ALLOWED) {
        if (key in fields) patch[key] = fields[key] === "" ? null : fields[key];
      }
      if (Object.keys(patch).length === 0) return bad("Nothing to change");

      for (const key of ["entry_fee_cents", "deposit_cents", "ump_fee_cents"]) {
        const v = patch[key];
        if (v != null && (!Number.isInteger(v) || v < 0)) {
          return bad("Money must be a whole number of cents");
        }
      }

      const { error } = await supabase.from("tournaments").update(patch).eq("id", tournamentId);
      if (error) {
        console.error("update tournament failed", error);
        return bad("Could not save — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Add a division ----------------------------------------------
    case "addDivision": {
      const { tournamentId, name, gender, classId } = body;
      if (!tournamentId || !name?.trim()) return bad("Which tournament, and what division?");

      const { data: existing } = await supabase
        .from("divisions")
        .select("sort_order")
        .eq("tournament_id", tournamentId);
      const nextOrder = Math.max(0, ...(existing ?? []).map((d) => d.sort_order ?? 0)) + 10;

      const { error } = await supabase.from("divisions").insert({
        tournament_id: tournamentId,
        name: name.trim(),
        display_name: name.trim(),
        bracket_type: "double_elimination",
        sort_order: nextOrder,
        gender: gender || null,
        class_id: classId || null,
      });
      if (error) {
        console.error("add division failed", error);
        return bad("Could not add that division — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Enter a team the director took by hand -----------------------
    case "createRegistration": {
      const { tournamentId, divisionId, teamName, managerName, managerEmail, managerPhone, players } =
        body;
      if (!tournamentId || !divisionId) return bad("Which tournament and division?");
      if (!teamName?.trim()) return bad("A team name is required");
      if (!managerName?.trim()) return bad("A manager name is required");

      const { data: division } = await supabase
        .from("divisions")
        .select("id, tournament_id")
        .eq("id", divisionId)
        .maybeSingle();
      if (!division || division.tournament_id !== tournamentId) {
        return bad("That division is not in that tournament", 404);
      }

      // manager_email is NOT NULL and the director may genuinely not have
      // one yet. A reserved .invalid address is honest — it cannot be
      // delivered to, so nobody will ever mistake it for a real contact.
      const email = managerEmail?.trim() || `unknown@example.invalid`;

      const { data: registration, error } = await supabase
        .from("registrations")
        .insert({
          tournament_id: tournamentId,
          division_id: divisionId,
          team_name: teamName.trim(),
          manager_name: managerName.trim(),
          manager_email: email,
          manager_phone: managerPhone?.trim() || null,
          release_text_version: RELEASE_TEXT_VERSION,
          director_notes: "Entered by a director, not through the public form.",
        })
        .select("id, roster_token, manage_token")
        .single();

      if (error) {
        if (error.code === "23505") {
          return bad(`${teamName.trim()} is already registered in that division`, 409);
        }
        console.error("director registration failed", error);
        return bad("Could not save that team — please try again", 500);
      }

      const names = (players ?? [])
        .map((p) => ({ name: String(p.name ?? "").trim(), birthDate: p.birthDate || null }))
        .filter((p) => p.name);
      if (!names.some((p) => p.name.toLowerCase() === managerName.trim().toLowerCase())) {
        names.unshift({ name: managerName.trim(), birthDate: null });
      }

      const { data: roster, error: rosterError } = await supabase
        .from("roster_members")
        .insert(
          names.map((p) => ({
            registration_id: registration.id,
            role: "player",
            name: p.name,
            birth_date: p.birthDate,
          }))
        )
        .select("id, name");

      if (rosterError) {
        console.error("director roster insert failed", rosterError);
        await supabase.from("registrations").delete().eq("id", registration.id);
        return bad("Could not save the roster — please try again", 500);
      }

      const managerRow = (roster ?? []).find(
        (r) => r.name.toLowerCase() === managerName.trim().toLowerCase()
      );

      // Same identity resolution the public form does, so a team the director
      // typed in is the same team next season. Soft — a failure here leaves
      // nulls to fix, never a lost registration.
      try {
        const teamId = await resolveTeam(supabase, { teamName: teamName.trim(), divisionId });
        await supabase
          .from("registrations")
          .update({ team_id: teamId, manager_member_id: managerRow?.id ?? null })
          .eq("id", registration.id);

        await Promise.all(
          (roster ?? []).map(async (row) => {
            const source = names.find((p) => p.name === row.name);
            const playerId = await resolvePlayer(supabase, {
              name: row.name,
              birthDate: source?.birthDate ?? null,
            });
            if (playerId) {
              await supabase.from("roster_members").update({ player_id: playerId }).eq("id", row.id);
            }
          })
        );
      } catch (err) {
        console.error("identity resolution failed on director entry", err);
      }

      try {
        await regenerateAndStoreWaiverPdf(registration.id);
      } catch (err) {
        console.error("PDF snapshot failed on director entry", err);
      }

      const origin = new URL(request.url).origin;
      return Response.json({
        ok: true,
        registrationId: registration.id,
        rosterLink: `${origin}/register/roster/${registration.roster_token}`,
        manageLink: `${origin}/register/manage/${registration.manage_token}`,
      });
    }

    // ---- Rate a player -----------------------------------------------
    case "setPlayerClass": {
      const { playerId, classId } = body;
      if (!playerId) return bad("Which player?");
      if (classId) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id")
          .eq("id", classId)
          .maybeSingle();
        if (!cls) return bad("That class does not exist", 404);
      }
      const { error } = await supabase
        .from("players")
        .update({ class_id: classId || null })
        .eq("id", playerId);
      if (error) {
        console.error("set player class failed", error);
        return bad("Could not save that class — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Enter a team at a class -------------------------------------
    case "setRegistrationClass": {
      const { registrationId, classId } = body;
      if (!registrationId) return bad("Which team?");
      const { error } = await supabase
        .from("registrations")
        .update({ class_id: classId || null })
        .eq("id", registrationId);
      if (error) {
        console.error("set registration class failed", error);
        return bad("Could not save that class — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    default:
      return bad("Unknown action");
  }
}
