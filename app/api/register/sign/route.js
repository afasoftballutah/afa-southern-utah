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

  // A token is either a roster member's or the manager's. Both are the same
  // shape and the same trust model, and neither is listed anywhere, so try
  // the roster first and fall through to the manager. JD, 2026-07-27: the
  // manager signs whenever, like everyone else.
  const { data: member } = await supabase
    .from("roster_members")
    .select("id, registration_id, removed_at")
    .eq("signing_token", token)
    .maybeSingle();

  let registrationId;

  if (member) {
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
    registrationId = member.registration_id;
  } else {
    const { data: registration } = await supabase
      .from("registrations")
      .select("id")
      .eq("manager_signing_token", token)
      .maybeSingle();

    if (!registration) return bad("Signing link not found", 404);

    const { error: updateError } = await supabase
      .from("registrations")
      .update({ manager_signature_png: signaturePng, manager_signed_at: now })
      .eq("id", registration.id);

    if (updateError) {
      console.error("manager sign update failed", updateError);
      return bad("Could not save your signature — please try again", 500);
    }
    registrationId = registration.id;
  }

  try {
    await regenerateAndStoreWaiverPdf(registrationId);
  } catch (err) {
    console.error("PDF regeneration after signing failed", err);
  }

  return Response.json({ ok: true });
}
