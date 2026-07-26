import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { runQuickScoresSync } from "@/lib/sync-quickscores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "How do I run it manually? Where is the button?" (JD, 2026-07-26).
 *
 * The pull runs hourly on its own, but a director standing at a field who
 * has just watched the league post a score does not want to wait up to an
 * hour to see it here. Same run as the schedule, same safeguards, reached
 * with the scorekeeper's own session instead of the cron secret — nobody
 * should have to open GitHub to press a button about a softball game.
 */
export async function POST(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  let dryRun = false;
  try {
    dryRun = Boolean((await request.json())?.dryRun);
  } catch {
    // no body is the normal case: run it for real
  }
  const report = await runQuickScoresSync({ dryRun });
  console.log("quickscores sync (manual)", JSON.stringify(report));
  return Response.json(report);
}
