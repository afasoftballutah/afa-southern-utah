import { cookies } from "next/headers";
import Link from "next/link";
import { hasValidScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { isRegistrationOpen, stillToPlayIn, playableIn, GAME_STATE_FIELDS } from "@/lib/tournament-state";
import { genderLabel, venueParts } from "@/lib/director";
import PinPad from "@/components/scorekeeper/PinPad";
import DirectorShell from "@/components/scorekeeper/DirectorShell";
import DirectorTable from "@/components/scorekeeper/DirectorTable";
import NewTournament from "@/components/scorekeeper/NewTournament";
import TournamentEditor from "@/components/scorekeeper/TournamentEditor";
import TournamentSetup from "@/components/scorekeeper/TournamentSetup";
import DivisionWorkbench from "@/components/scorekeeper/DivisionWorkbench";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournaments — Control Center" };

// The tournament setup page. JD, 2026-07-28: "The top part should be 'Add
// tournament' - once it is added, it should be selectable from a list with all
// the divisions etc inside that list. That stays on brand."
//
// So there is one page, not a list and a detail page: add at the top, every
// tournament in the table, and opening one shows its terms, its format and its
// divisions in place — the same accordion the players list uses.
const COLUMNS = [
  { key: "name", label: "Tournament" },
  { key: "date", label: "Starts", width: "7rem" },
  { key: "venue", label: "Where", hideBelow: "sm" },
  { key: "divisions", label: "Divs", align: "right", width: "4.5rem" },
  { key: "teams", label: "Teams", align: "right", width: "5rem" },
  { key: "fee", label: "Fee", align: "right", width: "5rem" },
  { key: "closes", label: "Closes", width: "7rem" },
  { key: "open", label: "Open", type: "check", align: "center", width: "5rem" },
];

const FILTERS = [
  { key: "open", label: "Open for registration", tag: "open" },
  { key: "nofee", label: "No entry fee set", tag: "nofee" },
  { key: "nodeadline", label: "No deadline set", tag: "nodeadline" },
];

async function load() {
  const supabase = getServiceClient();
  const [
    { data: tournaments },
    { data: divisions },
    { data: registrations },
    { data: classes },
    { data: progress },
  ] =
    await Promise.all([
      supabase.from("tournaments").select("*").order("start_date"),
      supabase
        .from("divisions")
        .select(
          "id, tournament_id, name, display_name, sort_order, parent_division_id, gender, class_id, " +
            "min_men, min_women, min_teams, max_teams, " +
            `games(${GAME_STATE_FIELDS}), pool_games(id, status)`
        ),
      supabase
        .from("registrations")
        .select(
          "id, tournament_id, division_id, team_name, class, class_id, status, paid_at, amount_paid_cents, director_notes, roster_token, manage_token, pdf_storage_path, manager_name, manager_email, manager_phone, divisions(name, display_name)"
        ),
      supabase.from("classes").select("id, name, sort_order").order("sort_order"),
      supabase.from("registration_signing_progress").select("*"),
    ]);

  const real = (tournaments ?? []).filter((t) => !t.is_placeholder);
  const venues = [
    ...new Set((tournaments ?? []).map((t) => t.venue_name).filter(Boolean)),
  ].sort();

  // A team a director typed in has no roster, so no progress row. The card
  // reads "0 of 0 signed" from this, which is what is true about it.
  const progressBy = new Map((progress ?? []).map((p) => [p.registration_id, p]));
  const withProgress = (registrations ?? []).map((r) => ({
    ...r,
    progress: progressBy.get(r.id) ?? { active_members: 0, signed_members: 0, is_official: false },
  }));

  return {
    tournaments: real,
    divisions: divisions ?? [],
    registrations: withProgress,
    classes: classes ?? [],
    venues,
  };
}

/** The setup bar's starting state, read out of the divisions that exist. */
function planFrom(divisions, classes) {
  const CLASS_NAMES = new Set(classes.map((c) => c.name));
  const BRACKETS = new Set(["Gold", "Silver", "Bronze"]);
  const LEVELS = new Set(["Upper", "Lower"]);

  return ["mens", "womens", "coed"].map((gender) => {
    const mine = divisions.filter((d) => d.gender === gender);
    const picks = new Set();
    let mode = "divisions";
    for (const d of mine) {
      const tail = (d.display_name ?? d.name).split(" ").pop();
      if (BRACKETS.has(tail)) (mode = "brackets"), picks.add(tail);
      else if (LEVELS.has(tail)) (mode = "levels"), picks.add(tail);
      else if (CLASS_NAMES.has(tail)) picks.add(tail);
    }
    return {
      gender,
      on: mine.length > 0,
      poolPlay: mine.some((d) => mine.some((c) => c.parent_division_id === d.id)),
      poolPlayDone: false,
      mode,
      picks: [...picks],
    };
  });
}

export default async function TournamentsPage() {
  const store = await cookies();
  if (!hasValidScorekeeperSession(store)) {
    return (
      <div className="max-w-sm mx-auto space-y-4">
        <h1 className="t-title">Tournaments</h1>
        <PinPad />
      </div>
    );
  }

  const { tournaments, divisions, registrations, classes, venues } = await load();
  const plain = (v) => JSON.parse(JSON.stringify(v));

  const rows = tournaments.map((t) => {
    const mine = divisions
      .filter((d) => d.tournament_id === t.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const regs = registrations.filter((r) => r.tournament_id === t.id);
    const poolParents = mine.filter((d) => mine.some((c) => c.parent_division_id === d.id)).length;
    const live = regs.filter((r) => r.status !== "withdrawn");
    const open = isRegistrationOpen(t);
    const cap = mine.reduce((n, d) => n + (d.max_teams ?? d.min_teams ?? 6), 0);
    const venue = venueParts(t.venue_name, t.venue_address);

    const tags = [];
    if (open) tags.push("open");
    if (t.entry_fee_cents == null) tags.push("nofee");
    if (!t.registration_closes) tags.push("nodeadline");

    return {
      key: t.id,
      tags,
      search: `${t.name} ${venue.name} ${venue.locality ?? ""} ${t.start_date}`,
      cells: {
        name: t.name,
        date: t.start_date,
        venue: venue.name ? (
          <span>
            {venue.name}
            {venue.locality && <span className="t-meta"> {venue.locality}</span>}
          </span>
        ) : (
          "—"
        ),
        divisions: mine.length,
        teams: cap > 0 ? `${live.length}/${Math.max(cap, live.length)}` : String(live.length),
        fee: t.entry_fee_cents == null ? "—" : `$${t.entry_fee_cents / 100}`,
        closes: t.registration_closes ? String(t.registration_closes).slice(0, 10) : "—",
        open,
      },
      sortValues: {
        name: t.name.toLowerCase(),
        date: t.start_date,
        venue: venue.name,
        divisions: mine.length,
        teams: live.length,
        fee: t.entry_fee_cents ?? -1,
        closes: t.registration_closes ?? "",
      },
      // Everything about a tournament, inside its own row.
      detail: (
        <div className="space-y-4">
          <TournamentEditor tournament={plain(t)} venues={venues} />
          <DivisionWorkbench
            divisions={mine.map((d) => {
              const games = [...(d.games ?? []), ...(d.pool_games ?? [])];
              // A pool-play parent holds no teams of its own — every team in
              // its brackets played it. So it counts them all.
              const children = mine.filter((c) => c.parent_division_id === d.id);
              const inMe = (r) => r.division_id === d.id;
              const inMine = (r) => inMe(r) || children.some((c) => c.id === r.division_id);
              const teams = live.filter(children.length ? inMine : inMe).length;
              // Byes and an if-game the champion made unnecessary are on the
              // sheet but were never going to be played. Counting them left a
              // finished bracket reading "Scores 16/17".
              const playable = playableIn(games);
              return {
                key: d.id,
                id: d.id,
                tournamentId: t.id,
                classId: d.class_id ?? null,
                // JD, 2026-07-28: "top one should be All - Pool Play." Every
                // team is in it, which is what makes it different from the
                // brackets under it. Named by gender when two run pool play,
                // because then "All" would be two different sets of teams.
                label: children.length
                  ? poolParents > 1
                    ? `${genderLabel(d.gender)} — Pool Play`
                    : "All — Pool Play"
                  : (d.display_name ?? d.name),
                sortKey: String(d.sort_order).padStart(4, "0"),
                genderLabel: genderLabel(d.gender),
                className: classes.find((c) => c.id === d.class_id)?.name ?? null,
                teams,
                teamsMax: d.max_teams ?? Math.max(d.min_teams ?? 6, teams),
                minTeams: d.min_teams ?? 6,
                minMen: d.min_men,
                minWomen: d.min_women,
                gamesTotal: playable.length,
                unplayed: playable.length ? stillToPlayIn(games).length : 0,
              };
            })}
            registrations={plain(regs)}
            classes={classes}
            setup={
              <TournamentSetup
                tournamentId={t.id}
                initial={planFrom(mine, classes)}
                existing={mine.map((d) => ({
                  label: d.display_name ?? d.name,
                  hasTeams: live.some((r) => r.division_id === d.id),
                }))}
              />
            }
          />
          <p className="t-meta">
            <Link href={`/tournaments/${t.slug}`} className="underline">
              See the public page
            </Link>
          </p>
        </div>
      ),
    };
  });

  const missingFee = rows.filter((r) => r.tags.includes("nofee")).length;
  const missingDeadline = rows.filter((r) => r.tags.includes("nodeadline")).length;

  return (
    <DirectorShell title="Tournaments" count={`${rows.length} on file`}>
      <NewTournament venues={venues} />
      {(missingFee > 0 || missingDeadline > 0) && (
        <p className="t-meta">
          {missingFee} without an entry fee, {missingDeadline} without a registration deadline.
        </p>
      )}
      <DirectorTable
        columns={COLUMNS}
        rows={rows}
        filters={FILTERS}
        defaultSort={{ key: "date", dir: "asc" }}
        empty="No tournament matches that."
        searchPlaceholder="Tournament or venue…"
      />
    </DirectorShell>
  );
}
