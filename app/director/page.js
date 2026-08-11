import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  getSessionRole,
  hasValidScorekeeperSession,
} from "@/lib/scorekeeper-auth";
import { getDirectorCounts } from "@/lib/director";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen, stillToPlayIn } from "@/lib/tournament-state";
import PinPad from "@/components/scorekeeper/PinPad";
import ChangePins from "@/components/scorekeeper/ChangePins";
import DirectorCard, { CardGrid } from "@/components/scorekeeper/DirectorCard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Director — Control Center" };

// /director — full control center.
// Scorekeeper field tools live at /scorekeeper.

async function getHeadline() {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("tournaments")
    .select(
      "id, name, start_date, end_date, registration_closes, is_placeholder, divisions(id, games(id, status, is_bye, round), pool_games(id, status))"
    )
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

async function getUmpireCount() {
  try {
    const supabase = getServiceClient();
    const { count } = await supabase
      .from("umpires")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");
    return count ?? 0;
  } catch {
    return 0;
  }
}

export default async function DirectorPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="py-8">
        <PinPad room="director" />
      </div>
    );
  }

  const role = getSessionRole(store);
  // Field staff land in the scorekeeper room, not full director tools
  if (role === "scorekeeper") {
    redirect("/scorekeeper");
  }

  const [counts, headline, umpCount] = await Promise.all([
    getDirectorCounts(),
    getHeadline(),
    getUmpireCount(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="t-label text-afa-navy/60">Director</p>
          <h1 className="t-title">Control Center</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChangePins />
          <Link href="/scorekeeper" className="btn-transient text-sm">
            Open Scorekeeper room →
          </Link>
        </div>
      </div>

      <CardGrid>
        <DirectorCard
          href="/director/tournaments"
          title="Tournaments"
          subtitle="Dates, fees, divisions, scores and who signed up"
          stats={[
            { label: "on file", value: String(counts.tournaments) },
            {
              label: "taking teams",
              value: String(headline.openForRegistration),
            },
            {
              label:
                headline.toScore === 1 ? "game to score" : "games to score",
              value: String(headline.toScore),
              alert: headline.toScore > 0,
            },
          ]}
        />
        <DirectorCard
          href="/director/teams"
          title="Teams"
          subtitle="Every team, and the tournaments they entered"
          stats={[
            { label: "on file", value: String(counts.teams) },
            {
              label:
                counts.registrations === 1
                  ? "registration"
                  : "registrations",
              value: String(counts.registrations),
            },
          ]}
        />
        <DirectorCard
          href="/director/players"
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
        <DirectorCard
          href="/director/umpires"
          title="Umpires"
          subtitle="Roster, cards, pitch type — assign on games from division tools"
          stats={[
            { label: "active", value: String(umpCount) },
          ]}
        />
        <DirectorCard
          href="/director/news"
          title="News"
          subtitle="Homepage posts players and managers see under News"
          stats={[
            { label: "desk", value: "→" },
          ]}
        />
      </CardGrid>
    </div>
  );
}
