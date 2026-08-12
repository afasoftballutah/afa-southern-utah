/**
 * One AFA waiver per person per tournament — not per division or team.
 *
 * Signing any roster seat covers every active seat for that person in the
 * same tournament. We store the signature on each covered row so existing
 * PDF/list code keeps working, and we re-use it when they join another
 * division later in the same event.
 */

import { normalizeName } from "@/lib/identity";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import {
  isMissingAuditSchema,
  rosterSignPatch,
  updateRosterSign,
} from "@/lib/sign-audit";

/**
 * Stable person key for matching seats across divisions.
 * Prefer directory id; else legal name + birth date.
 * @returns {string|null}
 */
export function tournamentPersonKey({
  player_id,
  playerId,
  birth_date,
  birthDate,
  legal_first_name,
  legalFirstName,
  legal_last_name,
  legalLastName,
  name,
} = {}) {
  const pid = player_id ?? playerId ?? null;
  if (pid) return `p:${pid}`;
  const first = String(legal_first_name ?? legalFirstName ?? "").trim();
  const last = String(legal_last_name ?? legalLastName ?? "").trim();
  const legal = [first, last].filter(Boolean).join(" ") || String(name ?? "").trim();
  const birth = String(birth_date ?? birthDate ?? "").slice(0, 10);
  const n = normalizeName(legal);
  if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  return `n:${n}|${birth}`;
}

/**
 * Find an existing signature for this person in this tournament
 * (any active roster seat that already has signed_at).
 */
export async function findTournamentWaiver(supabase, {
  tournamentId,
  personKey,
  exceptMemberId = null,
}) {
  if (!tournamentId || !personKey) return null;

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, manager_member_id")
    .eq("tournament_id", tournamentId);
  if (!regs?.length) return null;

  const regIds = regs.map((r) => r.id);
  let members = [];
  const withAudit = await supabase
    .from("roster_members")
    .select(
      "id, player_id, birth_date, legal_first_name, legal_last_name, name, signed_at, signature_png, signed_ip, signed_place, signed_user_agent, signed_via, registration_id, removed_at"
    )
    .in("registration_id", regIds)
    .is("removed_at", null)
    .not("signed_at", "is", null);
  if (withAudit.error && isMissingAuditSchema(withAudit.error)) {
    const legacy = await supabase
      .from("roster_members")
      .select(
        "id, player_id, birth_date, legal_first_name, legal_last_name, name, signed_at, signature_png, registration_id, removed_at"
      )
      .in("registration_id", regIds)
      .is("removed_at", null)
      .not("signed_at", "is", null);
    members = legacy.data ?? [];
  } else {
    members = withAudit.data ?? [];
  }

  for (const m of members ?? []) {
    if (exceptMemberId && m.id === exceptMemberId) continue;
    if (!m.signature_png || !m.signed_at) continue;
    const key = tournamentPersonKey(m);
    if (key && key === personKey) {
      return {
        signaturePng: m.signature_png,
        signedAt: m.signed_at,
        signedIp: m.signed_ip ?? null,
        signedPlace: m.signed_place ?? null,
        signedUserAgent: m.signed_user_agent ?? null,
        signedVia: m.signed_via ?? null,
        sourceMemberId: m.id,
      };
    }
  }
  return null;
}

/**
 * After a person signs one seat: copy signature onto every other active seat
 * for the same person in the same tournament, and rebuild those PDFs.
 */
export async function propagateTournamentWaiver(
  supabase,
  {
    memberId,
    registrationId,
    playerId = null,
    birthDate = null,
    legalFirstName = null,
    legalLastName = null,
    name = null,
    signaturePng,
    signedAt,
    signedIp = null,
    signedPlace = null,
    signedUserAgent = null,
    signedVia = null,
  }
) {
  if (!signaturePng || !signedAt || !registrationId) {
    return { covered: 0, registrationIds: [] };
  }

  const { data: reg } = await supabase
    .from("registrations")
    .select("id, tournament_id, manager_member_id")
    .eq("id", registrationId)
    .maybeSingle();
  if (!reg?.tournament_id) {
    try {
      await regenerateAndStoreWaiverPdf(registrationId);
    } catch (err) {
      console.error("PDF regen after sign failed", err);
    }
    return { covered: 0, registrationIds: [registrationId] };
  }

  const personKey = tournamentPersonKey({
    playerId,
    birthDate,
    legalFirstName,
    legalLastName,
    name,
  });
  if (!personKey) {
    // Coaches without birth date still signed this seat only.
    try {
      await regenerateAndStoreWaiverPdf(registrationId);
    } catch (err) {
      console.error("PDF regen after sign failed", err);
    }
    return { covered: 0, registrationIds: [registrationId] };
  }

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, manager_member_id")
    .eq("tournament_id", reg.tournament_id);
  const regIds = (regs ?? []).map((r) => r.id);
  const managerByReg = new Map(
    (regs ?? []).map((r) => [r.id, r.manager_member_id])
  );

  const { data: members } = await supabase
    .from("roster_members")
    .select(
      "id, player_id, birth_date, legal_first_name, legal_last_name, name, signed_at, registration_id, removed_at"
    )
    .in("registration_id", regIds)
    .is("removed_at", null);

  const targets = (members ?? []).filter((m) => {
    if (m.id === memberId) return false;
    const key = tournamentPersonKey(m);
    return key && key === personKey;
  });

  const affectedRegs = new Set([registrationId]);

  const copyPatch = rosterSignPatch({
    signaturePng,
    signedAt,
    audit: {
      signed_ip: signedIp,
      signed_place: signedPlace,
      signed_user_agent: signedUserAgent,
      signed_via: signedVia,
    },
  });

  for (const m of targets) {
    const { ok } = await updateRosterSign(supabase, m.id, {
      ...copyPatch,
      ...(playerId && !m.player_id ? { player_id: playerId } : {}),
    });
    if (!ok) {
      console.error("tournament waiver propagate failed", m.id);
      continue;
    }
    affectedRegs.add(m.registration_id);
    if (managerByReg.get(m.registration_id) === m.id) {
      await supabase
        .from("registrations")
        .update({
          manager_signature_png: signaturePng,
          manager_signed_at: signedAt,
        })
        .eq("id", m.registration_id);
    }
  }

  for (const rid of affectedRegs) {
    try {
      await regenerateAndStoreWaiverPdf(rid);
    } catch (err) {
      console.error("PDF regen after tournament waiver propagate failed", rid, err);
    }
  }

  return { covered: targets.length, registrationIds: [...affectedRegs] };
}

/**
 * When someone is added to a roster, if they already signed for this
 * tournament on another team/division, copy that signature onto the new seat.
 */
export async function applyExistingTournamentWaiver(
  supabase,
  {
    memberId,
    registrationId,
    tournamentId,
    playerId = null,
    birthDate = null,
    legalFirstName = null,
    legalLastName = null,
    name = null,
  }
) {
  if (!memberId || !tournamentId) return false;
  const personKey = tournamentPersonKey({
    playerId,
    birthDate,
    legalFirstName,
    legalLastName,
    name,
  });
  if (!personKey) return false;

  const existing = await findTournamentWaiver(supabase, {
    tournamentId,
    personKey,
    exceptMemberId: memberId,
  });
  if (!existing) return false;

  const { data: reg } = await supabase
    .from("registrations")
    .select("manager_member_id")
    .eq("id", registrationId)
    .maybeSingle();

  await updateRosterSign(
    supabase,
    memberId,
    rosterSignPatch({
      signaturePng: existing.signaturePng,
      signedAt: existing.signedAt,
      audit: {
        signed_ip: existing.signedIp,
        signed_place: existing.signedPlace,
        signed_user_agent: existing.signedUserAgent,
        signed_via: existing.signedVia,
      },
    })
  );

  if (reg?.manager_member_id === memberId) {
    await supabase
      .from("registrations")
      .update({
        manager_signature_png: existing.signaturePng,
        manager_signed_at: existing.signedAt,
      })
      .eq("id", registrationId);
  }

  try {
    await regenerateAndStoreWaiverPdf(registrationId);
  } catch (err) {
    console.error("PDF regen after apply existing tournament waiver failed", err);
  }
  return true;
}

/**
 * Build Set of `${tournamentId}|${personKey}` for members who have signed.
 * Used to mark other seats effectively signed without a DB write.
 */
export function buildTournamentSignedSet(members, regBy) {
  const set = new Set();
  for (const m of members ?? []) {
    if (m.removed_at || !m.signed_at) continue;
    const tourId = regBy.get(m.registration_id)?.tournament_id;
    const key = tournamentPersonKey(m);
    if (tourId && key) set.add(`${tourId}|${key}`);
  }
  return set;
}

/** Whether this seat is covered by a tournament-level signature. */
export function isSignedForTournament(member, regBy, signedSet) {
  if (member.signed_at || member.signed) return true;
  const tourId = regBy.get(member.registration_id)?.tournament_id
    ?? member.tournamentId
    ?? null;
  const key = tournamentPersonKey(member);
  if (!tourId || !key || !signedSet) return false;
  return signedSet.has(`${tourId}|${key}`);
}
