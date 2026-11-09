// The games.ics body, shared by the query-string route (games.ics?team=…)
// and the path route (cal/<division>/<team>.ics) — see lib/team-feed.js
// teamFeedHref for why the subscribe link now uses the path one.
import { getTournamentBasicsBySlug, getTournamentSchedule } from "@/lib/data";
import { compactFeedLabel } from "@/lib/quickscores";
import { venueForField } from "@/lib/venues";
import { icsTimestamp } from "@/lib/ics-time";
import { formatFieldTime } from "@/lib/bracket/tree";
import { isAwayZone, tournamentTimeZone } from "@/lib/zone";
import { divisionFamily, feedSequence, teamFeedGames } from "@/lib/team-feed";


function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// icsTimestamp: UTC "…Z", lib/ics-time.js (shared with its test).

// RFC 5545 caps a content line at 75 octets and folds the rest onto
// continuation lines beginning with a single space. Team names are short,
// but DESCRIPTION with a URL in it is not, and an unfolded long line is
// the classic reason a feed imports on one client and not another.
function fold(line) {
  // OCTETS, not characters — the scores carry an en dash and the details a
  // middle dot, three bytes each, so a character count would let a line run
  // past the limit and could split one of them down the middle.
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 73) return line;
  const out = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 73 : 72;
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  if (cur) out.push(cur);
  return out.map((p, i) => (i === 0 ? p : " " + p)).join("\r\n");
}

// Games are scheduled on the hour and run to the next one.
const GAME_MINUTES = 60;

const PLACEHOLDER = /^(Winner|Loser) of Game \d+$/;
const SEED_REF = /^\[?[A-Z] ?#\d+\]?$/;
const isRealTeam = (n) => !!n && !PLACEHOLDER.test(n) && !SEED_REF.test(n);

export async function teamFeedResponse(request, { slug, team = null, divisionId = null }) {
  const [tournament, rows] = await Promise.all([
    getTournamentBasicsBySlug(slug),
    getTournamentSchedule(slug),
  ]);
  if (!tournament) return new Response("Not found", { status: 404 });

  const family = divisionFamily(tournament.divisions, divisionId);

  // A game with no time cannot go in a calendar — there is nothing to put
  // it beside. It arrives once it is scheduled.
  let games = rows.filter((g) => g.scheduledTime);
  if (team) games = teamFeedGames(games, { team, family });

  const origin = new URL(request.url).origin;
  const venue = [tournament.venue_name, tournament.venue_address].filter(Boolean).join(", ");
  const builtAt = new Date();
  const dtstamp = icsTimestamp(builtAt);
  const sequence = feedSequence(builtAt);
  const calName = team ? `${team} — ${tournament.name}` : tournament.name;
  // DTSTART stays UTC (correct anywhere). A tournament away from league
  // time also names its zone and says the local start in the details.
  const timeZone = tournamentTimeZone(tournament);
  const away = isAwayZone(timeZone);

  const vevents = games.flatMap((g) => {
    const start = new Date(g.scheduledTime);
    const end = new Date(start.getTime() + GAME_MINUTES * 60_000);
    const name1 = g.team1 ?? g.team1From ?? "TBD";
    const name2 = g.team2 ?? g.team2From ?? "TBD";
    const t1 = compactFeedLabel(name1) ?? name1;
    const t2 = compactFeedLabel(name2) ?? name2;
    const vs = g.isFinal
      ? `${t1} ${g.score1}–${g.score2} ${t2}`
      : `${t1} vs ${t2}`;
    // Two-park tournament: the game's own park, not the tournament's city.
    const park = venueForField(tournament, g.field);
    const where = [g.field, park ? [park.name, park.address].filter(Boolean).join(", ") : venue]
      .filter(Boolean)
      .join(", ");
    const detail = [
      `${g.divisionName} · ${g.label}`,
      away ? formatFieldTime({ scheduled_time: g.scheduledTime }, timeZone) : null,
      // Only name an opponent that exists. "vs Winner of Game 5" is
      // honest on a bracket sheet and useless in a calendar alert.
      team && isRealTeam(g.team1 === team ? g.team2 : g.team1)
        ? `Opponent: ${compactFeedLabel(g.team1 === team ? g.team2 : g.team1)}`
        : null,
      `${origin}/tournaments/${slug}`,
    ]
      .filter(Boolean)
      .join("\n");

    return [
      "BEGIN:VEVENT",
      // Stable per game, so a moved game is EDITED in the subscriber's
      // calendar rather than added a second time.
      `UID:${g.id}@afa-southern-utah`,
      `SEQUENCE:${sequence}`,
      `DTSTAMP:${dtstamp}`,
      `LAST-MODIFIED:${dtstamp}`,
      `DTSTART:${icsTimestamp(start)}`,
      `DTEND:${icsTimestamp(end)}`,
      // "Pool A: ..." already names itself; "G5" does not — a calendar
      // entry has to say WHICH bracket without the page open.
      fold(
        `SUMMARY:${icsEscape(
          `${g.label.startsWith("Pool") ? g.label : `${g.divisionName} ${g.label}`}: ${vs}`
        )}`
      ),
      where ? fold(`LOCATION:${icsEscape(where)}`) : null,
      fold(`DESCRIPTION:${icsEscape(detail)}`),
      fold(`URL:${origin}/tournaments/${slug}`),
      "END:VEVENT",
    ].filter(Boolean);
  });

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AFA Southern Utah//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${icsEscape(calName)}`),
    away ? `X-WR-TIMEZONE:${timeZone}` : null,
    // Both spellings: the standard one and the Apple/Outlook one. Scores
    // land during a tournament, so an hourly re-read is the right cadence.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...vevents,
    "END:VCALENDAR",
    "",
  ]
    .filter((line) => line !== null)
    .join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline, not attachment: this is meant to be SUBSCRIBED to, and an
      // attachment disposition makes a calendar client download a frozen
      // copy instead — the exact failure QuickScores warns about.
      "Content-Disposition": `inline; filename="${slug}${team ? "-team" : ""}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
