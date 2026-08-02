import { createClient } from "@supabase/supabase-js";

/**
 * True when public Supabase env is present. Local design/shell work can
 * run without a .env.local; pages should return empty data instead of
 * throwing createClient("undefined", …).
 */
export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && url.startsWith("http") && key);
}

/**
 * Public, read-only client. Uses the anon key, which is subject to RLS.
 * Safe to use in Server Components that render public pages (tournaments,
 * divisions, placements) — those tables have "public read" RLS policies.
 * Never use this to touch `registrations` — RLS blocks it anyway (zero
 * policies on that table), but the intent is that it should never even try.
 */
export function getPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !url.startsWith("http") || !key) {
    throw new Error(
      "supabaseUrl is required. Add NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local (see .env.example)."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Service-role client. Bypasses RLS entirely. SERVER ONLY.
 * Only ever import this from a Route Handler (app/api/**) — never from a
 * Client Component, never from anything bundled to the browser. The
 * SUPABASE_SERVICE_ROLE_KEY env var has no NEXT_PUBLIC_ prefix specifically
 * so Next.js refuses to inline it into client bundles.
 */
export function getServiceClient() {
  if (typeof window !== "undefined") {
    throw new Error("getServiceClient() must never run in the browser");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !url.startsWith("http") || !key) {
    throw new Error(
      "Service Supabase env missing. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
