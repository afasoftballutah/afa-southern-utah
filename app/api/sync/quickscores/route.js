import { getServiceClient } from "@/lib/supabase";
import { propagateAfterFinalize } from "@/lib/bracket/propagate";
import {
  parsePoolResults,
  parseBracketResults,
  normalizeTeam,
  isPlaceholderName,
} from "@/lib/quickscores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pull results from QuickScores, hourly (JD, 2026-07-26).
 *
 * The league runs this tournament on QuickScores too, and JD has been
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
 *  4. ?dryRun=1 reports what it would do and writes nothing.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that
 * env var is set. Without the var the route still refuses external
 * callers — an open endpoint that writes scores is not something to leave
 * lying around.
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

async function syncBracketDivision(supabase, division, html, dryRun, report) {
  const upstream = parseBracketResults(html);
  report.parsed.bracket += upstream.length;

  const { data: ours, error } = await supabase
    .from("games")
    .select("id, round, team1_name, team2_name, team1_score, team2_score, status")
    .eq("division_id", division.id);
  if (error) throw new Error(`reading bracket games: ${error.message}`);

  // These brackets were transcribed off the league's printed sheet, which
  // is the same sheet QuickScores drew from, and `round` holds that
  // printed game number (see migration-2026-07-25-bracket-source-links).
  // So "Game 5" on their page and round 5 in ours are the same game by
  // construction, not by coincidence.
  const byRound = new Map((ours ?? []).map((g) => [g.round, g]));

  for (const ev of upstream) {
    if (ev.teams.length !== 2) continue;
    const [t1, t2] = ev.teams;
    if (t1.score === null || t2.score === null) continue;
    if (t1.score === t2.score) {
      report.unmatched.push({
        stage: "bracket",
        division: division.name,
        game: `Game ${ev.gameNumber}`,
        why: "upstream shows a tie, which cannot finalize a bracket game",
      });
      continue;
    }

    const match = byRound.get(ev.gameNumber);
    if (!match) {
      report.unmatched.push({
        stage: "bracket",
        division: division.name,
        game: `Game ${ev.gameNumber}`,
        why: "no game with this number",
      });
      continue;
    }

    // Our slot may still read "Winner of Game 7" while theirs names the
    // team. That is a game whose result we have not propagated yet, and
    // scoring it from the outside would attach the score to a placeholder.
    // Report it and leave it for the scorekeeper.
    if (isPlaceholderName(match.team1_name) || isPlaceholderName(match.team2_name)) {
      report.unmatched.push({
        stage: "bracket",
        division: division.name,
        game: `Game ${ev.gameNumber}`,
        why: "our slots still hold placeholders — the feeding game is not scored here yet",
      });
      continue;
    }

    const ourPair = pairKey(match.team1_name, match.team2_name);
    if (ourPair !== pairKey(t1.name, t2.name)) {
      report.unmatched.push({
        stage: "bracket",
        division: division.name,
        game: `Game ${ev.gameNumber}`,
        why: `different teams: ours ${match.team1_name} vs ${match.team2_name}, theirs ${t1.name} vs ${t2.name}`,
      });
      continue;
    }

    const flip = normalizeTeam(match.team1_name) !== normalizeTeam(t1.name);
    const s1 = flip ? t2.score : t1.score;
    const s2 = flip ? t1.score : t2.score;

    if (match.team1_score === s1 && match.team2_score === s2 && match.status === "final") continue;

    const change = {
      stage: "bracket",
      division: division.name,
      game: `Game ${ev.gameNumber}: ${match.team1_name} vs ${match.team2_name}`,
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

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ error: "Not authorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const supabase = getServiceClient();

  const { data: divisions, error } = await supabase
    .from("divisions")
    .select("id, name, source_url, parent_division_id")
    .not("source_url", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const report = {
    dryRun,
    ranAt: new Date().toISOString(),
    divisions: (divisions ?? []).length,
    parsed: { pool: 0, bracket: 0 },
    applied: 0,
    changes: [],
    unmatched: [],
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
      else await syncBracketDivision(supabase, division, html, dryRun, report);
    } catch (err) {
      report.errors.push(`${division.name}: ${err.message}`);
    }
  }

  // Worth reading in the Vercel log even when nothing changed — a sync
  // that silently stops parsing looks exactly like a sync with nothing to
  // do, and the parsed counts are what tell them apart.
  console.log("quickscores sync", JSON.stringify(report));

  return Response.json(report);
}
