import { runQuickScoresSync } from "@/lib/sync-quickscores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The hourly pull. Everything it does lives in lib/sync-quickscores.js;
 * this is the scheduled door into it.
 *
 * Auth: the scheduler sends `Authorization: Bearer $CRON_SECRET`. Without
 * that env var the route refuses everyone — an open endpoint that writes
 * scores is not something to leave lying around.
 */
function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const report = await runQuickScoresSync({ dryRun });
  console.log("quickscores sync", JSON.stringify(report));
  return Response.json(report);
}
