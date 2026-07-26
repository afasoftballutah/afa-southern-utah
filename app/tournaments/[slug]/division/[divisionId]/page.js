import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getDivisionById,
  getPoolGames,
  getBracketSeedSlots,
  getTeamStatus,
  getGamesForDivisions,
} from "@/lib/data";
import BracketTree from "@/components/bracket/BracketTree";
import DrawnBracket from "@/components/bracket/DrawnBracket";
import Card from "@/components/ui/Card";
import DivisionView from "@/components/DivisionView";
import { formatFieldTime, LEAGUE_TZ } from "@/lib/bracket/tree";
import { poolFinishOrder, resolveSeeds, parseSeedRef } from "@/lib/bracket/seed";
import { mootIfRounds } from "@/lib/bracket/if-game";

export const revalidate = 30;

// Bracket slots hold PROVENANCE placeholders, not real team names, until
// pool play fills them in — "Winner of Game 5" or a seed reference like
// "[A #1]" (the live data brackets the seed; the letter+number form
// without brackets is included too, belt and suspenders). Neither belongs
// in the team picker (dispatch-brief-14).
const SEED_PLACEHOLDER = /^\[?[A-I] #\d+\]?$/;
const PROVENANCE_PREFIX = /^(Winner|Loser) of Game/;

function isRealTeamName(name) {
  if (!name) return false;
  if (SEED_PLACEHOLDER.test(name)) return false;
  if (PROVENANCE_PREFIX.test(name)) return false;
  return true;
}

// Pool letters are DERIVED from the games, never hardcoded (2026-07-24).
// A hardcoded A–F list silently hid pools G/H/I when the league reorganized
// from 6 pools to 9 on the morning of a tournament — invisible publicly and
// unscoreable in the director's door. Whatever pools exist in the data are
// the pools that render, sorted naturally.
function poolLetters(byPool) {
  return Object.keys(byPool).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
}

// "Fri 9 PM" — the column the team card lines its games up in. Formatted
// on the server because the league's time zone lives here; a client
// component would render it in the reader's, and a team in California
// does not want their Utah game an hour early.
function whenShort(scheduledTime) {
  if (!scheduledTime) return { day: "", time: "" };
  const d = new Date(scheduledTime);
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LEAGUE_TZ,
  }).formatToParts(d);
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return {
    day: get("weekday"),
    time: `${get("hour")}${min !== "00" ? ":" + min : ""} ${get("dayPeriod")}`,
  };
}

// "Fri 9p" — weekday plus hour, the sample sheet's convention. Minutes
// only appear when a game is not on the hour, which at this league is
// never, so the column stays two short lines.
function shortTime(scheduledTime) {
  if (!scheduledTime) return "TBD";
  const d = new Date(scheduledTime);
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LEAGUE_TZ,
  }).formatToParts(d);
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return `${get("weekday")} ${get("hour")}${min !== "00" ? ":" + min : ""}${
    get("dayPeriod").toLowerCase().startsWith("a") ? "a" : "p"
  }`;
}

// "Field 3" -> "F3" — same helper as the scorekeeper's compact row.
function fieldAbbrev(field) {
  if (!field) return "";
  const m = field.match(/\d+/);
  return m ? `F${m[0]}` : field;
}

// One game, one row per team, that team's score on its own row — the same
// unit the scorekeeper scores into (components/scorekeeper/SeedBrackets.js).
// Two names either side of a shared "12-10" made you work out which score
// belonged to whom, and it truncated both names to do it. Here the name has
// the whole row and wraps if it needs to; nothing is ever cut off.
function PoolGameRow({ game }) {
  const isFinal = game.status === "final";
  const isTie = isFinal && game.team1_score === game.team2_score;
  const won1 = isFinal && !isTie && game.team1_score > game.team2_score;
  const won2 = isFinal && !isTie && game.team2_score > game.team1_score;

  const side = (name, score, won) => (
    <div className="grid grid-cols-[minmax(0,1fr)_56px] items-center gap-2 py-[5px] pl-2.5 pr-1.5">
      <span
        className={`text-sm leading-tight [overflow-wrap:anywhere] ${
          won ? "font-semibold text-afa-ink" : "text-afa-ink/[0.58]"
        }`}
      >
        {name}
      </span>
      <span
        className={`flex h-[34px] items-center justify-center rounded-[7px] bg-afa-navy/[0.035] text-[15px] font-semibold tabular-nums ${
          won ? "text-afa-ink" : "text-afa-ink/[0.55]"
        }`}
      >
        {/* No 0-0 lies: an unplayed game shows a dash, not a score. */}
        {isFinal ? score : "\u2013"}
      </span>
    </div>
  );

  return (
    <div data-pool-game={game.id} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-2 py-1">
      <div className="text-[10px] font-medium leading-tight text-afa-muted">
        <b className="font-bold text-afa-ink/50">{fieldAbbrev(game.field)}</b>
        <br />
        {shortTime(game.scheduled_time)}
      </div>
      <div className="overflow-hidden rounded-[10px] border border-afa-navy/15 divide-y divide-afa-navy/[0.07] bg-white">
        {side(game.team1_name, game.team1_score, won1)}
        {side(game.team2_name, game.team2_score, won2)}
      </div>
    </div>
  );
}

// Pool play (dispatch-brief-7) — a separate, self-contained stage from the
// bracket engine (untouched). Standings and the game list both DERIVE from
// the pool_games rows; there's no separate standings table stored. Ties
// are broken by the director at seeding, not computed here — the shared
// poolFinishOrder (lib/bracket/seed.js) marks a genuine tie and leaves it
// tied, it never resolves one.
//
// One card per pool holds BOTH the standings and the games that produced
// them, in the same grammar as the scorekeeper's screen. Two cards stacked
// per pool read as two unrelated things, and PCT restates W-L in a
// two-game pool while stealing the width the names needed.
function PoolPlaySection({ poolGames }) {
  if (!poolGames || poolGames.length === 0) return null;

  const byPool = {};
  for (const g of poolGames) (byPool[g.pool] ??= []).push(g);
  // Chronological. The rows came back newest-first, so Pool A read 11p,
  // 10p, 9p — the reverse of the order the games were played in.
  for (const list of Object.values(byPool))
    list.sort((a, b) => String(a.scheduled_time ?? "").localeCompare(String(b.scheduled_time ?? "")));

  return (
    <div className="space-y-3">
      <h2 className="t-heading">Pool Play</h2>
      {/* Cards find their own width at a 372px minimum rather than being
          forced three across — three-up left the name column ~73px, which
          is what was cutting "Band of Randoms" to "Band of R...". */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(372px,1fr))] gap-4 items-start">
        {poolLetters(byPool).map((letter) => {
          const games = byPool[letter];
          const { standings } = poolFinishOrder(games);
          const left = games.filter((g) => g.status !== "final").length;
          return (
            <Card key={letter} className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 pb-2">
                <h3 className="t-label">
                  Pool {letter}
                </h3>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-afa-muted">
                  {left === 0 ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#46a06a]" />
                      Final
                    </>
                  ) : (
                    `${left} game${left === 1 ? "" : "s"} left`
                  )}
                </span>
              </div>

              {/* Units are named once at the top of the pool, which is what
                  lets a team's line stay a single line. */}
              <div className="grid grid-cols-[17px_minmax(0,1fr)_34px_26px] items-center gap-x-2 border-b border-afa-navy/10 pb-1.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-muted">
                <span />
                <span>Team</span>
                <span className="text-right">W&ndash;L</span>
                <span className="text-right">RA</span>
              </div>

              <div>
                {standings.map((t, i) => (
                  <div
                    key={t.team}
                    className="grid min-h-11 grid-cols-[17px_minmax(0,1fr)_34px_26px] items-center gap-x-2 border-b border-afa-navy/[0.07] py-1.5 last:border-0"
                  >
                    <span className="text-right text-[12.5px] font-bold text-afa-navy/50 tabular-nums">
                      {left === 0 ? i + 1 : "\u00b7"}
                    </span>
                    <span className="text-[15px] font-semibold leading-tight [overflow-wrap:anywhere]">
                      {t.team}
                      {t.tied && (
                        <span className="ml-1.5 rounded bg-afa-navy/[0.08] px-1 py-px text-[10px] font-bold uppercase tracking-wide text-afa-muted">
                          tied
                        </span>
                      )}
                    </span>
                    <span className="text-right text-[13.5px] font-semibold text-afa-ink/[0.78] tabular-nums">
                      {t.w}&ndash;{t.l}
                    </span>
                    <span className="text-right text-[13px] text-afa-muted tabular-nums">{t.ra}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="pt-3.5 pb-1.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-muted">
                  Games
                </p>
                <div className="space-y-1">
                  {games.map((g) => (
                    <PoolGameRow key={g.id} game={g} />
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What to call this event on one line (JD, 2026-07-26: "since there are no
 * divisions, it's just Heat Stroker Coed... if there were divisions and it
 * was mens, it would be Heat Stroker Men's E").
 *
 * The tournament is stored as "Coed Heat Stroker" and its division as
 * "Coed", so naming both gave "Coed Heat Stroker / Coed" — the same word
 * twice in four inches. The division word is lifted OUT of the tournament
 * name and put back on the end, which reads as one title and generalises:
 * a Men's E division of the same event becomes "Heat Stroker Men's E"
 * without anything about it being special-cased.
 */
function eventTitle(tournamentName, divisionName) {
  if (!divisionName) return tournamentName;
  const escaped = divisionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stripped = String(tournamentName)
    .replace(new RegExp(`\\b${escaped}\\b`, "i"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // A tournament whose whole name IS its division has nothing left to
  // prefix with; keep what we were given rather than printing the
  // division twice or nothing at all.
  return stripped ? `${stripped} ${divisionName}` : tournamentName;
}

/**
 * Standings for one bracket (JD, 2026-07-26: "when you click on the
 * division it shows the final standings and records for that division").
 *
 * Records are COMPUTED from the games, the same way pool standings are —
 * nothing is stored. The finish column is the league's own, which we only
 * have for teams whose run has ended; a team still playing has no finish
 * yet and says so rather than being given a rank we invented.
 */
function bracketStandings(games, teamStatus) {
  const byTeam = new Map();
  const add = (name) => {
    if (!isRealTeamName(name)) return null;
    if (!byTeam.has(name)) byTeam.set(name, { team: name, w: 0, l: 0 });
    return byTeam.get(name);
  };
  for (const g of games) {
    const a = add(g.team1_name);
    const b = add(g.team2_name);
    if (g.status !== "final" || g.team1_score === null || g.team2_score === null) continue;
    if (!a || !b || g.team1_score === g.team2_score) continue;
    const [win, lose] = g.team1_score > g.team2_score ? [a, b] : [b, a];
    win.w += 1;
    lose.l += 1;
  }

  // Only SETTLED places are shown (JD, 2026-07-26). A team still playing
  // has not finished anywhere yet, and giving them a row number would
  // read as a placing they have not earned. They sit above everyone who
  // is out — which is true, they are still in it — and their place is
  // simply blank until it is decided.
  const placeOf = (t) => {
    const st = teamStatus[t];
    if (!st) return null;
    // The league writes "Champion" rather than "1st" for the winner, and
    // a champion is the most settled place there is — it must not fall
    // through to "still in" for want of a digit.
    if (st.state === "champion") return { label: st.placement || "Champion", n: 1 };
    const n = st.placement ? Number(String(st.placement).match(/\d+/)?.[0]) : null;
    return Number.isFinite(n) ? { label: st.placement, n } : null;
  };

  return [...byTeam.values()]
    .map((t) => ({ ...t, finish: placeOf(t.team) }))
    .sort((x, y) => {
      if (!x.finish && !y.finish) return y.w - x.w || x.l - y.l || x.team.localeCompare(y.team);
      if (!x.finish) return -1; // still playing outranks anyone already out
      if (!y.finish) return 1;
      return x.finish.n - y.finish.n;
    });
}

function StandingsPanel({ name, rows }) {
  if (rows.length === 0) return null;
  const settled = rows.filter((r) => r.finish).length;
  return (
    <div className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pt-3 pb-2">
        <h2 className="t-heading">{name} standings</h2>
        <span className="text-[11px] text-afa-muted">
          {settled === rows.length
            ? "Final"
            : `${settled} of ${rows.length} places settled`}
        </span>
      </div>
      {/* Bounded, so a long bracket scrolls inside its own panel rather
          than pushing the drawing off the bottom of the screen. */}
      <div className="max-h-[60vh] overflow-y-auto px-4 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_46px_52px] items-center gap-x-2 border-b border-afa-navy/10 pb-1.5 text-[9.5px] font-bold uppercase tracking-[.07em] text-afa-muted">
          <span>Team</span>
          <span className="text-right">W&ndash;L</span>
          <span className="text-right">Finish</span>
        </div>
        {rows.map((t) => (
          <div
            key={t.team}
            className="grid min-h-11 grid-cols-[minmax(0,1fr)_46px_52px] items-center gap-x-2 border-b border-afa-navy/[0.07] py-1.5 text-sm last:border-0"
          >
            <span className="truncate font-semibold" title={t.team}>
              {t.team}
            </span>
            <span className="text-right font-semibold tabular-nums text-afa-ink/[0.78]">
              {t.w}&ndash;{t.l}
            </span>
            <span
              className={`text-right text-xs ${
                t.finish ? "font-semibold text-afa-ink/70" : "text-afa-muted"
              }`}
            >
              {t.finish ? t.finish.label : "still in"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }) {
  const { divisionId } = await params;
  const division = await getDivisionById(divisionId);
  if (!division) return { title: "Division" };
  const renderedName = division.display_name ?? division.name;
  return { title: `${renderedName} — ${division.tournament.name}` };
}

/**
 * Two lookups the bracket needs to put a seed tag in front of a name:
 * ref -> team ("D1" -> "Backwards K") for a slot that still holds its seed
 * ref, and team -> ref for a team whose name has already propagated into a
 * later game. Built from the pools that actually decided the seeding,
 * which for a bracket child means its parent's pool games.
 *
 * resolveSeeds is the same function the scorekeeper's seeding uses, so a
 * tag here can never disagree with what Apply seeding would write. It
 * contributes nothing for an incomplete pool, which is correct: until the
 * pool is final there is no seed to name.
 */
async function seedMapsFor(division, ownPoolGames) {
  const source = division.parent_division_id
    ? await getPoolGames(division.parent_division_id)
    : ownPoolGames;
  if (!source || source.length === 0) return null;

  const byPool = {};
  for (const g of source) (byPool[g.pool] ??= []).push(g);
  const poolsByLetter = Object.fromEntries(
    Object.entries(byPool).map(([letter, games]) => [letter, poolFinishOrder(games)])
  );

  const byRef = new Map();
  const byTeam = new Map();
  for (const [ref, team] of Object.entries(resolveSeeds(poolsByLetter))) {
    const parsed = parseSeedRef(ref);
    if (!parsed) continue;
    const label = `${parsed.pool}${parsed.rank}`;
    byRef.set(label, team);
    // First one wins: a team holds exactly one pool finish, so a later
    // collision would mean the data disagrees with itself.
    if (!byTeam.has(team)) byTeam.set(team, label);
  }
  return { byRef, byTeam };
}

export default async function DivisionPage({ params }) {
  const { slug, divisionId } = await params;
  const division = await getDivisionById(divisionId);
  if (!division || division.tournament?.slug !== slug) notFound();

  const tournament = division.tournament;
  const renderedName = division.display_name ?? division.name;
  const placements = division.placements ?? [];
  const hasPlacements = placements.length > 0;
  const hasBracket = (division.brackets ?? []).length > 0;
  const poolGames = division.pool_games ?? [];
  // Chronological, then by the printed game number — the order the bracket
  // is actually played in.
  const bracketGames = [...(division.games ?? [])]
    .filter((g) => !g.is_bye && g.status !== "cancelled")
    .sort(
      (a, b) =>
        String(a.scheduled_time ?? "").localeCompare(String(b.scheduled_time ?? "")) ||
        (a.round ?? 0) - (b.round ?? 0)
    );

  // Bracket stages: this division's children, or — when this IS a child —
  // its siblings, so the toggle works from inside either bracket.
  const allDivisions = tournament.divisions ?? [];
  const parentId = division.parent_division_id ?? division.id;
  const stages = allDivisions
    .filter((d) => d.parent_division_id === parentId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const parent = division.parent_division_id
    ? allDivisions.find((d) => d.id === division.parent_division_id)
    : null;
  const parentName = parent ? (parent.display_name ?? parent.name) : null;

  // A team carries its POOL SEED everywhere it appears in the bracket
  // (redesign spec 5.3) — [D1] Backwards K in the game it was seeded into
  // AND in the game it won its way to. The seeds live on the PARENT
  // division: Gold/Silver/Bronze hold the bracket games, their parent
  // holds pool play, so a bracket child has to look up a level to know
  // who [D1] is. Without this a propagated name renders bare, which is
  // what it did until now.
  const seeds = await seedMapsFor(division, poolGames);

  // Pool play belongs to the TOURNAMENT, not to whichever page you are
  // standing on (JD, 2026-07-26: "when we click into a team we should see
  // the record and games from the whole tournament"). A bracket child has
  // no pool games of its own, so it reads its parent's — the same games
  // its seeding came out of. Without this, a team's record and game list
  // on the Gold page began at the bracket, as though Friday had not
  // happened, and the Pool play tab had nothing to show.
  const stagePoolGames = division.parent_division_id
    ? await getPoolGames(division.parent_division_id)
    : poolGames;
  const hasPoolGames = stagePoolGames.length > 0;
  const teamStatus = await getTeamStatus(tournament.id);

  // The bracket children's own games, so this page can draw them inline
  // rather than sending a team one more click away. Only fetched when
  // there are children to draw.
  const stageGames = stages.length
    ? await getGamesForDivisions(stages.map((s) => s.id))
    : {};
  const playableStageGames = Object.fromEntries(
    Object.entries(stageGames).map(([id, list]) => [
      id,
      list
        .filter((g) => !g.is_bye && g.status !== "cancelled")
        .sort(
          (a, b) =>
            String(a.scheduled_time ?? "").localeCompare(String(b.scheduled_time ?? "")) ||
            (a.round ?? 0) - (b.round ?? 0)
        ),
    ])
  );

  // "Bracket play is live" means the bracket has actually started — a
  // result is in, or a bracket game's time has come and gone. A drawn but
  // unplayed bracket is not what anyone is at the page for on Friday
  // night, so it does not take the default.
  const now = Date.now();
  const bracketLive = Object.values(playableStageGames).some((list) =>
    list.some(
      (g) =>
        g.status === "final" || (g.scheduled_time && new Date(g.scheduled_time).getTime() <= now)
    )
  );

  // Which bracket is each team in? A slot names its team either by seed
  // ref ("A #1", before Apply seeding) or by the real name (after), so
  // both are read and the name wins. This is what lets the picker at the
  // top show a Gold team the Gold bracket and nothing else.
  const bracketByTeam = {};
  if (stages.length > 1) {
    for (const g of await getBracketSeedSlots(stages.map((s) => s.id))) {
      for (const side of ["team1", "team2"]) {
        const ref = g[`${side}_seed_ref`];
        if (ref && seeds) {
          const parsed = parseSeedRef(ref);
          const team = parsed && seeds.byRef.get(`${parsed.pool}${parsed.rank}`);
          if (team && !bracketByTeam[team]) bracketByTeam[team] = g.division_id;
        }
        const name = g[`${side}_name`];
        if (isRealTeamName(name)) bracketByTeam[name] = g.division_id;
      }
    }
  }

  // Find my team (dispatch-brief-14) — one normalized games array feeding
  // TeamFinder, built the same way from either stage this division might
  // be in: pool play carries a real pool letter, the bracket list never
  // does (pool: null). Provenance placeholders are filtered out of the
  // team list below; if that leaves nothing real, no picker renders.
  const ownMoot = mootIfRounds(bracketGames);
  const finderGames = [
    ...stagePoolGames.map((g) => ({
      id: g.id,
      pool: g.pool,
      when: g.scheduled_time,
      whenShort: whenShort(g.scheduled_time),
      field: g.field ?? null,
      caption: formatFieldTime(g),
      team1: g.team1_name,
      team2: g.team2_name,
      score1: g.team1_score,
      score2: g.team2_score,
      isFinal: g.status === "final",
    })),
    // The bracket children's games too, so a team's card shows their whole
    // tournament rather than stopping at pool play. Without these, picking
    // a team on the parent page showed two Friday games and nothing since.
    ...Object.entries(playableStageGames).flatMap(([id, list]) => {
      const stageName = stages.find((st) => st.id === id)?.display_name ?? "";
      // The drawing still shows a moot if-game, marked N/A — that is the
      // sheet. A SCHEDULE is a list of games that will happen, and this
      // one will not (JD, 2026-07-26).
      const moot = mootIfRounds(list);
      return list
        .filter((g) => !moot.has(g.round))
        .filter(
          (g) => isRealTeamName(g.team1_name) && isRealTeamName(g.team2_name) && g.division_id !== division.id
        )
        .map((g) => ({
          id: g.id,
          pool: null,
          when: g.scheduled_time,
          whenShort: whenShort(g.scheduled_time),
          field: g.field ?? null,
          caption: [`${stageName} Game ${g.round}`, formatFieldTime(g)].filter(Boolean).join(" · "),
          team1: g.team1_name,
          team2: g.team2_name,
          score1: g.team1_score,
          score2: g.team2_score,
          isFinal: g.status === "final",
        }));
    }),
    // This division's OWN bracket games. Filtered the same way: on a
    // bracket page the moot if-game arrives through here, not through the
    // children above, which is why it was still showing as "Scheduled" on
    // the champion's card.
    ...bracketGames.filter((g) => !ownMoot.has(g.round)).map((g) => ({
      id: g.id,
      pool: null,
      when: g.scheduled_time,
      whenShort: whenShort(g.scheduled_time),
      field: g.field ?? null,
      caption: [`Game ${g.round}`, formatFieldTime(g)].filter(Boolean).join(" · "),
      team1: g.team1_name,
      team2: g.team2_name,
      score1: g.team1_score,
      score2: g.team2_score,
      isFinal: g.status === "final",
    })),
  ];
  const finderTeams = [
    ...new Set(finderGames.flatMap((g) => [g.team1, g.team2]).filter(isRealTeamName)),
  ].sort((a, b) => a.localeCompare(b));
  const showsFinder = finderTeams.length > 0 || stages.length > 1;

  return (
    <div className="space-y-4">
      {/* Where you are and how to get back, on ONE line (JD, 2026-07-26).
          A back link, then a centred title on its own row, cost most of a
          phone screen before anything worth reading appeared. The arrow
          goes up a level; the trail behind it says which level that is,
          and the last crumb — this division — is the heading. */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link
          href={parent ? `/tournaments/${slug}/division/${parent.id}` : `/tournaments/${slug}`}
          aria-label={`Back to ${parent ? eventTitle(tournament.name, parentName) : tournament.name}`}
          className="-ml-1 flex h-9 w-7 shrink-0 items-center justify-center text-lg text-afa-navy"
        >
          &larr;
        </Link>
        {parent ? (
          <>
            <Link
              href={`/tournaments/${slug}/division/${parent.id}`}
              className="truncate text-afa-ink/60 hover:text-afa-navy hover:underline"
            >
              {eventTitle(tournament.name, parentName)}
            </Link>
            <span aria-hidden="true" className="text-afa-ink/25">
              /
            </span>
            <h1
              className="truncate font-display text-lg leading-none text-afa-navy"
              aria-current="page"
            >
              {renderedName}
            </h1>
          </>
        ) : (
          <h1
            className="truncate font-display text-lg leading-none text-afa-navy"
            aria-current="page"
          >
            {eventTitle(tournament.name, renderedName)}
          </h1>
        )}
      </nav>

      {showsFinder && (
        // KEYED on the division. Navigating from one division to another
        // keeps the same route pattern, so React reuses this component and
        // its state — which meant the bracket you were last looking at
        // followed you to the next division, and the ?game= in the new URL
        // was never read because the mount effect had already run. Clicking
        // a Gold result from a Silver page landed you on Silver (JD,
        // 2026-07-26). A key forces the remount the navigation implies.
        <DivisionView
          key={division.id}
          teams={finderTeams}
          games={finderGames}
          storageKey={`afa-team-${slug}`}
          chipPrefix="Pool"
          stages={stages.map((st) => ({ id: st.id, name: st.display_name ?? st.name }))}
          currentId={division.id}
          bracketByTeam={bracketByTeam}
          teamStatus={teamStatus}
          slug={slug}
          bracketLive={bracketLive}
          poolPane={hasPoolGames ? <PoolPlaySection poolGames={stagePoolGames} /> : null}
          standingsPanes={Object.fromEntries(
            Object.entries(playableStageGames)
              .filter(([, list]) => list.length > 0)
              .map(([id, list]) => [
                id,
                <StandingsPanel
                  key={id}
                  name={stages.find((st) => st.id === id)?.display_name ?? ""}
                  rows={bracketStandings(list, teamStatus)}
                />,
              ])
          )}
          bracketPanes={Object.fromEntries(
            Object.entries(playableStageGames)
              .filter(([, list]) => list.length > 0)
              .map(([id, list]) => [
                id,
                <DrawnBracket
                  key={id}
                  games={list}
                  division={stages.find((st) => st.id === id)?.name}
                  seeds={seeds}
                />,
              ])
          )}
        />
      )}

      {hasPlacements && (
        <Card className="mb-6">
          <div className="grid grid-cols-2 gap-4">
            {["champion", "runner_up"].map((place) => {
              const p = placements.find((x) => x.place === place);
              if (!p) return null;
              return (
                <figure key={place} className="text-center">
                  {p.photo_url && (
                    <img src={p.photo_url} alt={p.team_name} className="w-full h-auto rounded" />
                  )}
                  <figcaption className="text-sm mt-1">
                    {place === "champion" ? "Champion" : "Runner-Up"} — {p.team_name}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </Card>
      )}

      {hasBracket && <BracketTree division={division} />}

      {/* A drawn-but-unplayed bracket. These games are transcribed from the
          league's own pre-drawn bracket, so they carry their real field and
          time and their slots read as provenance — "A #1", "Winner of Game
          5" — the fence convention: the bracket exists before it is played.
          DrawnBracket lays it out from the feed graph itself (dispatch-
          brief-15) — these brackets are irregular (byes from 9/10-entrant
          pools), which breaks the halving math BracketTree/tree.js rely on,
          so this is a separate renderer rather than a variant of that one. */}
      {/* No heading and no explainer here: "Brackets" already sits above the
          Gold/Silver/Bronze picker a few pixels up, so a second "Bracket"
          heading named the same thing twice, and the drawing itself says it
          is drawn and scheduled — every game carries its time, its field
          and its provenance. */}
      {/* Only when this page has no picker at all — otherwise the
          bracket lives inside the Pool play / Bracket toggle above, and
          drawing it twice would be two answers to one question. */}
      {!hasBracket && bracketGames.length > 0 && !showsFinder && (
        <div>
          <DrawnBracket games={bracketGames} division={division?.name} seeds={seeds} />
        </div>
      )}

      {!hasPlacements && !hasBracket && !hasPoolGames && bracketGames.length === 0 && (
        <p className="text-afa-ink/70 text-sm">
          No results yet — check back after the bracket is set.
        </p>
      )}
    </div>
  );
}
