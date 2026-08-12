import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer, normalizeName } from "@/lib/identity";
import {
  composeDisplayName,
  composeLegalName,
} from "@/lib/person-name";
import { propagateTournamentWaiver, tournamentPersonKey } from "@/lib/tournament-waiver";
import { hasValidDirectorSession } from "@/lib/scorekeeper-auth";
import {
  SIGN_VIA,
  recordWaiverSignEvent,
  rosterSignPatch,
  signAuditFromRequest,
  updateRosterSign,
} from "@/lib/sign-audit";

// Personal remote-sign endpoint. No outbound comms here either — this only
// ever writes a signature to the roster_members row that matches the token
// and regenerates the stored PDF. One signature covers the whole tournament
// for that person (all divisions/teams), not one seat per division.

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

  const {
    token,
    signaturePng,
    address,
    birthDate,
    legalFirstName,
    legalLastName,
    preferredName,
    gender,
    email,
    idAttested,
  } = body ?? {};
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
  const { data: member, error: findError } = await supabase
    .from("roster_members")
    .select(
      "id, role, name, player_id, registration_id, removed_at, registrations!roster_members_registration_id_fkey(manager_member_id, tournament_id)"
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

  const isManager = member.registrations?.manager_member_id === member.id;
  const needsPlayerFields = member.role === "player" || isManager;

  const addressTrim =
    typeof address === "string"
      ? address
          .trim()
          .replace(/,?\s*(United States of America|United States|USA|US)\s*$/i, "")
          .replace(/\s+,/g, ",")
          .replace(/,+/g, ",")
          .replace(/[,\s]+$/g, "")
          .trim()
      : "";
  const first = String(legalFirstName ?? "").trim();
  const last = String(legalLastName ?? "").trim();
  // Prefer explicit preferred; default to first name only (not full legal).
  let preferred = String(preferredName ?? "").trim() || null;
  const emailTrim = typeof email === "string" ? email.trim() || null : null;
  const genderTrim =
    gender === "M" || gender === "F" ? gender : null;
  const birth =
    typeof birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      ? birthDate
      : null;

  if (needsPlayerFields) {
    if (!first || !last) {
      return bad("Legal first and last name are required");
    }
    if (!genderTrim) return bad("Gender (M or F) is required");
    if (!birth) return bad("Birth date is required");
    if (!emailTrim) return bad("Contact email is required");
    if (!addressTrim) return bad("Address is required on the waiver");
    if (!idAttested) {
      return bad(
        "You must certify that your information matches official identification"
      );
    }
    if (!preferred) preferred = first;
  }

  const legalName = composeLegalName({
    legalFirstName: first,
    legalLastName: last,
  });
  const displayName = composeDisplayName({
    preferredName: preferred,
    legalFirstName: first,
    legalLastName: last,
    name: member.name,
  });

  const directorDesk = hasValidDirectorSession(await cookies());
  const audit = signAuditFromRequest(
    request,
    directorDesk ? SIGN_VIA.DIRECTOR : SIGN_VIA.SIGN_LINK
  );
  const patch = {
    ...rosterSignPatch({ signaturePng, signedAt: now, audit }),
  };

  if (needsPlayerFields) {
    patch.legal_first_name = first;
    patch.legal_last_name = last;
    patch.preferred_name = preferred;
    patch.name = displayName || member.name;
    patch.gender = genderTrim;
    patch.birth_date = birth;
    patch.address = addressTrim;
    patch.email = emailTrim;
    // phone stays null for players
  } else {
    // Coaches: address optional if they send it
    if (typeof address === "string") patch.address = addressTrim || null;
    if (birth) patch.birth_date = birth;
  }

  // Link / refresh the players directory once we have a safe identity key.
  if (needsPlayerFields && birth && legalName) {
    try {
      const playerId = await resolvePlayer(supabase, {
        name: legalName,
        birthDate: birth,
        legalFirstName: first,
        legalLastName: last,
        preferredName: preferred,
        email: emailTrim,
      });
      if (playerId) {
        patch.player_id = playerId;
        // Keep directory gender in sync with what they certified.
        await supabase
          .from("players")
          .update({
            gender: genderTrim,
            address: addressTrim,
            email: emailTrim,
            full_name: displayName || legalName,
            normalized_name: normalizeName(legalName),
            legal_first_name: first,
            legal_last_name: last,
            preferred_name: preferred,
            birth_date: birth,
          })
          .eq("id", playerId);
      }
    } catch (err) {
      console.error("player resolution on sign failed", err);
    }
  }

  const written = await updateRosterSign(supabase, member.id, patch);
  if (!written.ok) {
    console.error("roster_members sign update failed", written.error);
    return bad("Could not save your signature — please try again", 500);
  }

  // If this signer IS the manager, mirror it onto the registration so the
  // "Manager's Signature" line on the form is filled by the same act. One
  // signature, two places it appears — never two things to sign.
  if (isManager) {
    await supabase
      .from("registrations")
      .update({ manager_signature_png: signaturePng, manager_signed_at: now })
      .eq("id", member.registration_id);
  }

  // Same person, same tournament (other divisions/teams): copy this signature.
  // One waiver per person per event — not one per division.
  try {
    const personFields = {
      playerId: patch.player_id || member.player_id || null,
      birthDate: patch.birth_date || birth || null,
      legalFirstName: patch.legal_first_name || first || null,
      legalLastName: patch.legal_last_name || last || null,
      name: patch.name || member.name || null,
    };
    await recordWaiverSignEvent(supabase, {
      tournamentId: member.registrations?.tournament_id ?? null,
      registrationId: member.registration_id,
      memberId: member.id,
      playerId: personFields.playerId,
      personKey: tournamentPersonKey(personFields),
      signedAt: now,
      signedIp: audit.signed_ip,
      signedPlace: audit.signed_place,
      signedUserAgent: audit.signed_user_agent,
      signedVia: audit.signed_via,
    });
    await propagateTournamentWaiver(supabase, {
      memberId: member.id,
      registrationId: member.registration_id,
      ...personFields,
      signaturePng,
      signedAt: now,
      signedIp: audit.signed_ip,
      signedPlace: audit.signed_place,
      signedUserAgent: audit.signed_user_agent,
      signedVia: audit.signed_via,
    });
  } catch (err) {
    console.error("tournament waiver propagate failed", err);
    // Still regenerate this registration's PDF if propagate failed early.
    try {
      await regenerateAndStoreWaiverPdf(member.registration_id);
    } catch (e2) {
      console.error("PDF regeneration after signing failed", e2);
    }
  }

  return Response.json({ ok: true });
}
