import { getTournamentBasicsBySlug } from "@/lib/data";

// Dates (action links, dispatch-brief-3): hand-rolled ICS, no dependency.
// All-day event — DTEND is the RFC 5545 exclusive end date, so a
// same-day or multi-day tournament always shows through its last day.
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

export async function GET(_request, { params }) {
  const { slug } = await params;
  const tournament = await getTournamentBasicsBySlug(slug);
  if (!tournament) {
    return new Response("Not found", { status: 404 });
  }

  const location = icsEscape(
    [tournament.venue_name, tournament.venue_address].filter(Boolean).join(", ")
  );
  const dtstart = toIcsDate(tournament.start_date);
  const dtend = toIcsDate(addDaysToDateString(tournament.end_date, 1));
  const dtstamp = icsTimestamp(new Date());

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AFA Southern Utah//EN",
    "BEGIN:VEVENT",
    `UID:${tournament.slug}@afa-southern-utah`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${icsEscape(tournament.name)}`,
    `LOCATION:${location}`,
    "END:VEVENT",
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
