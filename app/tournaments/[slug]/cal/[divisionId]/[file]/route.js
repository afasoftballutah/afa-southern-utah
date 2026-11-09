import { teamFeedResponse } from "@/lib/team-feed-ics";
import { teamFromFeedFile } from "@/lib/team-feed";

// The same team feed as games.ics?team=…&division=…, at a plain path with
// no query string: /tournaments/<slug>/cal/<division id>/<team>.ics.
// This is what the Subscribe button links to (lib/team-feed.js
// teamFeedHref). games.ics stays for links people already subscribed to.
export const revalidate = 300;

export async function GET(request, { params }) {
  const { slug, divisionId } = await params;
  // Read the team from the raw path, not params, so the decoding is ours
  // and the same on every host: one decodeURIComponent of the last segment.
  const last = new URL(request.url).pathname.split("/").pop();
  const team = teamFromFeedFile(last);
  if (!team) return new Response("Not found", { status: 404 });
  return teamFeedResponse(request, { slug, team, divisionId });
}
