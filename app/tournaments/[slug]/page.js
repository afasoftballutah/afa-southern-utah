import { notFound } from "next/navigation";
import {
  getTournamentBySlug,
  formatDateRange,
  formatFee,
  isRealPoster,
} from "@/lib/data";
import Link from "next/link";
import Poster from "@/components/ui/Poster";
import Door from "@/components/ui/Door";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import BracketTree from "@/components/bracket/BracketTree";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `${tournament.name} — AFA Southern Utah` : "Tournament" };
}

function hasBracketContent(division) {
  return (division.brackets ?? []).length > 0;
}

// Strip non-digits, prepend +1 for a plain 10-digit US number — action
// links law (afa-product-plan.md, "Contacts → text/call").
function phoneHref(scheme, phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `${scheme}:${digits.length === 10 ? "+1" : "+"}${digits}`;
}
function smsHref(phone) {
  return phoneHref("sms", phone);
}
function telHref(phone) {
  return phoneHref("tel", phone);
}

// "3GG"/"4GG" read out as words; any other value (a guarantee shape the
// league hasn't standardized on) renders verbatim.
function formatGuarantee(gg) {
  if (gg === "3GG") return "3-game guarantee";
  if (gg === "4GG") return "4-game guarantee";
  return gg;
}

// The Specifics card's money lines — entry/deposit/guarantee, each its own
// line (dispatch-brief-5; was one joined line, formatMoneyLine, before).
// A missing part is simply omitted, not left blank.
function formatMoneyParts(tournament) {
  const parts = [];
  if (tournament.entry_fee_cents != null) parts.push(`${formatFee(tournament.entry_fee_cents)} entry`);
  if (tournament.deposit_cents != null) parts.push(`${formatFee(tournament.deposit_cents)} deposit`);
  if (tournament.game_guarantee) parts.push(formatGuarantee(tournament.game_guarantee));
  return parts;
}

// Notes split into sentences (unchanged split logic), returned as plain
// lines for the Specifics card rather than rendered here directly.
function formatNotesLines(notes) {
  if (!notes) return [];
  return notes
    .split(". ")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, i, arr) => (i < arr.length - 1 && !text.endsWith(".") ? `${text}.` : text));
}

function calendarHrefForDivision(slug, dayDate) {
  if (!dayDate) return null;
  return `/tournaments/${slug}/calendar.ics?date=${dayDate.replaceAll("-", "")}`;
}

export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const divisions = tournament.divisions ?? [];

  // THE GRID's cards — the existing division rows ARE the groups (Men's/
  // Women's/Coed) until real gender x division rows exist (dispatch-brief-4;
  // afa-product-plan.md "central insight"). Ordered by sort_order then name
  // — JD ruling 2026-07-23: Women's, Men's, Coed (sort_order 10/20/30).
  const groupCards = [...divisions].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
  });
  // The tournament's divisions offered (Rec/E/D/Open…) — vocabulary law:
  // these are the DIVISIONS; Men's/Women's/Coed are groups. Same set on
  // every group card today (divisions spec not yet per-group).
  const divisionChips = tournament.divisions_offered
    ? tournament.divisions_offered.split(",").map((d) => d.trim()).filter(Boolean)
    : [];

  const contacts = Array.isArray(tournament.contacts) ? tournament.contacts : [];

  const directionsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${tournament.venue_name}, ${tournament.venue_address ?? ""}`
  )}`;
  const dateRange = formatDateRange(tournament.start_date, tournament.end_date);

  const moneyParts = formatMoneyParts(tournament);
  const noteLines = formatNotesLines(tournament.notes);
  const hasSpecifics = moneyParts.length > 0 || noteLines.length > 0;

  return (
    <div className="space-y-6">
      <Poster
        posterUrl={isRealPoster(tournament) ? tournament.poster_url : null}
        name={tournament.name}
        className="max-w-md mx-auto"
      />

      <div className="text-center">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <h1 className="font-display text-3xl text-afa-navy">{tournament.name}</h1>
          {tournament.status === "complete" && <Chip variant="muted">Final</Chip>}
        </div>
        <p className="text-sm text-afa-ink/70 mt-1">{dateRange}</p>
        {tournament.is_placeholder && (
          <p className="text-sm text-afa-ink/60 mt-1">
            Shown for reference — not a confirmed date.
          </p>
        )}
      </div>

      {/* Action row — facts that act (afa-product-plan.md, "Action links").
          Directions only (JD ruling 2026-07-23): Text moved to Contacts at
          the bottom, away from accidental thumbs; Calendar moved onto the
          group cards below (one Door per group's day, not one whole-
          tournament Door here). */}
      <div>
        <Door
          href={directionsHref}
          title="Directions"
          sub={`${tournament.venue_name}${tournament.venue_address ? `, ${tournament.venue_address}` : ""}`}
        />
      </div>

      {/* THE GRID — one card per group, carrying its day (now a calendar
          link) and its divisions (afa-product-plan.md "central insight";
          dispatch-brief-4/5). Each card is a Card (div) holding TWO
          separate anchors, never a link inside a link: the main area
          jumps to the group's section below; the right side is ONE
          compact bordered date-card unit (day_label + "Add to calendar"),
          one object, one tap, that IS the calendar link (JD ruling,
          2026-07-23). */}
      {groupCards.length > 0 && (
        <div className="space-y-3">
          {groupCards.map((division) => {
            const calendarHref = calendarHrefForDivision(tournament.slug, division.day_date);
            return (
              <Card key={division.id} className="hover:border-afa-navy/50">
                <div className="flex items-center gap-3">
                  <Link href={`#division-${division.id}`} className="group flex-1 min-h-11">
                    <p className="font-display text-lg text-afa-navy group-hover:underline">
                      {division.display_name ?? division.name}
                    </p>
                    {divisionChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {divisionChips.map((d) => (
                          <Chip key={d}>{d}</Chip>
                        ))}
                      </div>
                    )}
                  </Link>
                  {division.day_label &&
                    (calendarHref ? (
                      <a
                        href={calendarHref}
                        className="flex flex-col justify-center rounded border border-afa-navy/25 bg-white px-2.5 py-1.5 text-right hover:border-afa-navy/60 min-h-11"
                      >
                        <span className="text-[11px] font-bold uppercase tracking-wide text-afa-navy">
                          {division.day_label}
                        </span>
                        <span className="text-[10px] text-afa-muted">Add to calendar</span>
                      </a>
                    ) : (
                      <div className="flex flex-col justify-center rounded border border-afa-navy/25 bg-white px-2.5 py-1.5 text-right min-h-11">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-afa-navy">
                          {division.day_label}
                        </span>
                      </div>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Specifics — the one home for money facts and operational fine
          print (dispatch-brief-5). Omitted entirely if every part is
          empty. */}
      {hasSpecifics && (
        <Card>
          <h2 className="font-bold text-afa-navy mb-2">Specifics</h2>
          <div className="text-sm space-y-1">
            {moneyParts.map((part, i) => (
              <p key={`money-${i}`}>{part}</p>
            ))}
            {noteLines.map((line, i) => (
              <p key={`note-${i}`}>{line}</p>
            ))}
          </div>
        </Card>
      )}

      {divisions.map((division) => {
        const renderedName = division.display_name ?? division.name;
        const placements = division.placements ?? [];
        const hasPlacements = placements.length > 0;
        const hasBracket = hasBracketContent(division);
        return (
          <div key={division.id} id={`division-${division.id}`} className="scroll-mt-20">
            <div className="chalk-line" />
            <h3 className="font-semibold text-lg text-afa-navy mb-3">{renderedName}</h3>

            {hasPlacements && (
              <div className="chalk-panel mb-6">
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
              </div>
            )}

            {hasBracket && <BracketTree division={division} />}

            {!hasPlacements && !hasBracket && (
              <p className="text-afa-ink/70 text-sm">
                No results yet — check back after the bracket is set.
              </p>
            )}
          </div>
        );
      })}

      {tournament.fb_album_url && (
        <>
          <div className="chalk-line" />
          <div>
            <h2 className="text-lg font-bold text-afa-navy mb-2">Photos</h2>
            <a
              href={tournament.fb_album_url}
              target="_blank"
              rel="noopener"
              className="underline text-afa-navy"
            >
              Facebook album
            </a>
          </div>
        </>
      )}

      {contacts.length > 0 && (
        <>
          <div className="chalk-line" />
          <div>
            <h2 className="text-lg font-bold text-afa-navy mb-2">Contacts</h2>
            <ul className="text-sm space-y-1">
              {contacts.map((c, i) => {
                const sms = smsHref(c.phone);
                const tel = telHref(c.phone);
                return (
                  <li key={i} className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{c.name}</span>
                    {sms && tel && (
                      <>
                        <a
                          href={sms}
                          className="min-h-11 flex items-center text-afa-navy underline"
                        >
                          Text
                        </a>
                        <span className="text-afa-muted">|</span>
                        <a
                          href={tel}
                          className="min-h-11 flex items-center text-afa-navy underline"
                        >
                          Call
                        </a>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
