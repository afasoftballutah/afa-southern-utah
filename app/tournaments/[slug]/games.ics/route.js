import { teamFeedResponse } from "@/lib/team-feed-ics";

// A SUBSCRIBABLE game-by-game feed (JD, 2026-07-25: "quickscores has a
// subscribe link"). QuickScores' own copy makes the case better than we
// could: "Subscribing is always preferred to downloading, because the
// games will be updated on your phone if the schedule changes."
//
// That is the whole point here. A field change at 10pm, a bracket game
// whose opponent only exists once pool play is applied, a rain delay —
// all of it lands in a subscriber's calendar without anyone re-sending
// anything. calendar.ics next door is a different thing and stays: it is
// the one all-day "this tournament is happening" event you add once.
//
// ?team=<name>&division=<id> narrows it to one team's games, which is what
// a player actually wants. The division keeps a name shared by two teams
// (Worlds: Fallen in Men's D and Men's E) to the one that was picked — see
// lib/team-feed.js. An old link with only ?team= still works as before. A bracket game the team has not reached yet simply is
// not in the feed, and appears the moment the bracket names them —
// again, only because this is a subscription and not a download.
export const revalidate = 300;

export async function GET(request, { params }) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  return teamFeedResponse(request, {
    slug,
    team: searchParams.get("team"),
    divisionId: searchParams.get("division"),
  });
}
