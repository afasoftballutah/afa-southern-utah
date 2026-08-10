import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

// Staff door — PIN, not password. Two roles, one cookie:
//
//   director     — full Control Center (tournaments, teams, players, umpires roster)
//   scorekeeper  — field tools only (score games, assign umpires to games)
//
// Same PIN currently unlocks both; the role is chosen on the PIN screen so
// a field worker never lands in Teams/Players by accident. Optional later:
// a separate field PIN in settings (`scorekeeper_field_pin_hash`).

const COOKIE_NAME = "afa_sk_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const ROLES = new Set(["director", "scorekeeper"]);

function secret() {
  const s = process.env.SCOREKEEPER_SESSION_SECRET;
  if (!s) throw new Error("SCOREKEEPER_SESSION_SECRET is not set");
  return s;
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/**
 * Cookie value: `${expiresMs}|${role}.${hmac}`
 * Legacy: `${expiresMs}.${hmac}` → treated as director.
 */
export function makeSessionCookieValue(role = "director") {
  const r = ROLES.has(role) ? role : "director";
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = `${expires}|${r}`;
  return `${payload}.${sign(payload)}`;
}

/** @returns {{ valid: boolean, role: 'director'|'scorekeeper'|null }} */
export function parseSessionCookieValue(value) {
  if (!value) return { valid: false, role: null };
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return { valid: false, role: null };
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, role: null };
  }

  // Legacy: payload is only a number
  if (/^\d+$/.test(payload)) {
    const valid = Number(payload) > Date.now();
    return { valid, role: valid ? "director" : null };
  }

  const [expStr, role] = payload.split("|");
  const valid = Number(expStr) > Date.now() && ROLES.has(role);
  return { valid, role: valid ? role : null };
}

export function isValidSessionCookieValue(value) {
  return parseSessionCookieValue(value).valid;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export function getSessionRole(cookieStore) {
  const cookie = cookieStore.get(COOKIE_NAME);
  const parsed = parseSessionCookieValue(cookie?.value);
  return parsed.valid ? parsed.role : null;
}

/** Any staff session (director or field scorekeeper). */
export function hasValidScorekeeperSession(cookieStore) {
  return getSessionRole(cookieStore) != null;
}

/** Full director access only. */
export function hasValidDirectorSession(cookieStore) {
  return getSessionRole(cookieStore) === "director";
}

export async function verifyPin(pin) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "scorekeeper_pin_hash")
    .maybeSingle();
  if (error || !data) return false;
  return bcrypt.compare(String(pin), data.value);
}

export async function requireScorekeeperSession() {
  const store = await cookies();
  return hasValidScorekeeperSession(store);
}

export async function requireDirectorSession() {
  const store = await cookies();
  return hasValidDirectorSession(store);
}

export async function setPin(newPin) {
  const supabase = getServiceClient();
  const hash = await bcrypt.hash(String(newPin), 10);
  const { error } = await supabase
    .from("settings")
    .upsert({
      key: "scorekeeper_pin_hash",
      value: hash,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
