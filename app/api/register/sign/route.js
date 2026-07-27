import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";

// Personal remote-sign endpoint. No outbound comms here either — this only
// ever writes a signature to the roster_members row that matches the token
// and regenerates the stored PDF. The token itself is the credential
// (unguessable UUID, never listed anywhere) — same trust model as any
// e-sign share link. Looked up by exact match only; there is no list route.

export const runtime = "nodejs";

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

  const { token, signaturePng } = body ?? {};
  if (!token) return bad("Missing token");
  if (!signaturePng) return bad("Signature is required");

  const supabase = getServiceClient();
  const now = new Date().toISOString();

  // One path for everyone. The manager is a roster member like anyone else
  // (JD, 2026-07-27: "all managers should be on their teams roster ... Dont
  // need two waivers"), so there is exactly one kind of token.
  // The relationship MUST be named. Two foreign keys now join these tables —
  // roster_members.registration_id and registrations.manager_member_id — so a
  // bare `registrations(...)` embed is ambiguous and PostgREST refuses it.
  // Left unnamed, this returned an error, `member` came back null, and every
  // valid signing link 404'd.
  const { data: member, error: findError } = await supabase
    .from("roster_members")
    .select(
      "id, registration_id, removed_at, registrations!roster_members_registration_id_fkey(manager_member_id)"
    )
    .eq("signing_token", token)
    .maybeSingle();

  if (findError) {
    console.error("signing token lookup failed", findError);
    return bad("Could not open this signing link — please try again", 500);
  }
  if (!member) return bad("Signing link not found", 404);

  // A removed player must not be able to sign their way back onto a roster.
  if (member.removed_at) return bad("You are no longer on this roster", 410);

  const { error: updateError } = await supabase
    .from("roster_members")
    .update({ signature_png: signaturePng, signed_at: now })
    .eq("id", member.id);

  if (updateError) {
    console.error("roster_members sign update failed", updateError);
    return bad("Could not save your signature — please try again", 500);
  }

  // If this signer IS the manager, mirror it onto the registration so the
  // "Manager's Signature" line on the form is filled by the same act. One
  // signature, two places it appears — never two things to sign.
  if (member.registrations?.manager_member_id === member.id) {
    await supabase
      .from("registrations")
      .update({ manager_signature_png: signaturePng, manager_signed_at: now })
      .eq("id", member.registration_id);
  }

  try {
    await regenerateAndStoreWaiverPdf(member.registration_id);
  } catch (err) {
    console.error("PDF regeneration after signing failed", err);
  }

  return Response.json({ ok: true });
}
