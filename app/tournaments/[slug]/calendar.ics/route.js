import { getTournamentBasicsBySlug } from "@/lib/data";

// Dates (action links, dispatch-brief-3): hand-rolled ICS, no dependency.
// All-day event — DTEND is the RFC 5545 exclusive end date, so a
// same-day or multi-day tournament always shows through its last day.
//
// Separated by event (dispatch-brief-5): when the tournament's divisions
// carry a day_date, one VEVENT is emitted per distinct day_date instead of
// one whole-tournament event — each group card's day chip links straight
// to its own day via ?date=YYYYMMDD. Divisions with no day_date are
// ignored for splitting; if none of them have a day_date, the route falls
// back to the original single whole-tournament VEVENT.
export const revalidate = 3600;

function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsDate(dateStr) {
  return dateStr.replaceAll("-", "");
}

// end_date is a plain "YYYY-MM-DD" date (no time zone) — add a day in UTC
// so the +1 never slips a day from a local-timezone parse.
function addDaysToDateString(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function icsTimestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Group divisions by day_date, joining the group names that share a date
// (alphabetically, so the join order is deterministic regardless of the
// grid's sort_order display order — e.g. "Men's & Women's").
function buildDayGroups(tournament) {
  const withDate = (tournament.divisions ?? []).filter((d) => d.day_date);
  const byDate = new Map();
  for (const d of withDate) {
    const label = d.display_name ?? d.name;
    if (!byDate.has(d.day_date)) byDate.set(d.day_date, []);
    const names = byDate.get(d.day_date);
    if (!names.includes(label)) names.push(label);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, names: names.sort((a, b) => a.localeCompare(b)) }));
}

function buildEvents(tournament) {
  const dayGroups = buildDayGroups(tournament);

  if (dayGroups.length === 0) {
    return [
      {
        uid: `${tournament.slug}@afa-southern-utah`,
        dtstart: toIcsDate(tournament.start_date),
        dtend: toIcsDate(addDaysToDateString(tournament.end_date, 1)),
        summary: tournament.name,
      },
    ];
  }

  return dayGroups.map(({ date, names }) => ({
    uid: `${tournament.slug}-${toIcsDate(date)}@afa-southern-utah`,
    dtstart: toIcsDate(date),
    dtend: toIcsDate(addDaysToDateString(date, 1)),
    summary: `${tournament.name} — ${names.join(" & ")}`,
  }));
}

export async function GET(request, { params }) {
  const { slug } = await params;
  const tournament = await getTournamentBasicsBySlug(slug);
  if (!tournament) {
    return new Response("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  let events = buildEvents(tournament);
  if (dateParam) {
    events = events.filter((e) => e.dtstart === dateParam);
    if (events.length === 0) {
      return new Response("Not found", { status: 404 });
    }
  }

  const location = icsEscape(
    [tournament.venue_name, tournament.venue_address].filter(Boolean).join(", ")
  );
  const dtstamp = icsTimestamp(new Date());

  const vevents = events.flatMap((e) => [
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${e.dtstart}`,
    `DTEND;VALUE=DATE:${e.dtend}`,
    `SUMMARY:${icsEscape(e.summary)}`,
    `LOCATION:${location}`,
    "END:VEVENT",
  ]);

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AFA Southern Utah//EN",
    ...vevents,
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${tournament.slug}.ics"`,
    },
  });
}
