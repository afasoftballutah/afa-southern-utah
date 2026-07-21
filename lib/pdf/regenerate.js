import { getServiceClient } from "@/lib/supabase";
import { buildWaiverPdf } from "./build-waiver-pdf";

/**
 * Re-fetches a registration + its roster members from the DB and rebuilds
 * the stored PDF snapshot (upsert, same path every time). Called once at
 * initial submission and again every time a roster member signs their
 * personal link — so the stored PDF always reflects current signing
 * status. Never sends anything anywhere; storage only.
 */
export async function regenerateAndStoreWaiverPdf(registrationId) {
  const supabase = getServiceClient();

  const { data: registration, error: regError } = await supabase
    .from("registrations")
    .select("*, divisions(name)")
    .eq("id", registrationId)
    .single();
  if (regError || !registration) {
    throw new Error(`Could not load registration ${registrationId}: ${regError?.message}`);
  }

  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_members")
    .select("*")
    .eq("registration_id", registrationId)
    .order("created_at", { ascending: true });
  if (rosterError) {
    throw new Error(`Could not load roster for ${registrationId}: ${rosterError.message}`);
  }

  const pdfBytes = await buildWaiverPdf({
    registration: {
      teamName: registration.team_name,
      class: registration.class,
      divisionName: registration.divisions?.name,
      afaMembershipNumber: registration.afa_membership_number,
      manager: {
        name: registration.manager_name,
        email: registration.manager_email,
        phone: registration.manager_phone,
        cell: registration.manager_cell,
        address: registration.manager_address,
        city: registration.manager_city,
        state: registration.manager_state,
        zip: registration.manager_zip,
      },
      managerSignaturePng: registration.manager_signature_png,
    },
    rosterMembers: (rosterRows ?? []).map((r) => ({
      role: r.role,
      name: r.name,
      birthDate: r.birth_date,
      address: r.address,
      email: r.email,
      phone: r.phone,
      signaturePng: r.signature_png,
      signedAt: r.signed_at,
    })),
  });

  const path = `${registrationId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("waivers")
    .upload(path, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    throw new Error(`Waiver PDF upload failed: ${uploadError.message}`);
  }

  await supabase.from("registrations").update({ pdf_storage_path: path }).eq("id", registrationId);

  return path;
}
