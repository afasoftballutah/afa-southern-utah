import {
  requireScorekeeperSession,
  requireDirectorSession,
} from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer, resolveTeam, normalizeName } from "@/lib/identity";
import { getActiveWaiver } from "@/lib/site-docs";
import { RATINGS } from "@/lib/class";
import {
  composeDisplayName,
  composeLegalName,
  personFieldsFromInput,
} from "@/lib/person-name";

export const runtime = "nodejs";

// Every director action that changes who belongs to what. One route, one
// gate, one shape — the UI sends {action, ...} and gets {ok} or {error}.
//
// JD, 2026-07-27: "they need to be able to move teams around, players
// around... Drill downs everywhere, simple confirms."
//
// Most actions re-point or soft-merge. Hard deletes are explicit and rare
// (tournaments, players the director wants off the file).

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
        .select("id, name, tournament_id, class_id, classes(name)")
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
        .update({
          division_id: divisionId,
          class_id: division.class_id ?? null,
          class: division.classes?.name ?? null,
        })
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

      const { data: reg } = await supabase
        .from("registrations")
        .select("id, team_name, division_id")
        .eq("id", registrationId)
        .maybeSingle();
      if (!reg) return bad("Registration not found", 404);

      // Manager is part of team identity — re-resolve so name+manager+gender
      // lands on the right teams row (and no longer sits on a no-manager stub).
      let teamId = null;
      try {
        teamId = await resolveTeam(supabase, {
          teamName: reg.team_name,
          divisionId: reg.division_id,
          managerName: member.name,
        });
      } catch (err) {
        console.error("setManager team re-resolve failed", err);
      }

      const { error } = await supabase
        .from("registrations")
        .update({
          manager_member_id: memberId,
          manager_name: member.name,
          ...(teamId ? { team_id: teamId } : {}),
        })
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

    // ---- Hard-delete a player from the directory ---------------------
    // Roster rows keep their name/waiver text; player_id is nulled (FK ON
    // DELETE SET NULL). Merged-into pointers at this id are cleared so we
    // never leave orphans. Prefer merge when cleaning duplicates.
    case "deletePlayer": {
      const { playerId } = body;
      if (!playerId) return bad("Which player?");

      const { data: player } = await supabase
        .from("players")
        .select("id, full_name, merged_into_id")
        .eq("id", playerId)
        .maybeSingle();
      if (!player) return bad("That player is not on file", 404);
      if (player.merged_into_id) {
        return bad("That row was already merged away — open the surviving player instead", 409);
      }

      // Anyone soft-merged into this person: clear so delete is not blocked
      // by the self-FK (no ON DELETE CASCADE on merged_into_id).
      const { error: unlinkMergeErr } = await supabase
        .from("players")
        .update({ merged_into_id: null })
        .eq("merged_into_id", playerId);
      if (unlinkMergeErr) {
        console.error("clear merged_into_id failed", unlinkMergeErr);
        return bad("Could not unlink merge history — please try again", 500);
      }

      const { error } = await supabase.from("players").delete().eq("id", playerId);
      if (error) {
        console.error("delete player failed", error);
        return bad(error.message || "Could not delete that player — please try again", 500);
      }
      return Response.json({ ok: true, deleted: player.full_name });
    }

    // ---- Create a tournament -----------------------------------------
    // Full build in the add dialog: name, when/where, and terms (fee, GG, closes).
    // Poster and divisions stay on the list expand after create.
    case "createTournament": {
      const {
        name,
        startDate,
        endDate,
        venueName,
        region,
        dayStartTime,
        entryFeeCents,
        depositCents,
        umpFeeCents,
        gameGuarantee,
        registrationCloses,
      } = body;
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

      const row = {
        name: name.trim(),
        slug,
        start_date: startDate,
        end_date: endDate || startDate,
        venue_name: venueName?.trim() || "TBD",
        region: region || "southern_utah",
        status: "upcoming",
        is_placeholder: false,
        contacts: [],
      };
      if (dayStartTime) row.day_start_time = dayStartTime;
      if (entryFeeCents != null && entryFeeCents !== "")
        row.entry_fee_cents = Number(entryFeeCents);
      if (depositCents != null && depositCents !== "")
        row.deposit_cents = Number(depositCents);
      if (umpFeeCents != null && umpFeeCents !== "")
        row.ump_fee_cents = Number(umpFeeCents);
      if (gameGuarantee != null && String(gameGuarantee).trim())
        row.game_guarantee = String(gameGuarantee).trim();
      if (registrationCloses)
        row.registration_closes = registrationCloses;

      const { data, error } = await supabase
        .from("tournaments")
        .insert(row)
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
        "day_start_time",
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

      if ("day_start_time" in patch && patch.day_start_time != null) {
        const { normalizeTimeOfDay } = await import("@/lib/league-time");
        const t = normalizeTimeOfDay(patch.day_start_time);
        if (!t) return bad("Day start time must be HH:MM");
        patch.day_start_time = t;
      }

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

    // ---- Set up a tournament's divisions ------------------------------
    //
    // JD, 2026-07-27: "mens coed and womens can all run different formats",
    // "need a confirm at the end", "there should be a 'pool play' checkbox for
    // each gender section first. Those rows only come up once pool play is
    // over."
    //
    // The caller sends a PLAN, one entry per gender, and this makes the
    // divisions match it. Nothing is created until they press save, and
    // nothing with teams in it is ever removed — a division a team registered
    // for is not the director's to delete by unticking a box.
    case "applyDivisionSetup": {
      const { tournamentId, plan } = body;
      if (!tournamentId || !Array.isArray(plan)) return bad("Which tournament, and what setup?");

      const GENDERS = { mens: "Men's", womens: "Women's", coed: "Coed" };
      const { data: classes } = await supabase.from("classes").select("id, name, sort_order");
      const { data: existing } = await supabase
        .from("divisions")
        .select("id, name, gender, class_id, parent_division_id")
        .eq("tournament_id", tournamentId);
      const { data: regs } = await supabase
        .from("registrations")
        .select("division_id")
        .eq("tournament_id", tournamentId)
        .neq("status", "withdrawn");
      const hasTeams = new Set((regs ?? []).map((r) => r.division_id));

      // What the plan says should exist.
      const wanted = [];
      for (const g of plan) {
        const genderLabel = GENDERS[g.gender];
        if (!genderLabel || !g.on) continue;

        // Pool play, and brackets under it, live on ONE parent division —
        // that is the shape the Heat Stroker ran: everyone in a pool, then
        // split into Gold/Silver/Bronze once seeding is known.
        if (g.mode === "brackets") {
          wanted.push({ name: genderLabel, gender: g.gender, classId: null, parent: null });
          for (const b of g.picks ?? []) {
            wanted.push({ name: b, gender: g.gender, classId: null, parentOf: genderLabel });
          }
          continue;
        }

        if (g.mode === "levels") {
          for (const l of g.picks ?? []) {
            wanted.push({ name: `${genderLabel} ${l}`, gender: g.gender, classId: null, parent: null });
          }
          continue;
        }

        // Classes: a real division per class the tournament runs.
        for (const name of g.picks ?? []) {
          const cls = (classes ?? []).find((c) => c.name === name);
          wanted.push({
            name: `${genderLabel} ${name}`,
            gender: g.gender,
            classId: cls?.id ?? null,
            parent: null,
          });
        }
        if ((g.picks ?? []).length === 0 && g.poolPlay) {
          wanted.push({ name: genderLabel, gender: g.gender, classId: null, parent: null });
        }
      }

      const keyOf = (d) => `${d.gender}|${d.name}`;
      const existingByKey = new Map((existing ?? []).map((d) => [keyOf(d), d]));
      const wantedKeys = new Set(wanted.map(keyOf));

      // Create what is missing, parents before children.
      let order = 0;
      const createdByName = new Map();
      for (const w of wanted.filter((x) => !x.parentOf)) {
        order += 10;
        const found = existingByKey.get(keyOf(w));
        if (found) {
          createdByName.set(`${w.gender}|${w.name}`, found.id);
          continue;
        }
        const { data, error } = await supabase
          .from("divisions")
          .insert({
            tournament_id: tournamentId,
            name: w.name,
            display_name: w.name,
            bracket_type: "double_elimination",
            sort_order: order,
            gender: w.gender,
            class_id: w.classId,
            min_teams: 6,
            min_men: w.gender === "mens" ? 10 : w.gender === "coed" ? 5 : 0,
            min_women: w.gender === "womens" ? 10 : w.gender === "coed" ? 5 : 0,
          })
          .select("id")
          .single();
        if (error) {
          console.error("setup create failed", error);
          return bad("Could not save that setup — please try again", 500);
        }
        createdByName.set(`${w.gender}|${w.name}`, data.id);
      }

      // Teams follow their class. A tournament that ran one "Coed" division
      // and is now split into Coed D and Coed E should carry the teams across
      // rather than stranding them in a division the director just retired —
      // Fallen is entered at D, so it belongs in Coed D (JD, 2026-07-27:
      // "fallen is in coed D or should be").
      const { data: fullRegs } = await supabase
        .from("registrations")
        .select("id, division_id, class_id")
        .eq("tournament_id", tournamentId)
        .neq("status", "withdrawn");

      const stillThere = new Set();
      for (const d of existing ?? []) {
        if (wantedKeys.has(keyOf(d))) stillThere.add(d.id);
      }

      for (const r of fullRegs ?? []) {
        if (stillThere.has(r.division_id)) continue; // its division survives
        const from = (existing ?? []).find((d) => d.id === r.division_id);
        if (!from) continue;
        // The wanted division with the same gender AND the class this team
        // was entered at. No class on the team means no safe destination.
        const target = wanted.find(
          (w) => w.gender === from.gender && r.class_id && w.classId === r.class_id
        );
        if (!target) continue;
        const targetId = createdByName.get(`${target.gender}|${target.name}`);
        if (targetId) {
          await supabase.from("registrations").update({ division_id: targetId }).eq("id", r.id);
          hasTeams.delete(from.id);
        }
      }

      // Recheck, because a division emptied by the moves above is now
      // deletable.
      const { data: remaining } = await supabase
        .from("registrations")
        .select("division_id")
        .eq("tournament_id", tournamentId)
        .neq("status", "withdrawn");
      const occupied = new Set((remaining ?? []).map((r) => r.division_id));

      const refused = [];
      for (const d of existing ?? []) {
        if (wantedKeys.has(keyOf(d))) continue;
        if (occupied.has(d.id)) {
          refused.push(d.name);
          continue;
        }
        await supabase.from("divisions").delete().eq("id", d.id);
      }

      for (const w of wanted.filter((x) => x.parentOf)) {
        if (existingByKey.has(keyOf(w))) continue;
        order += 10;
        const parentId = createdByName.get(`${w.gender}|${w.parentOf}`);
        const { error } = await supabase.from("divisions").insert({
          tournament_id: tournamentId,
          name: w.name,
          display_name: w.name,
          bracket_type: "double_elimination",
          sort_order: order,
          gender: w.gender,
          parent_division_id: parentId ?? null,
          min_teams: 6,
        });
        if (error) {
          console.error("setup create bracket failed", error);
          return bad("Could not save that setup — please try again", 500);
        }
      }

      return Response.json({ ok: true, refused });
    }

    // ---- Delete a tournament -----------------------------------------
    case "deleteTournament": {
      const { tournamentId } = body;
      if (!tournamentId) return bad("Which tournament?");

      // Never with teams in it. A registration is somebody's roster, their
      // waiver and their signature; deleting a tournament is not the place to
      // take those with it.
      const { count } = await supabase
        .from("registrations")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId)
        .neq("status", "withdrawn");
      if ((count ?? 0) > 0) {
        return bad(
          `${count} ${count === 1 ? "team is" : "teams are"} registered. Move or withdraw them first.`,
          409
        );
      }

      const { data: divisions } = await supabase
        .from("divisions")
        .select("id")
        .eq("tournament_id", tournamentId);
      const ids = (divisions ?? []).map((d) => d.id);
      if (ids.length) {
        await supabase.from("games").delete().in("division_id", ids);
        await supabase.from("pool_games").delete().in("division_id", ids);
        await supabase.from("divisions").delete().in("id", ids);
      }

      const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);
      if (error) {
        console.error("delete tournament failed", error);
        return bad("Could not delete it — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Upload a tournament poster ----------------------------------
    case "setPoster": {
      const { tournamentId, dataUrl } = body;
      if (!tournamentId) return bad("Which tournament?");

      // Clearing is as valid as setting — a wrong poster on the public page
      // needs to come off without a database trip.
      if (!dataUrl) {
        const { error } = await supabase
          .from("tournaments")
          .update({ poster_url: null })
          .eq("id", tournamentId);
        if (error) return bad("Could not remove the poster — please try again", 500);
        return Response.json({ ok: true, posterUrl: null });
      }

      const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
      if (!match) return bad("That file is not a PNG, JPEG or WebP image");
      const contentType = match[1];
      const buffer = Buffer.from(match[3], "base64");
      // 8 MB. A phone photo of a flyer is a megabyte or two; anything much
      // larger is a mistake, and the public page has to load it.
      if (buffer.length > 8 * 1024 * 1024) return bad("That image is over 8 MB — use a smaller one");

      const ext = contentType.split("/")[1].replace("jpeg", "jpg");
      const path = `${tournamentId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("posters")
        .upload(path, buffer, { contentType, upsert: true });
      if (uploadError) {
        console.error("poster upload failed", uploadError);
        return bad("Could not upload that poster — please try again", 500);
      }

      const { data: pub } = supabase.storage.from("posters").getPublicUrl(path);
      const { error } = await supabase
        .from("tournaments")
        .update({ poster_url: pub.publicUrl })
        .eq("id", tournamentId);
      if (error) return bad("Uploaded, but could not save the link — please try again", 500);
      return Response.json({ ok: true, posterUrl: pub.publicUrl });
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
        // A coed division has a split to meet. 5/5 is the league's normal
        // one; 7/3 and 6/4 happen, and the director edits those. JD,
        // 2026-07-27.
        min_men: gender === "coed" ? 5 : null,
        min_women: gender === "coed" ? 5 : null,
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

      const { data: division } = await supabase
        .from("divisions")
        .select("id, tournament_id")
        .eq("id", divisionId)
        .maybeSingle();
      if (!division || division.tournament_id !== tournamentId) {
        return bad("That division is not in that tournament", 404);
      }

      // Both may be blank. A team can be in a tournament before anyone has
      // said who runs it, and null says that; the old code put a fake
      // .invalid address in the column because it was NOT NULL.
      // See supabase/team-without-manager.sql.
      const { data: registration, error } = await supabase
        .from("registrations")
        .insert({
          tournament_id: tournamentId,
          division_id: divisionId,
          team_name: teamName.trim(),
          manager_name: managerName?.trim() || null,
          manager_email: managerEmail?.trim() || null,
          manager_phone: managerPhone?.trim() || null,
          release_text_version: (await getActiveWaiver()).version,
          director_notes: null,
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

      const { personFieldsFromInput } = await import("@/lib/person-name");
      const names = (players ?? [])
        .map((p) => {
          const person = personFieldsFromInput(p, { allowPhone: false });
          return {
            ...person,
            birthDate: p.birthDate || null,
          };
        })
        .filter((p) => p.displayName);
      // A manager is on their own roster — one waiver, not two.
      if (
        managerName?.trim() &&
        !names.some(
          (p) => p.displayName.toLowerCase() === managerName.trim().toLowerCase()
        )
      ) {
        const mgr = personFieldsFromInput(
          {
            name: managerName.trim(),
            email: managerEmail,
            phone: managerPhone,
          },
          { allowPhone: true }
        );
        names.unshift({ ...mgr, birthDate: null });
      }

      // A team with no manager and no players is a name in a bracket, which is
      // a real thing to enter. Skip the insert rather than write an empty row.
      let roster = [];
      if (names.length) {
        const { data, error: rosterError } = await supabase
          .from("roster_members")
          .insert(
            names.map((p) => ({
              registration_id: registration.id,
              role: "player",
              name: p.displayName,
              legal_first_name: p.legalFirstName,
              legal_last_name: p.legalLastName,
              preferred_name: p.preferredName,
              email: p.email,
              phone: null,
              birth_date: p.birthDate,
            }))
          )
          .select("id, name");

        if (rosterError) {
          console.error("director roster insert failed", rosterError);
          await supabase.from("registrations").delete().eq("id", registration.id);
          return bad("Could not save the roster — please try again", 500);
        }
        roster = data ?? [];
      }

      const managerRow = managerName?.trim()
        ? roster.find(
            (r) => r.name.toLowerCase() === managerName.trim().toLowerCase()
          )
        : null;

      // Same identity resolution the public form does, so a team the director
      // typed in is the same team next season. Soft — a failure here leaves
      // nulls to fix, never a lost registration.
      try {
        const teamId = await resolveTeam(supabase, {
          teamName: teamName.trim(),
          divisionId,
          managerName: managerName ?? null,
        });
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

      // The waiver PDF is a record of what a manager agreed to. With no
      // manager there is nothing to record, and a blank one would look like
      // an entry somebody signed.
      if (managerName?.trim()) {
        try {
          await regenerateAndStoreWaiverPdf(registration.id);
        } catch (err) {
          console.error("PDF snapshot failed on director entry", err);
        }
      }

      const origin = new URL(request.url).origin;
      return Response.json({
        ok: true,
        registrationId: registration.id,
        rosterLink: `${origin}/register/roster/${registration.roster_token}`,
        manageLink: `${origin}/register/manage/${registration.manage_token}`,
      });
    }

    // ---- Put a list of teams straight into a division ------------------
    // For entering a bracket that already happened, or a stack of paper entry
    // forms. Names only: no manager, no roster, no waiver. JD, 2026-07-28:
    // "the teams should be put in, with no managers or players yet."
    case "addTeams": {
      const { tournamentId, divisionId, names } = body;
      if (!tournamentId || !divisionId) return bad("Which tournament and division?");

      const wanted = [
        ...new Map(
          String(names ?? "")
            .split(/[\n,]/)
            .map((n) => n.trim())
            .filter(Boolean)
            .map((n) => [n.toLowerCase(), n])
        ).values(),
      ];
      if (wanted.length === 0) return bad("Type at least one team name");

      const { data: division } = await supabase
        .from("divisions")
        .select("id, tournament_id, class_id")
        .eq("id", divisionId)
        .maybeSingle();
      if (!division || division.tournament_id !== tournamentId) {
        return bad("That division is not in that tournament", 404);
      }

      // Already there is not an error — a director pasting a list twice should
      // get the missing ones added, not a wall of complaints.
      const { data: existing } = await supabase
        .from("registrations")
        .select("team_name")
        .eq("tournament_id", tournamentId)
        .eq("division_id", divisionId)
        .neq("status", "withdrawn");
      const have = new Set((existing ?? []).map((r) => r.team_name.trim().toLowerCase()));

      const fresh = wanted.filter((n) => !have.has(n.toLowerCase()));
      if (fresh.length === 0) {
        return Response.json({ ok: true, added: 0, skipped: wanted.length });
      }

      const waiverVersion = (await getActiveWaiver()).version;
      const { data: made, error } = await supabase
        .from("registrations")
        .insert(
          fresh.map((n) => ({
            tournament_id: tournamentId,
            division_id: divisionId,
            team_name: n,
            class_id: division.class_id ?? null,
            release_text_version: waiverVersion,
            director_notes: null,
          }))
        )
        .select("id, team_name");

      if (error) {
        console.error("bulk team insert failed", error);
        return bad("Could not save those teams — please try again", 500);
      }

      // Soft: a team that could not be matched to a club leaves a null to fix,
      // never a lost registration.
      try {
        await Promise.all(
          (made ?? []).map(async (r) => {
            // Bulk director entry has no manager yet — empty manager key.
            const teamId = await resolveTeam(supabase, {
              teamName: r.team_name,
              divisionId,
              managerName: null,
            });
            if (teamId) await supabase.from("registrations").update({ team_id: teamId }).eq("id", r.id);
          })
        );
      } catch (err) {
        console.error("team identity resolution failed on bulk add", err);
      }

      return Response.json({
        ok: true,
        added: made?.length ?? 0,
        skipped: wanted.length - (made?.length ?? 0),
      });
    }

    // ---- New player on the directory ---------------------------------
    case "createPlayer": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const fields = personFieldsFromInput(body, { allowPhone: false });
      if (!fields.legalFirstName || !fields.legalLastName) {
        return bad("Legal first and last name are required");
      }
      const birthDate = String(body.birthDate ?? body.birth_date ?? "").trim();
      if (!birthDate) return bad("Birth date is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        return bad("Birth date must be YYYY-MM-DD");
      }
      const email = fields.email || String(body.email ?? "").trim() || null;
      if (!email) return bad("Contact email is required");

      const gender = body.gender ? String(body.gender).trim() : null;
      if (gender && !["M", "F"].includes(gender)) {
        return bad("Gender must be M or F, or blank");
      }
      const rating = body.rating ? String(body.rating).trim() : null;
      if (rating && !RATINGS.includes(rating)) {
        return bad(`Rating must be one of ${RATINGS.join(", ")}, or blank`);
      }

      const legalName =
        fields.legalName ||
        composeLegalName({
          legalFirstName: fields.legalFirstName,
          legalLastName: fields.legalLastName,
        });
      const displayName =
        fields.displayName ||
        composeDisplayName({
          preferredName: fields.preferredName,
          legalFirstName: fields.legalFirstName,
          legalLastName: fields.legalLastName,
        });
      const normalized = normalizeName(legalName);
      if (!normalized) return bad("A legal name is required");

      const address = String(body.address ?? "").trim() || null;

      // Prefer resolve when birth is known so we don't invent duplicates.
      try {
        const existingId = await resolvePlayer(supabase, {
          name: legalName,
          birthDate,
          legalFirstName: fields.legalFirstName,
          legalLastName: fields.legalLastName,
          preferredName: fields.preferredName,
          email,
        });
        if (existingId) {
          await supabase
            .from("players")
            .update({
              legal_first_name: fields.legalFirstName,
              legal_last_name: fields.legalLastName,
              preferred_name: fields.preferredName,
              email,
              full_name: displayName,
              gender: gender || null,
              rating: rating || null,
              address,
            })
            .eq("id", existingId);
          return Response.json({ ok: true, playerId: existingId, fullName: displayName, existed: true });
        }
      } catch (err) {
        console.error("createPlayer resolve", err);
      }

      const { data: created, error } = await supabase
        .from("players")
        .insert({
          full_name: displayName,
          normalized_name: normalized,
          birth_date: birthDate,
          legal_first_name: fields.legalFirstName,
          legal_last_name: fields.legalLastName,
          preferred_name: fields.preferredName,
          email,
          gender: gender || null,
          rating: rating || null,
          address,
        })
        .select("id")
        .single();
      if (error) {
        console.error("create player failed", error);
        if (error.code === "23505") {
          return bad(
            "A player with that legal name and birth date is already on file.",
            409
          );
        }
        return bad(error.message || "Could not create that player", 500);
      }
      return Response.json({
        ok: true,
        playerId: created.id,
        fullName: displayName,
        existed: false,
      });
    }

    // ---- Full edit of a player directory row -------------------------
    case "updatePlayer": {
      const { playerId } = body;
      if (!playerId) return bad("Which player?");

      const fields = personFieldsFromInput(body, { allowPhone: false });
      if (!fields.legalFirstName || !fields.legalLastName) {
        return bad("Legal first and last name are required");
      }
      if (!fields.email) return bad("Contact email is required");
      const birthDate = String(body.birthDate ?? body.birth_date ?? "").trim();
      if (!birthDate) return bad("Birth date is required");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        return bad("Birth date must be YYYY-MM-DD");
      }

      const gender = body.gender ? String(body.gender).trim() : null;
      if (gender && !["M", "F"].includes(gender)) {
        return bad("Gender must be M or F, or blank");
      }
      const rating = body.rating ? String(body.rating).trim() : null;
      if (rating && !RATINGS.includes(rating)) {
        return bad(`Rating must be one of ${RATINGS.join(", ")}, or blank`);
      }

      const { data: player } = await supabase
        .from("players")
        .select("id, merged_into_id")
        .eq("id", playerId)
        .maybeSingle();
      if (!player) return bad("That player is not on file", 404);
      if (player.merged_into_id) {
        return bad(
          "That row was already merged away — open the surviving player instead",
          409
        );
      }

      const legalName =
        fields.legalName ||
        composeLegalName({
          legalFirstName: fields.legalFirstName,
          legalLastName: fields.legalLastName,
        });
      const displayName =
        fields.displayName ||
        composeDisplayName({
          preferredName: fields.preferredName,
          legalFirstName: fields.legalFirstName,
          legalLastName: fields.legalLastName,
        });
      const normalized = normalizeName(legalName);
      if (!normalized) return bad("A legal name is required");

      const address =
        body.address !== undefined
          ? String(body.address ?? "").trim() || null
          : undefined;

      const patch = {
        legal_first_name: fields.legalFirstName,
        legal_last_name: fields.legalLastName,
        preferred_name: fields.preferredName,
        email: fields.email,
        birth_date: birthDate,
        full_name: displayName,
        normalized_name: normalized,
        gender: gender || null,
        rating: rating || null,
      };
      if (address !== undefined) patch.address = address;

      const { error } = await supabase
        .from("players")
        .update(patch)
        .eq("id", playerId);
      if (error) {
        console.error("update player failed", error);
        // Unique on (normalized_name, birth_date) — another living player already is this person.
        if (error.code === "23505") {
          return bad(
            "Another player already has that legal name and birth date. Merge the duplicate instead of editing into a collision.",
            409
          );
        }
        return bad(error.message || "Could not save that player — please try again", 500);
      }
      return Response.json({ ok: true, fullName: displayName });
    }

    // ---- Rate a player -----------------------------------------------
    case "setPlayerRating": {
      const { playerId, rating } = body;
      if (!playerId) return bad("Which player?");
      if (rating && !RATINGS.includes(rating)) {
        return bad(`Rating must be one of ${RATINGS.join(", ")}, or blank`);
      }
      const { error } = await supabase
        .from("players")
        .update({ rating: rating || null })
        .eq("id", playerId);
      if (error) {
        console.error("set player rating failed", error);
        return bad("Could not save that rating — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Which calendar day a division plays (scheduler input) ------
    case "setDivisionPlayDay": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const { divisionId, dayDate } = body;
      if (!divisionId) return bad("Which division?");

      let day = dayDate != null ? String(dayDate).trim().slice(0, 10) : null;
      if (day === "") day = null;
      if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return bad("Play day must be YYYY-MM-DD");
      }

      const { data: div } = await supabase
        .from("divisions")
        .select("id, tournament_id, parent_division_id")
        .eq("id", divisionId)
        .maybeSingle();
      if (!div) return bad("That division does not exist", 404);

      if (day) {
        const { data: tour } = await supabase
          .from("tournaments")
          .select("start_date, end_date")
          .eq("id", div.tournament_id)
          .maybeSingle();
        if (tour) {
          const start = String(tour.start_date ?? "").slice(0, 10);
          const end = String(tour.end_date ?? tour.start_date ?? "").slice(0, 10);
          if (start && day < start) {
            return bad(`Play day is before the tournament starts (${start})`);
          }
          if (end && day > end) {
            return bad(`Play day is after the tournament ends (${end})`);
          }
        }
      }

      const { formatPlayDayLabel } = await import("@/lib/league-time");
      const dayLabel = day ? formatPlayDayLabel(day) : null;
      const patch = { day_date: day, day_label: dayLabel };

      // Update this row and Gold/Silver/Bronze (or pool) children so the
      // whole bracket family shares one play day.
      const { data: children } = await supabase
        .from("divisions")
        .select("id")
        .eq("parent_division_id", divisionId);
      const ids = [divisionId, ...(children ?? []).map((c) => c.id)];

      const { error } = await supabase
        .from("divisions")
        .update(patch)
        .in("id", ids);
      if (error) {
        console.error("setDivisionPlayDay failed", error);
        return bad("Could not save play day — please try again", 500);
      }
      return Response.json({
        ok: true,
        dayDate: day,
        dayLabel,
        updatedIds: ids,
      });
    }

    // ---- Bulk: assign play days by gender (Men's/Women's Sat, Coed Sun)
    case "setTournamentPlayDays": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const { tournamentId } = body;
      if (!tournamentId) return bad("Which tournament?");

      const { data: tour } = await supabase
        .from("tournaments")
        .select("id, start_date, end_date")
        .eq("id", tournamentId)
        .maybeSingle();
      if (!tour) return bad("Tournament not found", 404);

      const start = String(tour.start_date ?? "").slice(0, 10);
      const end = String(tour.end_date ?? tour.start_date ?? "").slice(0, 10);

      /** @type {Map<string, string|null>} gender → dayDate */
      const byGender = new Map();
      if (body.allDayDate != null || body.useTournamentStart) {
        const day = body.useTournamentStart
          ? start || null
          : String(body.allDayDate ?? "").trim().slice(0, 10) || null;
        if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return bad("Play day must be YYYY-MM-DD");
        }
        for (const g of ["mens", "womens", "coed"]) byGender.set(g, day);
      }
      if (Array.isArray(body.assignments)) {
        for (const a of body.assignments) {
          const g = a?.gender;
          if (!["mens", "womens", "coed"].includes(g)) continue;
          let day =
            a.dayDate != null ? String(a.dayDate).trim().slice(0, 10) : null;
          if (day === "") day = null;
          if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            return bad(`Play day for ${g} must be YYYY-MM-DD`);
          }
          byGender.set(g, day);
        }
      }
      // Convenience: mensWomensDay + coedDay
      if (body.mensWomensDay !== undefined) {
        let day =
          body.mensWomensDay != null
            ? String(body.mensWomensDay).trim().slice(0, 10)
            : null;
        if (day === "") day = null;
        if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return bad("Men's/Women's day must be YYYY-MM-DD");
        }
        byGender.set("mens", day);
        byGender.set("womens", day);
      }
      if (body.coedDay !== undefined) {
        let day =
          body.coedDay != null
            ? String(body.coedDay).trim().slice(0, 10)
            : null;
        if (day === "") day = null;
        if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
          return bad("Coed day must be YYYY-MM-DD");
        }
        byGender.set("coed", day);
      }

      if (byGender.size === 0) return bad("Nothing to assign");

      for (const day of byGender.values()) {
        if (!day) continue;
        if (start && day < start) {
          return bad(`Play day ${day} is before the tournament starts (${start})`);
        }
        if (end && day > end) {
          return bad(`Play day ${day} is after the tournament ends (${end})`);
        }
      }

      const { data: divisions } = await supabase
        .from("divisions")
        .select("id, gender, parent_division_id")
        .eq("tournament_id", tournamentId);
      if (!divisions?.length) {
        return Response.json({ ok: true, updated: 0 });
      }

      const { formatPlayDayLabel } = await import("@/lib/league-time");
      let updated = 0;
      for (const [gender, day] of byGender) {
        const targets = divisions.filter(
          (d) => d.gender === gender && !d.parent_division_id
        );
        // Also update children of those parents (and orphan children of that gender)
        const parentIds = new Set(targets.map((d) => d.id));
        const childIds = divisions
          .filter(
            (d) =>
              d.parent_division_id &&
              (parentIds.has(d.parent_division_id) || d.gender === gender)
          )
          .map((d) => d.id);
        const ids = [...new Set([...parentIds, ...childIds])];
        if (ids.length === 0) continue;
        const patch = {
          day_date: day,
          day_label: day ? formatPlayDayLabel(day) : null,
        };
        const { error } = await supabase
          .from("divisions")
          .update(patch)
          .in("id", ids);
        if (error) {
          console.error("setTournamentPlayDays failed", error);
          return bad("Could not save play days — please try again", 500);
        }
        updated += ids.length;
      }
      return Response.json({ ok: true, updated });
    }

    // ---- Change a division's coed split ------------------------------
    case "setDivisionMinimums": {
      const { divisionId, minMen, minWomen } = body;
      if (!divisionId) return bad("Which division?");
      for (const v of [minMen, minWomen]) {
        if (v != null && (!Number.isInteger(v) || v < 0)) {
          return bad("Minimums must be whole numbers, or blank for no requirement");
        }
      }
      // Only the keys that were sent. An inline edit changes one number, and
      // defaulting the other to null would silently clear it.
      const patch = {};
      if ("minMen" in body) patch.min_men = minMen ?? null;
      if ("minWomen" in body) patch.min_women = minWomen ?? null;
      if (Object.keys(patch).length === 0) return bad("Nothing to change");

      const { error } = await supabase.from("divisions").update(patch).eq("id", divisionId);
      if (error) {
        console.error("set division minimums failed", error);
        return bad("Could not save — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Record a player's gender ------------------------------------
    case "setPlayerGender": {
      const { playerId, gender } = body;
      if (!playerId) return bad("Which player?");
      if (gender && !["M", "F"].includes(gender)) return bad("Gender must be M or F, or blank");
      const { error } = await supabase
        .from("players")
        .update({ gender: gender || null })
        .eq("id", playerId);
      if (error) {
        console.error("set player gender failed", error);
        return bad("Could not save that — please try again", 500);
      }
      return Response.json({ ok: true });
    }

    // ---- Enter a team at a class -------------------------------------
    case "setRegistrationClass": {
      const { registrationId, className } = body;
      let { classId } = body;
      if (!registrationId) return bad("Which team?");
      // The inline select sends a NAME, because that is what it shows. Resolve
      // it here rather than making every caller carry class ids around.
      if (classId === undefined) {
        if (!className) classId = null;
        else {
          const { data: cls } = await supabase
            .from("classes")
            .select("id")
            .eq("name", className)
            .maybeSingle();
          if (!cls) return bad(`There is no class called ${className}`, 404);
          classId = cls.id;
        }
      }
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

    // ---- Director seed order for a division ----------------------------
    case "setDivisionSeedOrder": {
      const { divisionId, seedOrder } = body;
      if (!divisionId) return bad("Which division?");
      if (!Array.isArray(seedOrder)) return bad("seedOrder must be an array of team names");
      const { data: regs, error: regErr } = await supabase
        .from("registrations")
        .select("team_name")
        .eq("division_id", divisionId)
        .neq("status", "withdrawn");
      if (regErr) {
        console.error(regErr);
        return bad("Could not load teams", 500);
      }
      const teamNames = (regs ?? []).map((r) => r.team_name).filter(Boolean);
      const { normalizeSeedOrder, isCompleteSeedOrder } = await import("@/lib/bracket/seed-order");
      const order = normalizeSeedOrder(teamNames, seedOrder);
      if (teamNames.length >= 2 && !isCompleteSeedOrder(teamNames, order)) {
        return bad("Seed list must include every registered team exactly once");
      }
      const { error } = await supabase
        .from("divisions")
        .update({ seed_order: order })
        .eq("id", divisionId);
      if (error) {
        console.error("setDivisionSeedOrder failed", error);
        return bad(
          error.message?.includes("seed_order")
            ? "seed_order column missing — run migration-2026-08-03-division-seed-order.sql"
            : "Could not save seed order",
          500
        );
      }
      return Response.json({ ok: true, seedOrder: order });
    }

    // ---- Build Pool A round-robin from registered teams (demo / no QS) --
    case "createPoolRoundRobin": {
      const { divisionId, poolLetter = "A" } = body;
      if (!divisionId) return bad("Which division?");
      const letter = String(poolLetter || "A")
        .trim()
        .toUpperCase()
        .slice(0, 1);
      if (!/^[A-I]$/.test(letter)) return bad("Pool letter must be A–I");

      const { data: existing, error: existErr } = await supabase
        .from("pool_games")
        .select("id")
        .eq("division_id", divisionId)
        .limit(1);
      if (existErr) {
        console.error(existErr);
        return bad("Could not check pool games", 500);
      }
      if ((existing ?? []).length > 0) {
        return bad("This division already has pool games", 409);
      }

      const { data: regs, error: regErr } = await supabase
        .from("registrations")
        .select("team_name")
        .eq("division_id", divisionId)
        .neq("status", "withdrawn");
      if (regErr) {
        console.error(regErr);
        return bad("Could not load teams", 500);
      }
      const teamNames = (regs ?? []).map((r) => r.team_name).filter(Boolean);
      if (teamNames.length < 2) return bad("Need at least 2 registered teams");

      const { roundRobinPairs } = await import("@/lib/bracket/seed");
      const pairs = roundRobinPairs(teamNames);
      const rows = pairs.map(([team1_name, team2_name], i) => ({
        division_id: divisionId,
        pool: letter,
        team1_name,
        team2_name,
        field: `Field ${(i % 2) + 1}`,
        status: "scheduled",
      }));

      const { data: inserted, error: insErr } = await supabase
        .from("pool_games")
        .insert(rows)
        .select("id");
      if (insErr) {
        console.error("createPoolRoundRobin failed", insErr);
        return bad("Could not create pool games", 500);
      }
      return Response.json({
        ok: true,
        pool: letter,
        gameCount: inserted?.length ?? rows.length,
        teamCount: teamNames.length,
      });
    }

    // ---- Player suspensions (director only, mid-tournament OK) -------
    case "createSuspension": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const playerId = body.playerId;
      if (!playerId) return bad("Which player?");

      const tournamentId = body.tournamentId
        ? String(body.tournamentId).trim()
        : null;
      const startsOn = body.startsOn
        ? String(body.startsOn).trim().slice(0, 10)
        : null;
      const endsOn = body.endsOn
        ? String(body.endsOn).trim().slice(0, 10)
        : null;
      const note = body.note != null ? String(body.note).trim() || null : null;

      const dateOk = (d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
      if (!dateOk(startsOn) || !dateOk(endsOn)) {
        return bad("Dates must be YYYY-MM-DD");
      }
      if (startsOn && endsOn && startsOn > endsOn) {
        return bad("Start date must be on or before end date");
      }
      // At least one scope, or open-ended until lift (allowed with a note).
      if (!tournamentId && !startsOn && !endsOn && !note) {
        return bad(
          "Set a tournament, a date range, or a note (or all three)."
        );
      }

      const { data: player } = await supabase
        .from("players")
        .select("id, full_name, merged_into_id")
        .eq("id", playerId)
        .maybeSingle();
      if (!player) return bad("That player is not on file", 404);
      if (player.merged_into_id) {
        return bad(
          "That row was already merged away — open the surviving player instead",
          409
        );
      }

      if (tournamentId) {
        const { data: tour } = await supabase
          .from("tournaments")
          .select("id, name")
          .eq("id", tournamentId)
          .maybeSingle();
        if (!tour) return bad("That tournament does not exist", 404);
      }

      const now = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("player_suspensions")
        .insert({
          player_id: playerId,
          tournament_id: tournamentId || null,
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          note,
          created_at: now,
          updated_at: now,
        })
        .select(
          "id, player_id, tournament_id, starts_on, ends_on, note, lifted_at, created_at"
        )
        .single();

      if (error) {
        console.error("create suspension failed", error);
        if (
          error.code === "42P01" ||
          error.message?.includes("player_suspensions")
        ) {
          return bad(
            "Suspensions table is missing — run migration-2026-08-11-player-suspensions.sql",
            500
          );
        }
        return bad(error.message || "Could not save suspension", 500);
      }
      return Response.json({ ok: true, suspension: row });
    }

    case "liftSuspension": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const suspensionId = body.suspensionId;
      if (!suspensionId) return bad("Which suspension?");

      const now = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("player_suspensions")
        .update({ lifted_at: now, updated_at: now })
        .eq("id", suspensionId)
        .is("lifted_at", null)
        .select(
          "id, player_id, tournament_id, starts_on, ends_on, note, lifted_at"
        )
        .maybeSingle();

      if (error) {
        console.error("lift suspension failed", error);
        return bad(error.message || "Could not lift suspension", 500);
      }
      if (!row) return bad("That suspension is already lifted or missing", 404);
      return Response.json({ ok: true, suspension: row });
    }

    case "updateSuspensionNote": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const suspensionId = body.suspensionId;
      if (!suspensionId) return bad("Which suspension?");
      const note = body.note != null ? String(body.note).trim() || null : null;
      const now = new Date().toISOString();
      const { data: row, error } = await supabase
        .from("player_suspensions")
        .update({ note, updated_at: now })
        .eq("id", suspensionId)
        .select(
          "id, player_id, tournament_id, starts_on, ends_on, note, lifted_at"
        )
        .maybeSingle();
      if (error) {
        console.error("update suspension note failed", error);
        return bad(error.message || "Could not update note", 500);
      }
      if (!row) return bad("That suspension was not found", 404);
      return Response.json({ ok: true, suspension: row });
    }

    // ---- Hand-built bracket (director typed the games; no Generate) --
    case "addHandGame": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const divisionId = body.divisionId;
      if (!divisionId) return bad("Which division?");
      const { data: generated } = await supabase
        .from("brackets")
        .select("id")
        .eq("division_id", divisionId)
        .eq("bracket_group", "main")
        .maybeSingle();
      if (generated) {
        return bad(
          "This division already has a generated bracket. Use Matchups on that bracket, or Clear & generate first."
        );
      }

      const { data: existing, error: existErr } = await supabase
        .from("games")
        .select("id, round")
        .eq("division_id", divisionId)
        .eq("bracket_group", "main")
        .order("round", { ascending: false });
      if (existErr) return bad("Could not load games", 500);
      const byRound = new Map((existing ?? []).map((g) => [g.round, g.id]));
      const nextRound = ((existing ?? [])[0]?.round ?? 0) + 1;

      function seat(raw) {
        const name = String(raw ?? "").trim();
        if (!name) return { error: "Both sides need a team, or Winner/Loser of a game." };
        const win = /^Winner of Game (\d+)$/i.exec(name);
        const lose = /^Loser of Game (\d+)$/i.exec(name);
        const ref = win || lose;
        if (ref) {
          const n = Number(ref[1]);
          const id = byRound.get(n);
          if (!id) return { error: `Game ${n} is not on this bracket yet.` };
          if (n >= nextRound) return { error: `Game ${n} is not on this bracket yet.` };
          return {
            name: `${win ? "Winner" : "Loser"} of Game ${n}`,
            sourceId: id,
            sourceResult: win ? "winner" : "loser",
          };
        }
        return { name, sourceId: null, sourceResult: null };
      }

      const left = seat(body.team1Name);
      if (left.error) return bad(left.error);
      const right = seat(body.team2Name);
      if (right.error) return bad(right.error);

      const field = String(body.field ?? "").trim() || null;
      let scheduled_time = null;
      if (body.scheduledTime) {
        const d = new Date(body.scheduledTime);
        if (Number.isNaN(d.getTime())) return bad("That time is not a time.");
        scheduled_time = d.toISOString();
      }

      const row = {
        division_id: divisionId,
        bracket_group: "main",
        bracket_side: "winners",
        round: nextRound,
        slot: 1,
        team1_name: left.name,
        team2_name: right.name,
        team1_source_game_id: left.sourceId,
        team1_source_result: left.sourceResult,
        team2_source_game_id: right.sourceId,
        team2_source_result: right.sourceResult,
        field,
        scheduled_time,
        status: "pending",
      };
      const { data: inserted, error: insErr } = await supabase
        .from("games")
        .insert(row)
        .select("id, round")
        .maybeSingle();
      if (insErr) {
        console.error("addHandGame failed", insErr);
        return bad("Could not add that game", 500);
      }
      return Response.json({ ok: true, game: inserted });
    }

    case "deleteHandGame": {
      if (!(await requireDirectorSession())) {
        return Response.json({ error: "Director only" }, { status: 403 });
      }
      const gameId = body.gameId;
      if (!gameId) return bad("Which game?");
      const { data: game, error: findErr } = await supabase
        .from("games")
        .select("id, division_id, status, is_bye")
        .eq("id", gameId)
        .maybeSingle();
      if (findErr || !game) return bad("Game not found", 404);
      const { data: generated } = await supabase
        .from("brackets")
        .select("id")
        .eq("division_id", game.division_id)
        .eq("bracket_group", "main")
        .maybeSingle();
      if (generated) return bad("Generated brackets are cleared from Matchups, not one game at a time.");
      if (game.status === "final" && !game.is_bye) {
        return bad("That game already has a score.");
      }
      const { count, error: depErr } = await supabase
        .from("games")
        .select("id", { count: "exact", head: true })
        .or(`team1_source_game_id.eq.${gameId},team2_source_game_id.eq.${gameId}`);
      if (depErr) return bad("Could not check later games", 500);
      if ((count ?? 0) > 0) {
        return bad("A later game still reads Winner/Loser of this one. Remove that first.");
      }
      const { error: delErr } = await supabase.from("games").delete().eq("id", gameId);
      if (delErr) return bad("Could not remove that game", 500);
      return Response.json({ ok: true });
    }

    default:
      return bad("Unknown action");
  }
}
