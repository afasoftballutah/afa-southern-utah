import { Fragment } from "react";
import { notFound } from "next/navigation";
import {
  getTournamentBySlug,
  formatDateRange,
  formatFee,
  isRealPoster,
  isGroupName,
} from "@/lib/data";
import Link from "next/link";
import Poster from "@/components/ui/Poster";
import Door from "@/components/ui/Door";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `${tournament.name} — AFA Southern Utah` : "Tournament" };
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
  if (gg === "3GG") return "3 games";
  if (gg === "4GG") return "4 games";
  return gg;
}

// Specifics "The numbers" grid — label/value pairs, only what's present
// (dispatch-brief-6, TASK B.4 — replaces the earlier joined money line).
function buildNumberRows(tournament) {
  const rows = [];
  if (tournament.entry_fee_cents != null) rows.push(["Entry fee", formatFee(tournament.entry_fee_cents)]);
  if (tournament.deposit_cents != null) rows.push(["Deposit", formatFee(tournament.deposit_cents)]);
  if (tournament.ump_fee_cents != null) rows.push(["Ump fees", `${formatFee(tournament.ump_fee_cents)} per game`]);
  if (tournament.game_guarantee) rows.push(["Guarantee", formatGuarantee(tournament.game_guarantee)]);
  return rows;
}

// Sentence split (unchanged split logic) — shared by division_notes and
// special_rules, each rendered as its own Specifics sub-section.
function splitSentences(text) {
  if (!text) return [];
  return text
    .split(". ")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, i, arr) => (i < arr.length - 1 && !line.endsWith(".") ? `${line}.` : line));
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
  // Only top-level divisions get a card. Bracket stages (Coed E's Gold and
  // Silver) are CHILDREN — they're what a division becomes after pool play,
  // not peers of it (JD ruling 2026-07-24). They surface inside their
  // parent's page, never as more cards here.
  const groupCards = divisions
    .filter((d) => !d.parent_division_id)
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return (a.display_name ?? a.name).localeCompare(b.display_name ?? b.name);
    });
  // The tournament's divisions offered (Rec/E/D/Open…) — vocabulary law:
  // these are the DIVISIONS; Men's/Women's/Coed are groups. Same set on
  // every group card today (divisions spec not yet per-group).
  // Chips are the DIVISIONS (Rec/E/D/Open...). Entries that are really
  // group names are dropped — the card title already says the group, and
  // repeating it as a chip is the double-speak JD killed on the list page.
  const divisionChips = (tournament.divisions_offered
    ? tournament.divisions_offered.split(",").map((d) => d.trim()).filter(Boolean)
    : []
  ).filter((d) => !isGroupName(d));

  const contacts = Array.isArray(tournament.contacts) ? tournament.contacts : [];

  const directionsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${tournament.venue_name}, ${tournament.venue_address ?? ""}`
  )}`;
  const dateRange = formatDateRange(tournament.start_date, tournament.end_date);

  const numberRows = buildNumberRows(tournament);
  const divisionNotesLines = splitSentences(tournament.division_notes);
  const specialRulesLines = splitSentences(tournament.special_rules);
  const hasSpecifics =
    numberRows.length > 0 || divisionNotesLines.length > 0 || specialRulesLines.length > 0;

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
                  <Link
                    href={`/tournaments/${tournament.slug}/division/${division.id}`}
                    className="group flex-1 min-h-11"
                  >
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

      {/* Specifics — organized, on-brand (dispatch-brief-6, JD ruling):
          three sub-sections instead of one free-floating notes column.
          Omitted entirely if every part is empty. */}
      {hasSpecifics && (
        <Card>
          <h2 className="font-display text-lg text-afa-navy">Specifics</h2>

          {numberRows.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-3">
                {numberRows.map(([label, value]) => (
                  <Fragment key={label}>
                    <span className="font-semibold">{label}</span>
                    <span>{value}</span>
                  </Fragment>
                ))}
              </div>
            </>
          )}

          {divisionNotesLines.length > 0 && (
            <>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-afa-muted mt-3 first:mt-0">
                Divisions
              </h3>
              <div className="text-sm space-y-1">
                {divisionNotesLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}

          {specialRulesLines.length > 0 && (
            <>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-afa-muted mt-3 first:mt-0">
                Tournament rules
              </h3>
              <div className="text-sm space-y-1">
                {specialRulesLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

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
            <Card>
              <div className="space-y-2">
                {contacts.map((c, i) => {
                  const sms = smsHref(c.phone);
                  const tel = telHref(c.phone);
                  const buttonClass =
                    "rounded border border-afa-navy/25 bg-white px-3 py-2 text-sm font-bold text-afa-navy hover:border-afa-navy/60 min-h-11 flex items-center";
                  return (
                    <div key={i} className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-afa-navy min-w-fit">{c.name}</span>
                      {c.phone && <span className="text-sm text-afa-ink/70">{c.phone}</span>}
                      {sms && tel && (
                        <div className="ml-auto flex items-center gap-2">
                          <a href={sms} className={buttonClass}>
                            Text
                          </a>
                          <a href={tel} className={buttonClass}>
                            Call
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
