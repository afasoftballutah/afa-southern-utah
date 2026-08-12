import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { getActiveWaiver } from "@/lib/site-docs";
import { resolvePlayer, resolveTeam } from "@/lib/identity";
import { personFieldsFromInput } from "@/lib/person-name";
import {
  SIGN_VIA,
  recordWaiverSignEvent,
  rosterSignPatch,
  signAuditFromRequest,
  updateRosterSign,
} from "@/lib/sign-audit";
import { tournamentPersonKey } from "@/lib/tournament-waiver";

// NO OUTBOUND COMMS — hard constraint (JD ruling, 2026-07-21). This route
// saves the registration, creates one roster_members row per player/coach
// with its own signing_token, and generates the PDF snapshot. It never
// emails, texts, or otherwise sends anything to anyone. There is no
// nodemailer/email dependency in this project at all — it was removed, not
// just left unconfigured, so there is no code path capable of sending mail.
// The manager is shown each roster member's personal signing link on the
// confirmation screen and shares them herself, however she likes. "Who
// should be notified of what" is a future admin-panel feature — not built
// here, and nothing sends in the meantime.

export const runtime = "nodejs"; // pdf-lib needs the Node runtime, not Edge

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON body");
  }

  const {
    tournamentId,
    divisionId,
    teamName,
    class: className,
    afaMembershipNumber,
    manager,
    players,
    coaches,
    signaturePng, // optional — the manager may sign now or later, like anyone else
  } = body ?? {};

  if (!tournamentId || !divisionId) return bad("Missing tournament or division");
  if (!teamName || !teamName.trim()) return bad("Team name is required");

  const managerPerson = personFieldsFromInput(manager, { allowPhone: true });
  if (!managerPerson.displayName || !managerPerson.email) {
    return bad("Manager legal name (or name) and email are required");
  }
  if (!Array.isArray(players) || players.length === 0) {
    return bad("At least one player is required");
  }

  // Manager-entered players: first + last + gender. Full identity at waiver sign.
  // Optional playerId when manager picked someone already in the directory.
  const playerRows = (players ?? [])
    .map((p) => {
      const first = String(p.firstName ?? p.legalFirstName ?? "").trim();
      const last = String(p.lastName ?? p.legalLastName ?? "").trim();
      const gender =
        p.gender === "M" || p.gender === "F" ? p.gender : null;
      const person = personFieldsFromInput(
        {
          legalFirstName: first,
          legalLastName: last,
          preferredName: p.preferredName,
          email: p.email,
          name: p.name,
        },
        { allowPhone: false }
      );
      const displayName =
        person.displayName || [first, last].filter(Boolean).join(" ");
      return {
        first,
        last,
        gender,
        displayName,
        person,
        birthDate: p.birthDate || null,
        address: p.address || null,
        knownPlayerId: p.playerId ? String(p.playerId) : null,
      };
    })
    .filter((p) => p.displayName);
  if (playerRows.length === 0) {
    return bad("At least one player with first and last name is required");
  }
  const missingGender = playerRows.find((p) => !p.gender);
  if (missingGender) {
    return bad("Each player needs a gender (M or F)");
  }
  // No signature check. JD, 2026-07-27: "should be able to sign it whenever,
  // even after submitting. Signing makes it official." Submitting records the
  // team; the manager gets her own signing link back and can use it later,
  // exactly like every player does.

  const supabase = getServiceClient();

  const { data: division, error: divError } = await supabase
    .from("divisions")
    .select("id, tournament_id, class_id, classes(name)")
    .eq("id", divisionId)
    .maybeSingle();
  if (divError || !division || division.tournament_id !== tournamentId) {
    return bad("Tournament/division not found", 404);
  }

  const divisionClassName = division.classes?.name ?? null;
  const storedClass =
    divisionClassName ||
    (typeof className === "string" && /^(open|d|e|rec)$/i.test(className.trim())
      ? className.trim()
      : null);

  const { data: inserted, error: insertError } = await supabase
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      division_id: divisionId,
      team_name: teamName.trim(),
      class: storedClass,
      class_id: division.class_id ?? null,
      afa_membership_number: afaMembershipNumber ?? null,
      manager_name: managerPerson.displayName,
      manager_email: managerPerson.email,
      manager_phone: managerPerson.phone ?? manager?.phone ?? null,
      manager_cell: manager.cell ?? null,
      manager_address: manager.address ?? null,
      manager_city: manager.city ?? null,
      manager_state: manager.state ?? null,
      manager_zip: manager.zip ?? null,
      manager_signature_png: signaturePng ?? null,
      manager_signed_at: signaturePng ? new Date().toISOString() : null,
      release_text_version: (await getActiveWaiver()).version,
    })
    .select("id, roster_token, manage_token")
    .single();

  if (insertError) {
    // 23505 is registrations_one_live_per_division — she already registered
    // this team, or tapped submit twice. Say so; a 500 makes her try again
    // and again against an index that will never let her through.
    if (insertError.code === "23505") {
      return Response.json(
        {
          error: `${teamName.trim()} is already registered for this division.`,
          code: "duplicate_key",
        },
        { status: 409 }
      );
    }
    console.error("registrations insert failed", insertError);
    return bad("Could not save registration — please try again", 500);
  }

  const registrationId = inserted.id;

  const rosterRows = [
    ...playerRows.map((p) => {
      // Manager list: first + last so manage/roster pages can tell people
      // apart. Preferred stays empty until they sign (score sheets can use
      // first name later).
      const first = p.first || p.person.legalFirstName || "";
      const last = p.last || p.person.legalLastName || "";
      const full = [first, last].filter(Boolean).join(" ") || p.displayName;
      return {
        registration_id: registrationId,
        role: "player",
        name: full,
        legal_first_name: first || null,
        legal_last_name: last || null,
        preferred_name: null,
        email: null,
        phone: null,
        gender: p.gender,
        birth_date: null,
        address: null,
      };
    }),
    ...(coaches ?? [])
      .map((c) => personFieldsFromInput(c, { allowPhone: true }))
      .filter((c) => c.displayName)
      .map((c) => ({
        registration_id: registrationId,
        role: "coach",
        name: c.displayName,
        legal_first_name: c.legalFirstName,
        legal_last_name: c.legalLastName,
        preferred_name: c.preferredName,
        email: c.email,
        phone: c.phone,
      })),
  ];

  // The manager is on the roster. JD, 2026-07-27: "all managers should be on
  // their teams roster - this is regular. Dont need two waivers." Normally
  // she is already in the player list and this finds her; if she left herself
  // out, add her rather than let the roster disagree with the form. Either
  // way she ends up with ONE row, ONE link and ONE signature.
  const same = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();
  if (!rosterRows.some((r) => same(r.name, managerPerson.displayName))) {
    rosterRows.push({
      registration_id: registrationId,
      role: "manager",
      name: managerPerson.displayName,
      legal_first_name: managerPerson.legalFirstName,
      legal_last_name: managerPerson.legalLastName,
      preferred_name: managerPerson.preferredName,
      email: managerPerson.email,
      phone: managerPerson.phone,
    });
  }

  const { data: insertedRoster, error: rosterError } = await supabase
    .from("roster_members")
    .insert(rosterRows)
    .select("id, role, name, signing_token");

  if (rosterError) {
    console.error("roster_members insert failed", rosterError);
    // Take the registration back out. A team row with no roster is invisible
    // to every surface, but it still holds the unique index on the team name,
    // so the manager's next attempt would be rejected as a duplicate of
    // something she cannot see. There is no transaction across these two
    // inserts, so undo it by hand.
    await supabase.from("registrations").delete().eq("id", registrationId);
    return bad("Could not save the roster — please try again", 500);
  }

  // Resolve to stored identities, so this team and these people exist beyond
  // one weekend. Every failure here is SOFT: an unresolved row leaves a null
  // for a director to look at, and never costs the manager her registration.
  // Nothing below is allowed to throw past this point.
  const managerRow = insertedRoster.find((r) =>
    same(r.name, managerPerson.displayName)
  );
  const patch = { manager_member_id: managerRow?.id ?? null };

  try {
    patch.team_id = await resolveTeam(supabase, {
      teamName: teamName.trim(),
      divisionId,
      managerName: managerPerson.displayName ?? null,
    });

    await Promise.all(
      insertedRoster.map(async (row) => {
        const source = rosterRows.find((r) => r.name === row.name);
        // Prefer manager-picked directory id when present.
        const fromPick = playerRows.find(
          (p) => p.displayName === row.name && p.knownPlayerId
        )?.knownPlayerId;
        let playerId = fromPick || null;
        if (playerId) {
          const { data: known } = await supabase
            .from("players")
            .select("id, merged_into_id")
            .eq("id", playerId)
            .maybeSingle();
          playerId = known
            ? known.merged_into_id || known.id
            : null;
        }
        if (!playerId) {
          playerId = await resolvePlayer(supabase, {
            name: row.name,
            birthDate: source?.birth_date ?? null,
            legalFirstName: source?.legal_first_name,
            legalLastName: source?.legal_last_name,
            preferredName: source?.preferred_name,
            email: source?.email,
          });
        }
        if (playerId) {
          await supabase
            .from("roster_members")
            .update({ player_id: playerId })
            .eq("id", row.id);
        }
      })
    );
  } catch (err) {
    console.error("identity resolution failed", err);
  }

  // Her one signature also goes on her roster row, so the roster page and the
  // form's manager line cannot disagree.
  if (managerRow && signaturePng) {
    const now = new Date().toISOString();
    const audit = signAuditFromRequest(request, SIGN_VIA.REGISTER);
    await updateRosterSign(
      supabase,
      managerRow.id,
      rosterSignPatch({ signaturePng, signedAt: now, audit })
    );
    await recordWaiverSignEvent(supabase, {
      tournamentId,
      registrationId,
      memberId: managerRow.id,
      playerId: null,
      personKey: tournamentPersonKey({
        legalFirstName: managerPerson.legalFirstName,
        legalLastName: managerPerson.legalLastName,
        name: managerPerson.displayName,
      }),
      signedAt: now,
      signedIp: audit.signed_ip,
      signedPlace: audit.signed_place,
      signedUserAgent: audit.signed_user_agent,
      signedVia: audit.signed_via,
    });
  }
  await supabase.from("registrations").update(patch).eq("id", registrationId);

  try {
    await regenerateAndStoreWaiverPdf(registrationId);
  } catch (err) {
    // The registration and roster are already saved even if the PDF snapshot
    // fails — it regenerates on the next signature anyway. Log and move on.
    console.error("initial PDF snapshot failed", err);
  }

  const origin = new URL(request.url).origin;
  const signers = insertedRoster.map((r) => ({
    name: r.name,
    role: r.id === managerRow?.id ? "manager" : r.role,
    signLink: `${origin}/register/sign/${r.signing_token}`,
  }));

  // Two links, two audiences. Sharing the wrong one hands the whole team the
  // ability to remove each other, so they are never presented the same way.
  const rosterLink = `${origin}/register/roster/${inserted.roster_token}`;
  const manageLink = `${origin}/register/manage/${inserted.manage_token}`;

  return Response.json({ ok: true, registrationId, rosterLink, manageLink, signers });
}
