/**
 * Lawful e-sign audit for tournament waivers.
 *
 * We record the instant (signed_at), the request IP, a coarse city/region
 * from the edge (not GPS), the user-agent, and how they signed. That is the
 * same class of evidence DocuSign-style links keep. We do not ask the
 * browser for location, and we do not store lat/long even if the host sends it.
 */

import { formatLeagueDateTime, formatLeagueSignedAt } from "@/lib/league-time";

export const SIGN_VIA = {
  SIGN_LINK: "sign-link",
  DIRECTOR: "director",
  REGISTER: "register",
};

const AUDIT_COLS = [
  "signed_ip",
  "signed_place",
  "signed_user_agent",
  "signed_via",
];

function headerGet(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function decodeHeader(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw.replace(/\+/g, " ")).trim() || null;
  } catch {
    return raw;
  }
}

/** First hop of an X-Forwarded-For style list. */
export function firstForwardedIp(value) {
  if (value == null) return null;
  const first = String(value).split(",")[0].trim();
  if (!first || first.toLowerCase() === "unknown") return null;
  const bare = first.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1");
  return bare.slice(0, 64) || null;
}

export function clientIpFromHeaders(headers) {
  return (
    firstForwardedIp(headerGet(headers, "x-forwarded-for")) ||
    firstForwardedIp(headerGet(headers, "x-vercel-forwarded-for")) ||
    firstForwardedIp(headerGet(headers, "x-real-ip")) ||
    firstForwardedIp(headerGet(headers, "cf-connecting-ip")) ||
    null
  );
}

/** City, region, country from Vercel (or similar) edge headers. Not GPS. */
export function clientPlaceFromHeaders(headers) {
  const city = decodeHeader(headerGet(headers, "x-vercel-ip-city"));
  const region = decodeHeader(headerGet(headers, "x-vercel-ip-country-region"));
  const country = decodeHeader(headerGet(headers, "x-vercel-ip-country"));
  const parts = [city, region, country].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function compactPlace(place) {
  if (!place) return "";
  return String(place)
    .trim()
    .replace(/, US$/i, "");
}

export function clientUserAgentFromHeaders(headers) {
  const ua = headerGet(headers, "user-agent");
  if (!ua) return null;
  return String(ua).slice(0, 400);
}

export function signAuditFromRequest(request, via = SIGN_VIA.SIGN_LINK) {
  const headers = request?.headers;
  return {
    signed_ip: clientIpFromHeaders(headers),
    signed_place: clientPlaceFromHeaders(headers),
    signed_user_agent: clientUserAgentFromHeaders(headers),
    signed_via: via,
  };
}

export function isMissingAuditSchema(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  const code = String(error.code || "");
  return (
    code === "PGRST204" ||
    code === "42703" ||
    code === "42P01" ||
    /signed_ip|signed_place|signed_user_agent|signed_via|waiver_sign_events/i.test(
      msg
    )
  );
}

/** Patch written onto the roster seat (and copied to other seats). */
export function rosterSignPatch({
  signaturePng,
  signedAt,
  audit = {},
}) {
  return {
    signature_png: signaturePng,
    signed_at: signedAt,
    signed_ip: audit.signed_ip ?? null,
    signed_place: audit.signed_place ?? null,
    signed_user_agent: audit.signed_user_agent ?? null,
    signed_via: audit.signed_via ?? null,
  };
}

export async function updateRosterSign(supabase, memberId, patch) {
  const { error } = await supabase
    .from("roster_members")
    .update(patch)
    .eq("id", memberId);
  if (!error) return { ok: true };
  if (!isMissingAuditSchema(error)) return { ok: false, error };
  const slim = { ...patch };
  for (const col of AUDIT_COLS) delete slim[col];
  const retry = await supabase
    .from("roster_members")
    .update(slim)
    .eq("id", memberId);
  if (retry.error) return { ok: false, error: retry.error };
  return { ok: true, skippedAudit: true };
}

/**
 * Append-only record of the actual sign act. Copies onto other seats do
 * not call this. Missing table is ignored so signing still works.
 */
export async function recordWaiverSignEvent(supabase, event) {
  if (!event?.tournamentId || !event?.registrationId || !event?.memberId) {
    return { ok: false, skipped: true };
  }
  const { error } = await supabase.from("waiver_sign_events").insert({
    tournament_id: event.tournamentId,
    registration_id: event.registrationId,
    roster_member_id: event.memberId,
    player_id: event.playerId ?? null,
    person_key: event.personKey ?? null,
    signed_at: event.signedAt,
    signed_ip: event.signedIp ?? null,
    signed_place: event.signedPlace ?? null,
    signed_user_agent: event.signedUserAgent ?? null,
    signed_via: event.signedVia ?? SIGN_VIA.SIGN_LINK,
  });
  if (!error) return { ok: true };
  if (isMissingAuditSchema(error)) return { ok: false, skipped: true };
  console.error("waiver_sign_events insert failed", error);
  return { ok: false, error };
}

export function signViaLabel(via) {
  if (via === SIGN_VIA.DIRECTOR) return "director desk";
  if (via === SIGN_VIA.REGISTER) return "team registration";
  if (via === SIGN_VIA.SIGN_LINK) return "signing link";
  return via || null;
}

/** Compact director/manager line: "Aug 10, 7:14p · St. George, UT". */
export function formatSignRecord({ signedAt, signedPlace } = {}) {
  const when = formatLeagueSignedAt(signedAt);
  const place = compactPlace(signedPlace);
  return [when, place].filter(Boolean).join(" · ");
}

/** Full tooltip: time, place, via, IP. */
export function formatSignAuditTitle({
  signedAt,
  signedPlace,
  signedVia,
  signedIp,
} = {}) {
  const when = formatLeagueDateTime(signedAt);
  const place = compactPlace(signedPlace);
  const via = signViaLabel(signedVia);
  const parts = [];
  if (when) parts.push(`Signed ${when}`);
  else parts.push("Signed");
  if (place) parts.push(place);
  if (via) parts.push(`via ${via}`);
  if (signedIp) parts.push(signedIp);
  return parts.join(" · ");
}
