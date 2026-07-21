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

  const { data: member, error: findError } = await supabase
    .from("roster_members")
    .select("id, registration_id")
    .eq("signing_token", token)
    .maybeSingle();

  if (findError || !member) return bad("Signing link not found", 404);

  const { error: updateError } = await supabase
    .from("roster_members")
    .update({ signature_png: signaturePng, signed_at: new Date().toISOString() })
    .eq("id", member.id);

  if (updateError) {
    console.error("roster_members sign update failed", updateError);
    return bad("Could not save your signature — please try again", 500);
  }

  try {
    await regenerateAndStoreWaiverPdf(member.registration_id);
  } catch (err) {
    console.error("PDF regeneration after signing failed", err);
  }

  return Response.json({ ok: true });
}
