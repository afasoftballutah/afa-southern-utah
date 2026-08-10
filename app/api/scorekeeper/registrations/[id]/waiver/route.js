import { requireDirectorSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// The `waivers` bucket is private, and stays private — a waiver carries names,
// dates of birth, addresses and signatures. This hands out a short-lived
// signed URL instead of a permanent one, so a link pasted somewhere by mistake
// stops working within the hour. Director-only (PII).
const SIGNED_URL_SECONDS = 600;

export async function GET(_request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: registration, error } = await supabase
    .from("registrations")
    .select("pdf_storage_path, team_name")
    .eq("id", id)
    .maybeSingle();

  if (error || !registration) {
    return Response.json({ error: "Registration not found" }, { status: 404 });
  }
  if (!registration.pdf_storage_path) {
    return Response.json({ error: "No waiver has been generated for this team yet" }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("waivers")
    .createSignedUrl(registration.pdf_storage_path, SIGNED_URL_SECONDS);

  if (signError || !signed?.signedUrl) {
    console.error("waiver signed url failed", signError);
    return Response.json({ error: "Could not open the waiver — please try again" }, { status: 500 });
  }

  return Response.redirect(signed.signedUrl, 302);
}
