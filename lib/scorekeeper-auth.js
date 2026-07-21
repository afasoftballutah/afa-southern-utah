import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

// Scorekeeper door auth — PIN, not password (director's call). One shared
// PIN for the whole league's scorekeepers, changeable from inside the door
// itself once you're in (so JD never has to touch this again). No accounts,
// no per-user login — a stateless HMAC-signed cookie session, boring and
// dependency-light (Node's built-in crypto, no session table/store needed).

const COOKIE_NAME = "afa_sk_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — a tournament day, with margin

function secret() {
  const s = process.env.SCOREKEEPER_SESSION_SECRET;
  if (!s) throw new Error("SCOREKEEPER_SESSION_SECRET is not set");
  return s;
}

function sign(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export function makeSessionCookieValue() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  return `${payload}.${sign(payload)}`;
}

export function isValidSessionCookieValue(value) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  return Number(payload) > Date.now();
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

/** Server-side check — call with the Next.js `cookies()` store. */
export function hasValidScorekeeperSession(cookieStore) {
  const cookie = cookieStore.get(COOKIE_NAME);
  return isValidSessionCookieValue(cookie?.value);
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

/**
 * Convenience for API routes: returns true if the incoming request carries
 * a valid scorekeeper session cookie. Reads cookies() itself so every write
 * route can gate on one line: `if (!(await requireScorekeeperSession())) ...`
 */
export async function requireScorekeeperSession() {
  const store = await cookies();
  return hasValidScorekeeperSession(store);
}

export async function setPin(newPin) {
  const supabase = getServiceClient();
  const hash = await bcrypt.hash(String(newPin), 10);
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "scorekeeper_pin_hash", value: hash, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
