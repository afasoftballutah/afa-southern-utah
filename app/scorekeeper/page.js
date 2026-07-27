import { cookies } from "next/headers";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getDirectorCounts } from "@/lib/director";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen, stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorCard, { CardGrid } from "@/components/scorekeeper/DirectorCard";

export const dynamic = "force-dynamic"; // live tool, reads PII — never cached
export const metadata = { title: "Control Center" };

// Three things, and only three. JD, 2026-07-27: "Tournaments, Teams, Players
// - those are the things the director needs to fool with and drill into."
//
// Scores and registrations used to sit at this level. They do not belong
// here: a score sheet and a registration both belong TO a tournament, so
// they live inside one. That keeps this screen to three decisions.
async function getHeadline() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, start_date, end_date, registration_closes, is_placeholder, divisions(id, games(id, status, is_bye, round), pool_games(id, status))")
    .order("start_date");

  const real = (data ?? []).filter((t) => !t.is_placeholder);
  let toScore = 0;
  let running = 0;
  for (const t of real) {
    let left = 0;
    for (const d of t.divisions ?? []) {
      const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
      if (games.length) left += stillToPlayIn(games).length;
    }
    if (left > 0) running += 1;
    toScore += left;
  }
  return {
    toScore,
    running,
    openForRegistration: real.filter((t) => isRegistrationOpen(t)).length,
  };
}

export default async function ScorekeeperPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad />
      </div>
    );
  }

  const [counts, headline] = await Promise.all([getDirectorCounts(), getHeadline()]);

  return (
    <div className="space-y-4">
      <h1 className="t-title">Control Center</h1>

      <CardGrid>
        <DirectorCard
          href="/scorekeeper/tournaments"
          title="Tournaments"
          subtitle="Dates, fees, divisions, scores and who signed up"
          stats={[
            { label: "on file", value: String(counts.tournaments) },
            { label: "taking teams", value: String(headline.openForRegistration) },
            {
              label: headline.toScore === 1 ? "game to score" : "games to score",
              value: String(headline.toScore),
              alert: headline.toScore > 0,
            },
          ]}
        />
        <DirectorCard
          href="/scorekeeper/teams"
          title="Teams"
          subtitle="Every team, and the tournaments they entered"
          stats={[
            { label: "on file", value: String(counts.teams) },
            {
              label: counts.registrations === 1 ? "registration" : "registrations",
              value: String(counts.registrations),
            },
          ]}
        />
        <DirectorCard
          href="/scorekeeper/players"
          title="Players"
          subtitle="Every player and manager, across every tournament"
          stats={[
            { label: "on file", value: String(counts.players) },
            {
              label: "waiting to sign",
              value: String(counts.outstandingSignatures),
              alert: counts.outstandingSignatures > 0,
            },
          ]}
        />
      </CardGrid>

    </div>
  );
}
