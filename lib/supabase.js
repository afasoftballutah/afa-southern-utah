import { createClient } from "@supabase/supabase-js";

/**
 * Public, read-only client. Uses the anon key, which is subject to RLS.
 * Safe to use in Server Components that render public pages (tournaments,
 * divisions, placements) — those tables have "public read" RLS policies.
 * Never use this to touch `registrations` — RLS blocks it anyway (zero
 * policies on that table), but the intent is that it should never even try.
 */
export function getPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}
