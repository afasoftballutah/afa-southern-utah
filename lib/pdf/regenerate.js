import { getServiceClient } from "@/lib/supabase";
import { waiverFormName } from "@/lib/person-name";
import { lastNameKey } from "@/lib/names";
import { getActiveWaiver } from "@/lib/site-docs";
import { buildWaiverPdf } from "./build-waiver-pdf";

/** Sort key for roster: legal last, then first (or split from name). */
function memberSortKey(r) {
  const last = String(r.legal_last_name ?? "").trim();
  const first = String(r.legal_first_name ?? "").trim();
  if (last || first) return `${last} ${first}`.toLowerCase();
  return lastNameKey(r.name);
}

/**
 * Re-fetches a registration + its roster members from the DB and rebuilds
 * the stored PDF snapshot (upsert, same path every time). Called once at
 * initial submission and again every time a roster member signs their
 * personal link — so the stored PDF always reflects current signing
 * status. Never sends anything anywhere; storage only.
 *
 * Names on the PDF: preferred + last, or first + last (never first-only).
 */
export async function regenerateAndStoreWaiverPdf(registrationId) {
  const supabase = getServiceClient();

  const { data: registration, error: regError } = await supabase
    .from("registrations")
    .select("*, divisions(name, display_name)")
    .eq("id", registrationId)
    .single();
  if (regError || !registration) {
    throw new Error(
      `Could not load registration ${registrationId}: ${regError?.message}`
    );
  }

  // Active roster only. A player the manager removed must not reappear on
  // the waiver the next time anyone else signs and this regenerates.
  const { data: rosterRows, error: rosterError } = await supabase
    .from("roster_members")
    .select("*")
    .eq("registration_id", registrationId)
    .is("removed_at", null)
    .order("created_at", { ascending: true });
  if (rosterError) {
    throw new Error(
      `Could not load roster for ${registrationId}: ${rosterError.message}`
    );
  }

  // Players (and coaches) alphabetical by last name — JD: roster sheets.
  const rows = [...(rosterRows ?? [])].sort((a, b) =>
    memberSortKey(a).localeCompare(memberSortKey(b), undefined, {
      sensitivity: "base",
    })
  );
  const managerMember = registration.manager_member_id
    ? rows.find((r) => r.id === registration.manager_member_id)
    : null;

  const managerDisplay = managerMember
    ? waiverFormName({
        preferredName: managerMember.preferred_name,
        legalFirstName: managerMember.legal_first_name,
        legalLastName: managerMember.legal_last_name,
        name: managerMember.name || registration.manager_name,
      })
    : waiverFormName({
        name: registration.manager_name,
        legalFirstName: registration.manager_name?.split?.(/\s+/)?.[0],
        legalLastName: registration.manager_name
          ?.trim()
          ?.split(/\s+/)
          ?.slice(1)
          ?.join(" "),
      }) ||
      registration.manager_name ||
      "";

  const waiver = await getActiveWaiver();
  const pdfBytes = await buildWaiverPdf({
    registration: {
      teamName: registration.team_name,
      class: registration.class,
      divisionName:
        registration.divisions?.display_name ||
        registration.divisions?.name ||
        "",
      afaMembershipNumber: registration.afa_membership_number,
      manager: {
        name: managerDisplay,
        email: registration.manager_email,
        phone: registration.manager_phone,
        cell: registration.manager_cell,
        address: registration.manager_address,
        city: registration.manager_city,
        state: registration.manager_state,
        zip: registration.manager_zip,
      },
      managerSignaturePng: registration.manager_signature_png,
      managerSignedAt:
        registration.manager_signed_at || managerMember?.signed_at || null,
      managerSignedPlace: managerMember?.signed_place || null,
    },
    rosterMembers: rows.map((r) => ({
      role: r.role,
      name: waiverFormName({
        preferredName: r.preferred_name,
        legalFirstName: r.legal_first_name,
        legalLastName: r.legal_last_name,
        name: r.name,
      }),
      birthDate: r.birth_date,
      address: r.address,
      email: r.email,
      phone: r.phone,
      signaturePng: r.signature_png,
      signedAt: r.signed_at,
      signedPlace: r.signed_place ?? null,
    })),
    releaseText: waiver.text,
  });

  const path = `${registrationId}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("waivers")
    .upload(path, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`Waiver PDF upload failed: ${uploadError.message}`);
  }

  await supabase
    .from("registrations")
    .update({ pdf_storage_path: path })
    .eq("id", registrationId);

  return path;
}
