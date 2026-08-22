import { Fragment } from "react";
import { notFound } from "next/navigation";
import {
  getTeamSummaries,
  getTournamentBySlug,
  getTournamentResults,
  isTournamentFinished,
  formatDateRange,
  formatFee,
  isRealPoster,
  isGroupName,
} from "@/lib/data";
import { isRegistrationOpen } from "@/lib/tournament-state";
import Link from "next/link";
import Poster from "@/components/ui/Poster";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import TournamentResults from "@/components/TournamentResults";
import TournamentTeamEntry from "@/components/TournamentTeamEntry";
import { groupDivisionsByGender } from "@/lib/division-layout";
import {
  listTournamentTeams,
  mergeTeamSummaries,
} from "@/lib/tournament-teams";

// Prizes read as a podium, not as prose (JD, 2026-07-26). The league
// writes them "1st place: custom jerseys", so the place comes out of the
// line and becomes a medal and a pill, leaving just the prize.
const MEDAL = { 1: "\u{1F3C6}", 2: "\u{1F948}", 3: "\u{1F949}" };

function parsePrize(line) {
  const m = /^(\d+)(?:st|nd|rd|th)\s+place\s*[:\u2013-]\s*(.+)$/i.exec(line.trim());
  if (!m) return { place: null, medal: null, text: line };
  const n = Number(m[1]);
  const suffix = n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return {
    place: `${n}${suffix}`,
    medal: MEDAL[n] ?? "\u{1F396}\uFE0F",
    text: m[2].replace(/\.$/, ""),
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


export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  // No event poster yet → not a public lobby (still in DB / greyed on list).
  // Finished events with results can stay viewable even if poster was a schedule.
  const finishedEarly = isTournamentFinished(tournament);
  if (!isRealPoster(tournament) && !finishedEarly) {
    return (
      <div className="form-surface p-6 text-center space-y-3 max-w-lg mx-auto">
        <h1 className="t-title">{tournament.name}</h1>
        <p className="t-meta">
          {formatDateRange(tournament.start_date, tournament.end_date)}
          {tournament.venue_name ? ` · ${tournament.venue_name}` : ""}
        </p>
        <p className="t-strong">Details coming soon</p>
        <p className="t-meta">
          This tournament is on the calendar. The full page and registration
          open when the flyer is posted.
        </p>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Link href="/tournaments" className="btn-transient">
            All tournaments
          </Link>
          <span
            className="btn-action opacity-40 pointer-events-none select-none"
            aria-disabled="true"
            title="Registration opens when the tournament flyer is posted"
          >
            Register
          </span>
        </div>
      </div>
    );
  }

  const [teamSummariesRaw, registeredTeams] = await Promise.all([
    getTeamSummaries(tournament),
    listTournamentTeams(tournament),
  ]);
  const teamSummaries = mergeTeamSummaries(teamSummariesRaw, registeredTeams);
  const finished = isTournamentFinished(tournament);
  const tournamentResults = finished ? await getTournamentResults(tournament) : [];

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

  const registrationOpen =
    isRegistrationOpen(tournament) && isRealPoster(tournament);

  return (
    <div className="space-y-6">
      <Poster
        posterUrl={isRealPoster(tournament) ? tournament.poster_url : null}
        name={tournament.name}
        className="max-w-md mx-auto"
      />

      <div className="text-center">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <h1 className="t-title">{tournament.name}</h1>
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
        <p className="t-meta mt-1">
          {tournament.venue_name && (
            <>
              <a href={directionsHref} className="text-afa-navy underline decoration-afa-navy/30 underline-offset-2">
                {tournament.venue_name}
              </a>
              <span aria-hidden="true" className="px-2 text-afa-muted">
                |
              </span>
            </>
          )}
          <a href={`/tournaments/${tournament.slug}/calendar.ics`} className="text-afa-navy underline decoration-afa-navy/30 underline-offset-2">
            {dateRange}
          </a>
        </p>
        {tournament.is_placeholder && (
          <p className="text-sm text-afa-ink/60 mt-1">
            Shown for reference — not a confirmed date.
          </p>
        )}
      </div>

      <TournamentTeamEntry
        slug={tournament.slug}
        columns={groupDivisionsByGender(groupCards)}
        teamSummaries={teamSummaries}
        teams={registeredTeams}
        registrationOpen={registrationOpen}
        registerHref={`/register?tournament=${encodeURIComponent(tournament.slug)}`}
        externalRegisterUrl={tournament.registration_url || null}
        finished={finished}
      />

      {finished && tournamentResults.length > 0 ? (
        <TournamentResults
          results={tournamentResults}
          slug={tournament.slug}
        />
      ) : null}

      {/* Specifics — organized, on-brand (dispatch-brief-6, JD ruling):
          three sub-sections instead of one free-floating notes column.
          Omitted entirely if every part is empty. */}
      {hasSpecifics && (
        <Card>
          <h2 className="t-heading">Specifics</h2>

          {numberRows.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3">
                {numberRows.map(([label, value]) => (
                  <Fragment key={label}>
                    <span className="t-strong">{label}</span>
                    <span className="t-body">{value}</span>
                  </Fragment>
                ))}
              </div>
            </>
          )}

          {divisionNotesLines.length > 0 && (
            <>
              <h3 className="t-label mt-3 first:mt-0">
                Divisions
              </h3>
              <div className="t-body space-y-1">
                {divisionNotesLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}

          {prizesLines.length > 0 && (
            /* No "Prizes" label: a trophy and a "1st" pill say it, and the
               line keeps only the prize itself. */
            <div className="mt-3 space-y-2">
              {prizesLines.map((line, i) => {
                const { place, medal, text } = parsePrize(line);
                return (
                  /* Every part of the row sits in a box of the SAME
                     height and is centred in it, so the emoji, the pill
                     and the text share one baseline. An emoji has its own
                     ideas about line-height, which is why they were
                     riding at three different levels (JD, 2026-07-26). */
                  <div key={i} className="flex items-center gap-2">
                    {medal && (
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 shrink-0 items-center justify-center text-base leading-none"
                      >
                        {medal}
                      </span>
                    )}
                    {place && (
                      <span className="t-label flex h-6 shrink-0 items-center rounded-full bg-afa-navy/[0.07] px-2">
                        {place}
                      </span>
                    )}
                    <span className="t-body flex min-w-0 items-center">{text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {specialRulesLines.length > 0 && (
            <>
              <h3 className="t-label mt-3 first:mt-0">
                Tournament rules
              </h3>
              <div className="t-body space-y-1">
                {specialRulesLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {tournament.fb_album_url && (
        <Card className="space-y-2">
          <h2 className="t-heading">Photos</h2>
          <a
            href={tournament.fb_album_url}
            target="_blank"
            rel="noopener"
            className="btn-quiet"
          >
            Facebook album
          </a>
        </Card>
      )}

      {contacts.length > 0 && (
        <Card className="space-y-3">
          <h2 className="t-heading">Contacts</h2>
          <div className="space-y-2">
            {contacts.map((c, i) => {
              const sms = smsHref(c.phone);
              const tel = telHref(c.phone);
              // Name over number as a two-line block, buttons centred
              // against it (JD, 2026-07-24). Name and number on one line
              // made row height depend on name length — Joey's wrapped,
              // Frank's didn't, and the two rows stopped rhyming.
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="t-strong truncate">{c.name}</p>
                    {c.phone && <p className="t-meta">{c.phone}</p>}
                  </div>
                  {sms && tel && (
                    <div className="flex items-center gap-2 shrink-0">
                      <a href={sms} className="btn-quiet">
                        Text
                      </a>
                      <a href={tel} className="btn-quiet">
                        Call
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
