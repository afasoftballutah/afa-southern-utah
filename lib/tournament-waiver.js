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

/** Normalized names a seat might be known by (legal, preferred+last, roster). */
export function personNameKeys(m = {}) {
  const first = String(m.legal_first_name ?? m.legalFirstName ?? "").trim();
  const last = String(m.legal_last_name ?? m.legalLastName ?? "").trim();
  const preferred = String(m.preferred_name ?? m.preferredName ?? "").trim();
  const name = String(m.name ?? "").trim();
  const keys = new Set();
  if (first && last) keys.add(normalizeName(`${first} ${last}`));
  if (preferred && last) keys.add(normalizeName(`${preferred} ${last}`));
  if (name) keys.add(normalizeName(name));
  return keys;
}

/**
 * Same person in one tournament? Directory id or legal+DOB win.
 * A signed seat also covers a name-only stub (manager entered JD Willcox
 * on Men's and Coed; they only fill identity on the first sign).
 * Different player ids or different legal+DOB never match.
 */
export function membersMatch(a, b) {
  if (!a || !b) return false;
  const ida = a.player_id ?? a.playerId ?? null;
  const idb = b.player_id ?? b.playerId ?? null;
  if (ida && idb) return String(ida) === String(idb);

  const ka = tournamentPersonKey(a);
  const kb = tournamentPersonKey(b);
  if (ka && kb) return ka === kb;

  const namesA = personNameKeys(a);
  const namesB = personNameKeys(b);
  if (!namesA.size || !namesB.size) return false;
  for (const n of namesA) {
    if (namesB.has(n)) return true;
  }
  return false;
}

/** Fill identity on a stub seat from the seat they actually signed. */
export function identityOntoSeat(seat, source) {
  const srcId = source.player_id ?? source.playerId ?? null;
  const srcBirth = source.birth_date ?? source.birthDate ?? null;
  const srcFirst = source.legal_first_name ?? source.legalFirstName ?? null;
  const srcLast = source.legal_last_name ?? source.legalLastName ?? null;
  const srcPref = source.preferred_name ?? source.preferredName ?? null;
  const srcAddr = source.address ?? null;
  const srcEmail = source.email ?? null;
  const srcGender = source.gender ?? null;
  const patch = {};
  if (srcId && !seat.player_id) patch.player_id = srcId;
  if (srcBirth && !seat.birth_date) patch.birth_date = srcBirth;
  if (srcFirst && !seat.legal_first_name) patch.legal_first_name = srcFirst;
  if (srcLast && !seat.legal_last_name) patch.legal_last_name = srcLast;
  if (srcPref && !seat.preferred_name) patch.preferred_name = srcPref;
  if (srcAddr && !seat.address) patch.address = srcAddr;
  if (srcEmail && !seat.email) patch.email = srcEmail;
  if (srcGender && !seat.gender) patch.gender = srcGender;
  return patch;
}

/**
 * Find an existing signature for this person in this tournament
 * (any active roster seat that already has signed_at).
 */
export async function findTournamentWaiver(supabase, {
  tournamentId,
  personKey = null,
  member = null,
  exceptMemberId = null,
}) {
  if (!tournamentId || (!personKey && !member)) return null;

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
      "id, player_id, birth_date, legal_first_name, legal_last_name, preferred_name, name, gender, address, email, signed_at, signature_png, signed_ip, signed_place, signed_user_agent, signed_via, registration_id, removed_at"
    )
    .in("registration_id", regIds)
    .is("removed_at", null)
    .not("signed_at", "is", null);
  if (withAudit.error && isMissingAuditSchema(withAudit.error)) {
    const legacy = await supabase
      .from("roster_members")
      .select(
        "id, player_id, birth_date, legal_first_name, legal_last_name, preferred_name, name, gender, address, email, signed_at, signature_png, registration_id, removed_at"
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
    const byKey = personKey && key && key === personKey;
    const byPerson = member ? membersMatch(m, member) : false;
    if (byKey || byPerson) {
      return {
        signaturePng: m.signature_png,
        signedAt: m.signed_at,
        signedIp: m.signed_ip ?? null,
        signedPlace: m.signed_place ?? null,
        signedUserAgent: m.signed_user_agent ?? null,
        signedVia: m.signed_via ?? null,
        sourceMemberId: m.id,
        playerId: m.player_id ?? null,
        birthDate: m.birth_date ?? null,
        legalFirstName: m.legal_first_name ?? null,
        legalLastName: m.legal_last_name ?? null,
        preferredName: m.preferred_name ?? null,
        address: m.address ?? null,
        email: m.email ?? null,
        gender: m.gender ?? null,
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
    preferredName = null,
    name = null,
    address = null,
    email = null,
    gender = null,
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

  const signer = {
    playerId,
    player_id: playerId,
    birthDate,
    birth_date: birthDate,
    legalFirstName,
    legal_first_name: legalFirstName,
    legalLastName,
    legal_last_name: legalLastName,
    preferredName,
    preferred_name: preferredName,
    name,
    address,
    email,
    gender,
  };

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
      "id, player_id, birth_date, legal_first_name, legal_last_name, preferred_name, name, gender, address, email, signed_at, registration_id, removed_at"
    )
    .in("registration_id", regIds)
    .is("removed_at", null);

  const targets = (members ?? []).filter((m) => {
    if (m.id === memberId) return false;
    return membersMatch(signer, m);
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
      ...identityOntoSeat(m, signer),
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
  const probe = {
    playerId,
    player_id: playerId,
    birthDate,
    birth_date: birthDate,
    legalFirstName,
    legal_first_name: legalFirstName,
    legalLastName,
    legal_last_name: legalLastName,
    name,
  };
  const existing = await findTournamentWaiver(supabase, {
    tournamentId,
    personKey: tournamentPersonKey(probe),
    member: probe,
    exceptMemberId: memberId,
  });
  if (!existing) return false;

  const { data: reg } = await supabase
    .from("registrations")
    .select("manager_member_id")
    .eq("id", registrationId)
    .maybeSingle();

  await updateRosterSign(supabase, memberId, {
    ...rosterSignPatch({
      signaturePng: existing.signaturePng,
      signedAt: existing.signedAt,
      audit: {
        signed_ip: existing.signedIp,
        signed_place: existing.signedPlace,
        signed_user_agent: existing.signedUserAgent,
        signed_via: existing.signedVia,
      },
    }),
    ...identityOntoSeat(
      { player_id: playerId, birth_date: birthDate, legal_first_name: legalFirstName, legal_last_name: legalLastName },
      existing
    ),
  });

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
function coverageKeys(m) {
  const keys = [];
  const hard = tournamentPersonKey(m);
  if (hard) keys.push(hard);
  for (const n of personNameKeys(m)) keys.push(`name:${n}`);
  return keys;
}

export function buildTournamentSignedSet(members, regBy) {
  const set = new Set();
  for (const m of members ?? []) {
    if (m.removed_at || !m.signed_at) continue;
    const tourId = regBy.get(m.registration_id)?.tournament_id;
    if (!tourId) continue;
    for (const key of coverageKeys(m)) set.add(`${tourId}|${key}`);
  }
  return set;
}

/** Whether this seat is covered by a tournament-level signature. */
export function isSignedForTournament(member, regBy, signedSet) {
  if (member.signed_at || member.signed) return true;
  const tourId = regBy.get(member.registration_id)?.tournament_id
    ?? member.tournamentId
    ?? null;
  if (!tourId || !signedSet) return false;
  return coverageKeys(member).some((key) => signedSet.has(`${tourId}|${key}`));
}

/**
 * Stamp any unsigned seat that is the same person as a signed seat
 * in this tournament. Idempotent. Used after a sign and when a roster
 * is opened so Men's / Coed do not ask for a second signature.
 */
export async function healTournamentWaivers(supabase, tournamentId) {
  if (!tournamentId) return { covered: 0, registrationIds: [] };

  const { data: regs } = await supabase
    .from("registrations")
    .select("id, manager_member_id")
    .eq("tournament_id", tournamentId);
  if (!regs?.length) return { covered: 0, registrationIds: [] };

  const regIds = regs.map((r) => r.id);
  const managerByReg = new Map(regs.map((r) => [r.id, r.manager_member_id]));

  const { data: members } = await supabase
    .from("roster_members")
    .select(
      "id, player_id, birth_date, legal_first_name, legal_last_name, preferred_name, name, gender, address, email, signed_at, signature_png, signed_ip, signed_place, signed_user_agent, signed_via, registration_id, removed_at"
    )
    .in("registration_id", regIds)
    .is("removed_at", null);

  const active = members ?? [];
  const signed = active.filter((m) => m.signed_at && m.signature_png);
  const unsigned = active.filter((m) => !m.signed_at);
  if (!signed.length || !unsigned.length) {
    return { covered: 0, registrationIds: [] };
  }

  const affected = new Set();
  let covered = 0;

  for (const seat of unsigned) {
    const source = signed.find((s) => membersMatch(s, seat));
    if (!source) continue;
    const { ok } = await updateRosterSign(supabase, seat.id, {
      ...rosterSignPatch({
        signaturePng: source.signature_png,
        signedAt: source.signed_at,
        audit: {
          signed_ip: source.signed_ip,
          signed_place: source.signed_place,
          signed_user_agent: source.signed_user_agent,
          signed_via: source.signed_via,
        },
      }),
      ...identityOntoSeat(seat, source),
    });
    if (!ok) continue;
    covered += 1;
    affected.add(seat.registration_id);
    if (managerByReg.get(seat.registration_id) === seat.id) {
      await supabase
        .from("registrations")
        .update({
          manager_signature_png: source.signature_png,
          manager_signed_at: source.signed_at,
        })
        .eq("id", seat.registration_id);
    }
  }

  for (const rid of affected) {
    try {
      await regenerateAndStoreWaiverPdf(rid);
    } catch (err) {
      console.error("PDF regen after tournament waiver heal failed", rid, err);
    }
  }

  return { covered, registrationIds: [...affected] };
}
