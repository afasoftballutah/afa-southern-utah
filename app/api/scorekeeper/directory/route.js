import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer, resolveTeam } from "@/lib/identity";
import { RELEASE_TEXT_VERSION } from "@/lib/waiver";
import { RATINGS } from "@/lib/class";

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

    default:
      return bad("Unknown action");
  }
}
