import { getPublicClient } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * Supabase free-tier projects pause after 7 days with no activity. A
 * tournament season has gaps longer than that between events, so this
 * route exists purely to keep the project's activity clock ticking.
 * Triggered daily by the Vercel Cron Job in vercel.json — well inside the
 * 7-day pause window with margin for a missed run.
 */
export async function GET() {
  const supabase = getPublicClient();
  const { error } = await supabase.from("tournaments").select("id").limit(1);
  if (error) {
    console.error("keepalive query failed", error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, checkedAt: new Date().toISOString() });
}
