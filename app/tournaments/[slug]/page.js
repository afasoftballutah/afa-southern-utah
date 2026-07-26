import { Fragment } from "react";
import { LEAGUE_TZ } from "@/lib/bracket/tree";
import { notFound } from "next/navigation";
import {
  getRecentScores,
  getUpcomingGames,
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
import GameFeed from "@/components/GameFeed";

// Where and when, split so a list of games lines up in columns.
function whenParts(scheduledTime) {
  if (!scheduledTime) return { whenDay: "", whenTime: "TBD" };
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: LEAGUE_TZ,
  }).formatToParts(new Date(scheduledTime));
  const get = (t) => parts.find((x) => x.type === t)?.value ?? "";
  const min = get("minute");
  return {
    whenDay: get("weekday"),
    whenTime: `${get("hour")}${min !== "00" ? ":" + min : ""} ${get("dayPeriod")}`,
  };
}

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


// Registration block (dispatch-brief-20) — true once registration_closes
// is strictly before today. Page is ISR (revalidate = 30 above), so this
// re-evaluates on every regeneration rather than freezing at build time.
function isDateInPast(dateStr) {
  if (!dateStr) return false;
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

// Hostname only, for the "Register" door's sub-line (dispatch-brief-20) —
// falls back to the raw URL if it somehow isn't parseable.
function registrationHostname(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  // Recent scores live here now, not on the front page (JD, 2026-07-26).
  // A game belongs to a tournament; a list of them a mile from anything
  // that named it was the wrong home. Scoped to THIS tournament's
  // divisions rather than the league.
  const divisionIds = (tournament.divisions ?? []).map((d) => d.id);
  const [recentScores, upcomingGames] = await Promise.all([
    getRecentScores(8, divisionIds),
    getUpcomingGames(8, divisionIds),
  ]);
  const withWhen = (list) => list.map((g) => ({ ...g, ...whenParts(g.scheduledTime) }));

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
  const prizesLines = splitSentences(tournament.prizes);
  const specialRulesLines = splitSentences(tournament.special_rules);
  const hasSpecifics =
    numberRows.length > 0 ||
    divisionNotesLines.length > 0 ||
    prizesLines.length > 0 ||
    specialRulesLines.length > 0;

  // Registration block (dispatch-brief-20) — renders only when at least one
  // field is set. St. George City runs registration for this tournament
  // (registration_url), not this site's own form.
  const hasRegistrationBlock = Boolean(
    tournament.registration_closes || tournament.registration_url || tournament.registration_note
  );
  const registrationClosed = isDateInPast(tournament.registration_closes);
  const registrationClosedDateText = tournament.registration_closes
    ? formatDateRange(tournament.registration_closes, tournament.registration_closes)
    : null;
  const registrationHost = registrationHostname(tournament.registration_url);

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
        {/* The calendar link lives on the DATES now (JD, 2026-07-26). It
            used to sit on the right of each group card, in the spot that
            reads like the way through to that group's games — so people
            tapped it expecting a schedule and got a download. */}
        {/* Two facts, each of which is also the thing you would do with
            it (JD, 2026-07-26): the fields take you to directions, the
            dates put the tournament in your calendar. The separate
            Directions door below is gone — this IS it. */}
        <p className="text-sm text-afa-ink/70 mt-1">
          {tournament.venue_name && (
            <>
              <a href={directionsHref} className="underline text-afa-navy">
                {tournament.venue_name}
              </a>
              <span aria-hidden="true" className="px-2 text-afa-ink/30">
                |
              </span>
            </>
          )}
          <a href={`/tournaments/${tournament.slug}/calendar.ics`} className="underline text-afa-navy">
            {dateRange}
          </a>
        </p>
        {tournament.is_placeholder && (
          <p className="text-sm text-afa-ink/60 mt-1">
            Shown for reference — not a confirmed date.
          </p>
        )}
      </div>

      {/* THE GRID — one card per group, carrying its day (now a calendar
          link) and its divisions (afa-product-plan.md "central insight";
          dispatch-brief-4/5). Each card is a Card (div) holding TWO
          separate anchors, never a link inside a link: the main area
          jumps to the group's section below; the right side is ONE
          compact bordered date-card unit (day_label + "Add to calendar"),
          one object, one tap, that IS the calendar link (JD ruling,
          2026-07-23). */}
      {/* ONE group means the card IS "My Team" — a heading over a single
          card named "Coed" was two labels for one door (JD, 2026-07-26).
          Several groups keep their own names under the heading, because
          then the name is the thing you are choosing between. */}
      {groupCards.length > 0 && (
        <div className="space-y-3">
          {groupCards.length > 1 && (
            <div>
              <h2 className="text-lg font-bold text-afa-navy">My Team</h2>
              <p className="text-sm text-afa-ink/70">Schedule and tournament updates</p>
            </div>
          )}
          {groupCards.map((division) => (
            <Card key={division.id} className="hover:border-afa-navy/50">
              <div className="flex items-center gap-3">
                <Link
                  href={`/tournaments/${tournament.slug}/division/${division.id}`}
                  className="group flex-1 min-h-11"
                >
                  <p className="font-display text-lg text-afa-navy group-hover:underline">
                    {groupCards.length > 1
                      ? (division.display_name ?? division.name)
                      : "My Team"}
                  </p>
                  <p className="text-xs text-afa-ink/60 mt-0.5">
                    Schedule and tournament updates
                  </p>
                  {divisionChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {divisionChips.map((d) => (
                        <Chip key={d}>{d}</Chip>
                      ))}
                    </div>
                  )}
                </Link>
                {division.day_label && (
                  <div className="flex flex-col justify-center rounded border border-afa-navy/25 bg-white px-2.5 py-1.5 text-right min-h-11">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-afa-navy">
                      {division.day_label}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* The games, in place of the "See Full Schedule" door (JD,
          2026-07-26). A door to a list is a worse answer than the list. */}
      {(recentScores.length > 0 || upcomingGames.length > 0) && (
        <GameFeed results={withWhen(recentScores)} upcoming={withWhen(upcomingGames)} />
      )}

      {/* Registration (dispatch-brief-20) — sits directly below the action-
          row doors. St. George City runs registration for this tournament,
          not this site, so there's no site-side form to link to: closed,
          it's a plain dated line (font-bold, muted, NOT a link, NOT red) so
          a late arrival reads "closed" rather than "broken link"; open, it
          points out to the city's page. No red here — the home page's
          site-wide "Register a Team" button is untouched and out of scope. */}
      {hasRegistrationBlock && (
        <div>
          <h2 className="text-lg font-bold text-afa-navy mb-2">Registration</h2>
          <Card>
            {registrationClosed ? (
              <>
                <p className="font-bold text-afa-ink/60">
                  Registration closed {registrationClosedDateText}
                </p>
                {tournament.registration_url && (
                  <a
                    href={tournament.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-afa-navy text-sm mt-2 inline-block"
                  >
                    {tournament.registration_url}
                  </a>
                )}
                {tournament.registration_note && (
                  <p className="text-sm text-afa-ink/70 mt-2">{tournament.registration_note}</p>
                )}
              </>
            ) : (
              tournament.registration_url && (
                <>
                  <a
                    href={tournament.registration_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block min-h-11 hover:opacity-80"
                  >
                    <p className="font-bold text-afa-navy">Register</p>
                    <p className="text-xs text-afa-ink/60 mt-1">{registrationHost}</p>
                  </a>
                  {tournament.registration_note && (
                    <p className="text-sm text-afa-ink/70 mt-2">{tournament.registration_note}</p>
                  )}
                </>
              )
            )}
          </Card>
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

          {prizesLines.length > 0 && (
            <>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-afa-muted mt-3 first:mt-0">
                Prizes
              </h3>
              <div className="text-sm space-y-1">
                {prizesLines.map((line, i) => (
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
                  // Name over number as a two-line block, buttons centered
                  // against it (JD, 2026-07-24). Name and number on one line
                  // made row height depend on name length — Joey's wrapped,
                  // Frank's didn't, and the two rows stopped rhyming. Stacked,
                  // every contact row is the same shape regardless of name.
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-afa-navy truncate">{c.name}</p>
                        {c.phone && (
                          <p className="text-sm text-afa-ink/70">{c.phone}</p>
                        )}
                      </div>
                      {sms && tel && (
                        <div className="flex items-center gap-2 shrink-0">
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
