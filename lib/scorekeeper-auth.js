import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

// Staff door — PIN, not password. Two roles, one cookie:
//
//   director     — full Control Center (tournaments, teams, players, umpires roster)
//   scorekeeper  — field tools only (score games, assign umpires to games)
//
// Separate PINs in settings:
//   scorekeeper_pin_hash       — director (control center)
//   scorekeeper_field_pin_hash — scorekeeper (field). If missing, the director
//   PIN still works for field until a field PIN is set (migration path).

const COOKIE_NAME = "afa_sk_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const ROLES = new Set(["director", "scorekeeper"]);

const PIN_KEYS = {
  director: "scorekeeper_pin_hash",
  scorekeeper: "scorekeeper_field_pin_hash",
};

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

async function pinHashFor(key) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data?.value) return null;
  return data.value;
}

/** Director PIN only (legacy name kept for callers). */
export async function verifyPin(pin) {
  return verifyPinForRole(pin, "director");
}

/**
 * Verify PIN for a door.
 * Scorekeeper uses the field hash when set; otherwise falls back to the
 * director hash so existing deploys keep working until a field PIN is set.
 */
export async function verifyPinForRole(pin, role = "director") {
  const r = ROLES.has(role) ? role : "director";
  const primaryKey = PIN_KEYS[r];
  const primary = await pinHashFor(primaryKey);
  if (primary) {
    return bcrypt.compare(String(pin), primary);
  }
  // Field PIN not set yet → director PIN still opens the field door.
  if (r === "scorekeeper") {
    const director = await pinHashFor(PIN_KEYS.director);
    if (!director) return false;
    return bcrypt.compare(String(pin), director);
  }
  return false;
}

/** True when a dedicated field PIN exists (not just director fallback). */
export async function hasFieldPin() {
  return Boolean(await pinHashFor(PIN_KEYS.scorekeeper));
}

export async function requireScorekeeperSession() {
  const store = await cookies();
  return hasValidScorekeeperSession(store);
}

export async function requireDirectorSession() {
  const store = await cookies();
  return hasValidDirectorSession(store);
}

/**
 * Set PIN for a role. `role`: "director" | "scorekeeper"
 */
export async function setPin(newPin, role = "director") {
  const r = ROLES.has(role) ? role : "director";
  const key = PIN_KEYS[r];
  const supabase = getServiceClient();
  const hash = await bcrypt.hash(String(newPin), 10);
  const { error } = await supabase
    .from("settings")
    .upsert({
      key,
      value: hash,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}
