import { getServiceClient } from "@/lib/supabase";
import { buildWaiverPdf } from "@/lib/pdf/build-waiver-pdf";
import { sendRegistrationEmail } from "@/lib/email/send-registration-email";
import { RELEASE_TEXT_VERSION } from "@/lib/waiver";

export const runtime = "nodejs"; // pdf-lib + nodemailer need the Node runtime, not Edge

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
    signaturePng,
  } = body ?? {};

  if (!tournamentId || !divisionId) return bad("Missing tournament or division");
  if (!teamName || !teamName.trim()) return bad("Team name is required");
  if (!manager?.name || !manager?.email) return bad("Manager name and email are required");
  if (!Array.isArray(players) || players.length === 0) return bad("At least one player is required");
  if (!signaturePng) return bad("Manager signature is required");

  const supabase = getServiceClient();

  // Look up division/tournament names for the PDF + email (server-side, trusted read)
  const { data: division, error: divError } = await supabase
    .from("divisions")
    .select("id, name, tournament_id, tournaments(name)")
    .eq("id", divisionId)
    .maybeSingle();
  if (divError || !division || division.tournament_id !== tournamentId) {
    return bad("Tournament/division not found", 404);
  }

  const submittedAt = new Date().toISOString();

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
      players,
      coaches: coaches ?? [],
      release_text_version: RELEASE_TEXT_VERSION,
      submitted_at: submittedAt,
      email_status: "pending",
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("registrations insert failed", insertError);
    return bad("Could not save registration — please try again", 500);
  }

  const registrationId = inserted.id;

  // Build the signed PDF and store it privately. Failure here does not
  // undo the DB row — the registration is already safely on file even if
  // the PDF or email step has a problem.
  let pdfBytes = null;
  try {
    pdfBytes = await buildWaiverPdf({
      teamName: teamName.trim(),
      class: className,
      divisionName: division.name,
      afaMembershipNumber,
      manager,
      players,
      coaches: coaches ?? [],
      signaturePng,
      submittedAt,
    });

    const path = `${registrationId}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("waivers")
      .upload(path, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.error("waiver upload failed", uploadError);
    } else {
      await supabase.from("registrations").update({ pdf_storage_path: path }).eq("id", registrationId);
    }
  } catch (err) {
    console.error("PDF generation failed", err);
  }

  let emailStatus = "failed";
  if (pdfBytes) {
    const result = await sendRegistrationEmail({
      pdfBytes,
      registration: {
        teamName: teamName.trim(),
        tournamentName: division.tournaments?.name ?? "",
        divisionName: division.name,
        manager,
      },
    });
    emailStatus = result.ok ? "sent" : "failed";
    await supabase
      .from("registrations")
      .update({ email_status: emailStatus, email_error: result.ok ? null : result.error })
      .eq("id", registrationId);
  } else {
    await supabase
      .from("registrations")
      .update({ email_status: "failed", email_error: "PDF generation failed" })
      .eq("id", registrationId);
  }

  return Response.json({ ok: true, registrationId, emailStatus });
}
