import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { RELEASE_TEXT_VERSION } from "@/lib/waiver";

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
    signaturePng, // manager's signature — captured live, she's present submitting
  } = body ?? {};

  if (!tournamentId || !divisionId) return bad("Missing tournament or division");
  if (!teamName || !teamName.trim()) return bad("Team name is required");
  if (!manager?.name || !manager?.email) return bad("Manager name and email are required");
  if (!Array.isArray(players) || players.length === 0) return bad("At least one player is required");
  if (!signaturePng) return bad("Manager signature is required");

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
      manager_signature_png: signaturePng,
      release_text_version: RELEASE_TEXT_VERSION,
    })
    .select("id")
    .single();

  if (insertError) {
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

  const { data: insertedRoster, error: rosterError } = await supabase
    .from("roster_members")
    .insert(rosterRows)
    .select("id, role, name, signing_token");

  if (rosterError) {
    console.error("roster_members insert failed", rosterError);
    return bad("Could not save the roster — please try again", 500);
  }

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
    role: r.role,
    signLink: `${origin}/register/sign/${r.signing_token}`,
  }));

  return Response.json({ ok: true, registrationId, signers });
}
