import { getServiceClient } from "@/lib/supabase";
import { propagateAfterFinalize } from "@/lib/bracket/propagate";
import {
  parsePoolResults,
  parseBracketResults,
  normalizeTeam,
  isPlaceholderName,
  parsePlacements,
} from "@/lib/quickscores";
import { computeTeamStatus } from "@/lib/elimination";

/**
 * Pull results from QuickScores (JD, 2026-07-26).
 *
 * The league runs this tournament on QuickScores too, and JD had been
 * keeping the two in step by hand. This does that instead.
 *
 * The rules it works under, in order of how much they matter:
 *
 *  1. It only ever ADDS a result. A game we have scored and they have
 *     not is left exactly as it is — their page trails a director's
 *     phone by however long it takes someone to type it in, and treating
 *     their blank as authoritative would erase a real score every hour.
 *  2. It never guesses which game it is looking at. Pool games match on
 *     both team names plus the scheduled hour; bracket games match on the
 *     printed game number, which our transcription already stores in
 *     `round`. Anything ambiguous is reported, not applied.
 *  3. It writes through the same path the scorekeeper does, so a bracket
 *     result still propagates the winner forward. A score written
 *     straight into the row would leave the next game's slot empty.
 *  4. dryRun reports what it would do and writes nothing.
 *
 * Lives in lib rather than in the route because it has two callers: the
 * hourly schedule, and a director pressing the button on the scorekeeper
 * screen when they do not want to wait for the hour.
 */
const LEAGUE_TZ_OFFSET_JULY = "-06:00"; // America/Denver, MDT

function authorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

// Their pool rows print a local wall time ("2026-07-24T21:00"). Ours store
// an absolute instant. July in Utah is MDT, and this tournament is a July
// tournament; a date that isn't gets no hour and simply falls back to
// matching on team names alone.
function toInstant(localWallTime) {
  if (!localWallTime) return null;
  const d = new Date(`${localWallTime}:00${LEAGUE_TZ_OFFSET_JULY}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pairKey = (a, b) => [normalizeTeam(a), normalizeTeam(b)].sort().join(" ~ ");

async function syncPoolDivision(supabase, division, html, dryRun, report) {
  const upstream = parsePoolResults(html);
  report.parsed.pool += upstream.length;

  const { data: ours, error } = await supabase
    .from("pool_games")
    .select("id, pool, team1_name, team2_name, team1_score, team2_score, status, scheduled_time")
    .eq("division_id", division.id);
  if (error) throw new Error(`reading pool games: ${error.message}`);

  // Two teams can meet twice in a tournament, so the pair alone is not a
  // key. Keep every candidate and let the hour decide between them.
  const byPair = new Map();
  for (const g of ours ?? []) {
    const k = pairKey(g.team1_name, g.team2_name);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(g);
  }

  for (const ev of upstream) {
    const [t1, t2] = ev.teams;
    if (t1.score === null || t2.score === null) continue; // not played upstream yet

    const candidates = byPair.get(pairKey(t1.name, t2.name)) ?? [];
    let match = null;
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1) {
      const when = toInstant(ev.startsAt);
      const sameHour = when
        ? candidates.filter(
            (c) => c.scheduled_time && Math.abs(new Date(c.scheduled_time) - when) < 30 * 60_000
          )
        : [];
      if (sameHour.length === 1) match = sameHour[0];
    }

    if (!match) {
      report.unmatched.push({
        stage: "pool",
        division: division.name,
        teams: [t1.name, t2.name],
        at: ev.startsAt,
        why: candidates.length ? "more than one game has these two teams" : "no game with these two teams",
      });
      continue;
    }

    // Their score is attached to their team; ours to ours. Line them up by
    // name rather than assuming both sides ordered the game the same way.
    const flip = normalizeTeam(match.team1_name) !== normalizeTeam(t1.name);
    const s1 = flip ? t2.score : t1.score;
    const s2 = flip ? t1.score : t2.score;

    if (match.team1_score === s1 && match.team2_score === s2 && match.status === "final") continue;

    const change = {
      stage: "pool",
      division: division.name,
      game: `Pool ${match.pool}: ${match.team1_name} vs ${match.team2_name}`,
      was: match.status === "final" ? `${match.team1_score}-${match.team2_score}` : "unscored",
      now: `${s1}-${s2}`,
    };
    report.changes.push(change);
    if (dryRun) continue;

    const { error: writeError } = await supabase
      .from("pool_games")
      .update({ team1_score: s1, team2_score: s2, status: "final" })
      .eq("id", match.id);
    if (writeError) report.errors.push(`${change.game}: ${writeError.message}`);
    else report.applied += 1;
  }
}

async function syncBracketDivision(supabase, division, html, dryRun, report, placements) {
  // The league prints each team's finish in the drawing itself. Read it
  // here, where the page is already fetched, and hand it to the status
  // pass below rather than fetching every bracket a second time.
  for (const { place, team } of parsePlacements(html)) {
    placements.set(normalizeTeam(team), { place, bracket: division.name });
  }

  const upstream = parseBracketResults(html);
  report.parsed.bracket += upstream.length;

  const { data: ours, error } = await supabase
    .from("games")
    .select("id, round, team1_name, team2_name, team1_score, team2_score, status, scheduled_time")
    .eq("division_id", division.id);
  if (error) throw new Error(`reading bracket games: ${error.message}`);

  // The MATCHUP is what identifies a game (JD, 2026-07-26: "you dont need
  // the game number we have the matchups"). The two teams are read
  // straight off the cells; the printed number comes from a separate box
  // that is empty for an unplayed game, and relying on it is what let a
  // whole game go missing in silence. The number is kept only to settle
  // the rare case of one pair meeting twice in the same bracket.
  const byPair = new Map();
  for (const g of ours ?? []) {
    if (isPlaceholderName(g.team1_name) || isPlaceholderName(g.team2_name)) continue;
    const k = pairKey(g.team1_name, g.team2_name);
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(g);
  }

  const note = (why, ev, extra = {}) =>
    report.unmatched.push({
      stage: "bracket",
      division: division.name,
      game: ev.gameNumber ? `Game ${ev.gameNumber}` : ev.teams.map((t) => t.name).join(" vs "),
      why,
      ...extra,
    });

  for (const ev of upstream) {
    // Every skip says so. A game dropped quietly reads exactly like a
    // game that was already in sync, which is how three of them sat
    // missing while the run reported "Already up to date".
    if (ev.teams.length !== 2) continue; // a half-drawn slot, not yet a game
    const [t1, t2] = ev.teams;
    if (t1.score === null || t2.score === null) continue; // not played upstream
    if (t1.score === t2.score) {
      note("upstream shows a tie, which cannot finalize a bracket game", ev);
      continue;
    }

    const candidates = byPair.get(pairKey(t1.name, t2.name)) ?? [];
    let match = null;
    if (candidates.length === 1) {
      match = candidates[0];
    } else if (candidates.length > 1) {
      const sameNumber = candidates.filter((c) => c.round === ev.gameNumber);
      if (sameNumber.length === 1) match = sameNumber[0];
    }

    if (!match) {
      note(
        candidates.length
          ? "these two teams meet more than once here and the game number did not settle it"
          : "no game between these two teams — our slots may still hold placeholders",
        ev,
        { teams: [t1.name, t2.name] }
      );
      continue;
    }

    const flip = normalizeTeam(match.team1_name) !== normalizeTeam(t1.name);
    const s1 = flip ? t2.score : t1.score;
    const s2 = flip ? t1.score : t2.score;

    if (match.team1_score === s1 && match.team2_score === s2 && match.status === "final") continue;

    const change = {
      stage: "bracket",
      division: division.name,
      game: `Game ${match.round}: ${match.team1_name} vs ${match.team2_name}`,
      was: match.status === "final" ? `${match.team1_score}-${match.team2_score}` : "unscored",
      now: `${s1}-${s2}`,
    };
    report.changes.push(change);
    if (dryRun) continue;

    const { error: writeError } = await supabase
      .from("games")
      .update({
        team1_score: s1,
        team2_score: s2,
        winner_slot: s1 > s2 ? "team1" : "team2",
        status: "final",
        updated_at: new Date().toISOString(),
      })
      .eq("id", match.id);
    if (writeError) {
      report.errors.push(`${change.game}: ${writeError.message}`);
      continue;
    }
    report.applied += 1;

    // Same call the scorekeeper's score route makes. Without it the next
    // game's slot keeps its "Winner of Game N" text forever.
    try {
      await propagateAfterFinalize(match.id);
    } catch (err) {
      report.errors.push(`${change.game}: propagation failed — ${err.message}`);
    }
  }
}

/**
 * Recompute who is still playing, for every tournament that has a synced
 * division. Stored rather than derived per render because the answer only
 * changes when a score does, and because a public page should not have to
 * load an entire tournament to tell one team they are out.
 *
 * The whole table is rewritten each pass. It is derived data — a few dozen
 * rows — and reconciling it row by row would be more code and more ways to
 * leave a stale "eliminated" on a team that is very much still playing.
 */
async function refreshTeamStatus(supabase, dryRun, report, placements) {
  const { data: synced } = await supabase
    .from("divisions")
    .select("tournament_id")
    .not("source_url", "is", null);
  const tournamentIds = [...new Set((synced ?? []).map((d) => d.tournament_id))];

  for (const tournamentId of tournamentIds) {
    const { data: divisions } = await supabase
      .from("divisions")
      .select("id, name, display_name")
      .eq("tournament_id", tournamentId);
    const ids = (divisions ?? []).map((d) => d.id);
    if (ids.length === 0) continue;
    const names = new Map((divisions ?? []).map((d) => [d.id, d.display_name ?? d.name]));

    const [{ data: games }, { data: poolGames }] = await Promise.all([
      supabase
        .from("games")
        .select(
          // The source columns are what make an if-game recognisable
          // (lib/bracket/if-game.js). Without them every if-game reads as
          // pending, which kept both finalists out of the status table —
          // no champion, and the runner-up never marked out.
          "id, division_id, round, team1_name, team2_name, team1_score, team2_score, status, scheduled_time, is_bye, team1_source_game_id, team1_source_result, team2_source_game_id, team2_source_result"
        )
        .in("division_id", ids),
      supabase
        .from("pool_games")
        .select("id, division_id, team1_name, team2_name, team1_score, team2_score, status, scheduled_time")
        .in("division_id", ids),
    ]);

    const rows = computeTeamStatus(games ?? [], poolGames ?? [], names).map((r) => {
      // The bracket a team finished in is known from their last game even
      // when the league has not printed a placement yet, so the two are
      // filled independently — "Gold" on its own still tells you more
      // than nothing.
      const finish = placements.get(normalizeTeam(r.team_name));
      return {
        ...r,
        tournament_id: tournamentId,
        bracket_name: finish?.bracket ?? r.last_game_label?.replace(/ Game \d+$/, "") ?? null,
        placement: finish?.place ?? null,
        updated_at: new Date().toISOString(),
      };
    });

    const { data: existing } = await supabase
      .from("team_status")
      .select("team_name, state, placement")
      .eq("tournament_id", tournamentId);
    const before = new Map((existing ?? []).map((r) => [r.team_name, r]));

    for (const r of rows) {
      const was = before.get(r.team_name);
      if (was?.state !== r.state || was?.placement !== r.placement) {
        report.status.push({
          team: r.team_name,
          state: r.state,
          finished: [r.bracket_name, r.placement].filter(Boolean).join(" "),
          after: r.last_game_label,
        });
      }
    }
    const now = new Set(rows.map((r) => r.team_name));
    for (const [team, was] of before) {
      if (!now.has(team)) report.status.push({ team, state: "still playing", wasStated: was.state });
    }

    if (dryRun) continue;
    await supabase.from("team_status").delete().eq("tournament_id", tournamentId);
    if (rows.length) {
      const { error } = await supabase.from("team_status").insert(rows);
      if (error) report.errors.push(`team status: ${error.message}`);
    }
  }
}

export async function runQuickScoresSync({ dryRun = false } = {}) {
  const supabase = getServiceClient();

  const { data: divisions, error } = await supabase
    .from("divisions")
    .select("id, name, source_url, parent_division_id")
    .not("source_url", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // team -> {place, bracket}, filled as each bracket page is parsed.
  const placements = new Map();

  const report = {
    dryRun,
    ranAt: new Date().toISOString(),
    divisions: (divisions ?? []).length,
    parsed: { pool: 0, bracket: 0 },
    applied: 0,
    changes: [],
    unmatched: [],
    status: [],
    errors: [],
  };

  for (const division of divisions ?? []) {
    let html;
    try {
      const res = await fetch(division.source_url, {
        headers: { "User-Agent": "afa-southern-utah results sync" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      html = await res.text();
    } catch (err) {
      report.errors.push(`${division.name}: could not fetch — ${err.message}`);
      continue;
    }

    // A division that holds pool games is a pool-play page; one that holds
    // bracket games is a drawing. Asking which rows it has is more honest
    // than reading it off the name.
    try {
      const { count: poolCount } = await supabase
        .from("pool_games")
        .select("id", { count: "exact", head: true })
        .eq("division_id", division.id);
      if (poolCount) await syncPoolDivision(supabase, division, html, dryRun, report);
      else await syncBracketDivision(supabase, division, html, dryRun, report, placements);
    } catch (err) {
      report.errors.push(`${division.name}: ${err.message}`);
    }
  }

  // Whose weekend is over (JD: "that should be part of the cron"). Runs
  // after the writes above, on every pass rather than only when something
  // changed — a team also becomes eliminated when a game they were
  // waiting on gets scored somewhere else entirely.
  try {
    await refreshTeamStatus(supabase, dryRun, report, placements);
  } catch (err) {
    report.errors.push(`team status: ${err.message}`);
  }

  // Worth reading in the Vercel log even when nothing changed — a sync
  // that silently stops parsing looks exactly like a sync with nothing to
  // do, and the parsed counts are what tell them apart.
  console.log("quickscores sync", JSON.stringify(report));

  return report;
}
