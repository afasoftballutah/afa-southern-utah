import { getTournamentBasicsBySlug, getTournamentSchedule } from "@/lib/data";

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
// ?team=<name> narrows it to one team's games, which is what a player
// actually wants. A bracket game the team has not reached yet simply is
// not in the feed, and appears the moment the bracket names them —
// again, only because this is a subscription and not a download.
export const revalidate = 300;

function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

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

export async function GET(request, { params }) {
  const { slug } = await params;
  const [tournament, rows] = await Promise.all([
    getTournamentBasicsBySlug(slug),
    getTournamentSchedule(slug),
  ]);
  if (!tournament) return new Response("Not found", { status: 404 });

  const { searchParams } = new URL(request.url);
  const team = searchParams.get("team");

  // A game with no time cannot go in a calendar — there is nothing to put
  // it beside. It arrives once it is scheduled.
  let games = rows.filter((g) => g.scheduledTime);
  if (team) games = games.filter((g) => g.team1 === team || g.team2 === team);

  const origin = new URL(request.url).origin;
  const venue = [tournament.venue_name, tournament.venue_address].filter(Boolean).join(", ");
  const dtstamp = icsTimestamp(new Date());
  const calName = team ? `${team} — ${tournament.name}` : tournament.name;

  const vevents = games.flatMap((g) => {
    const start = new Date(g.scheduledTime);
    const end = new Date(start.getTime() + GAME_MINUTES * 60_000);
    const vs = g.isFinal
      ? `${g.team1} ${g.score1}–${g.score2} ${g.team2}`
      : `${g.team1} vs ${g.team2}`;
    const where = [g.field, venue].filter(Boolean).join(", ");
    const detail = [
      `${g.divisionName} · ${g.label}`,
      // Only name an opponent that exists. "vs Winner of Game 5" is
      // honest on a bracket sheet and useless in a calendar alert.
      team && isRealTeam(g.team1 === team ? g.team2 : g.team1)
        ? `Opponent: ${g.team1 === team ? g.team2 : g.team1}`
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
      `DTSTAMP:${dtstamp}`,
      `LAST-MODIFIED:${dtstamp}`,
      `DTSTART:${icsTimestamp(start)}`,
      `DTEND:${icsTimestamp(end)}`,
      // "Pool A: ..." already names itself; "Game 5: ..." does not — a
      // calendar entry has to say WHICH bracket without the page open.
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
    // Both spellings: the standard one and the Apple/Outlook one. Scores
    // land during a tournament, so an hourly re-read is the right cadence.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...vevents,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

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
