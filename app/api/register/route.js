import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { RELEASE_TEXT_VERSION } from "@/lib/waiver";
import { resolvePlayer, resolveTeam } from "@/lib/identity";

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
  if (!manager?.name || !manager?.email) return bad("Manager name and email are required");
  if (!Array.isArray(players) || players.length === 0) return bad("At least one player is required");
  // No signature check. JD, 2026-07-27: "should be able to sign it whenever,
  // even after submitting. Signing makes it official." Submitting records the
  // team; the manager gets her own signing link back and can use it later,
  // exactly like every player does.

  const supabase = getServiceClient();

  const { data: division, error: divError } = await supabase
    .from("divisions")
    .select("id, tournament_id")
    .eq("id", divisionId)
    .maybeSingle();
  if (divError || !division || division.tournament_id !== tournamentId) {
    return bad("Tournament/division not found", 404);
  }

  const { data: inserted, error: insertError } = await supabase
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      division_id: divisionId,
      team_name: teamName.trim(),
      class: className ?? null,
      afa_membership_number: afaMembershipNumber ?? null,
      manager_name: manager.name,
      manager_email: manager.email,
      manager_phone: manager.phone ?? null,
      manager_cell: manager.cell ?? null,
      manager_address: manager.address ?? null,
      manager_city: manager.city ?? null,
      manager_state: manager.state ?? null,
      manager_zip: manager.zip ?? null,
      manager_signature_png: signaturePng ?? null,
      manager_signed_at: signaturePng ? new Date().toISOString() : null,
      release_text_version: RELEASE_TEXT_VERSION,
    })
    .select("id, roster_token, manage_token")
    .single();

  if (insertError) {
    // 23505 is registrations_one_live_per_division — she already registered
    // this team, or tapped submit twice. Say so; a 500 makes her try again
    // and again against an index that will never let her through.
    if (insertError.code === "23505") {
      return bad(
        `${teamName.trim()} is already registered for this division. Check with whoever signed the team up — they have the link everyone signs from.`,
        409
      );
    }
    console.error("registrations insert failed", insertError);
    return bad("Could not save registration — please try again", 500);
  }

  const registrationId = inserted.id;

  const rosterRows = [
    ...players
      .filter((p) => p.name?.trim())
      .map((p) => ({
        registration_id: registrationId,
        role: "player",
        name: p.name.trim(),
        birth_date: p.birthDate || null,
        address: p.address || null,
      })),
    ...(coaches ?? [])
      .filter((c) => c.name?.trim())
      .map((c) => ({
        registration_id: registrationId,
        role: "coach",
        name: c.name.trim(),
        email: c.email || null,
        phone: c.phone || null,
      })),
  ];

  // The manager is on the roster. JD, 2026-07-27: "all managers should be on
  // their teams roster - this is regular. Dont need two waivers." Normally
  // she is already in the player list and this finds her; if she left herself
  // out, add her rather than let the roster disagree with the form. Either
  // way she ends up with ONE row, ONE link and ONE signature.
  const same = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();
  if (!rosterRows.some((r) => same(r.name, manager.name))) {
    rosterRows.push({
      registration_id: registrationId,
      role: "manager",
      name: manager.name.trim(),
      email: manager.email || null,
      phone: manager.phone || null,
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
  const managerRow = insertedRoster.find((r) => same(r.name, manager.name));
  const patch = { manager_member_id: managerRow?.id ?? null };

  try {
    patch.team_id = await resolveTeam(supabase, { teamName: teamName.trim(), divisionId });

    await Promise.all(
      insertedRoster.map(async (row) => {
        const source = rosterRows.find((r) => r.name === row.name);
        const playerId = await resolvePlayer(supabase, {
          name: row.name,
          birthDate: source?.birth_date ?? null,
        });
        if (playerId) {
          await supabase.from("roster_members").update({ player_id: playerId }).eq("id", row.id);
        }
      })
    );
  } catch (err) {
    console.error("identity resolution failed", err);
  }

  // Her one signature also goes on her roster row, so the roster page and the
  // form's manager line cannot disagree.
  if (managerRow && signaturePng) {
    await supabase
      .from("roster_members")
      .update({ signature_png: signaturePng, signed_at: new Date().toISOString() })
      .eq("id", managerRow.id);
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
