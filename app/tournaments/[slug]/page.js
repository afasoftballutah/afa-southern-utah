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
// links law (afa-product-plan.md, "Contacts → text").
function smsHref(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `sms:${digits.length === 10 ? "+1" : "+"}${digits}`;
}

// The money line — one quiet fact line replacing the old <dl> entirely
// (dispatch-brief-4). Built from entry_fee_cents/deposit_cents/
// game_guarantee only; a missing part (and its separator) is omitted
// rather than left blank. "3GG"/"4GG" read out as words; any other value
// (a guarantee shape the league hasn't standardized on) renders verbatim.
function formatGuarantee(gg) {
  if (gg === "3GG") return "3-game guarantee";
  if (gg === "4GG") return "4-game guarantee";
  return gg;
}

function formatMoneyLine(tournament) {
  const parts = [];
  if (tournament.entry_fee_cents != null) parts.push(`${formatFee(tournament.entry_fee_cents)} entry`);
  if (tournament.deposit_cents != null) parts.push(`${formatFee(tournament.deposit_cents)} deposit`);
  if (tournament.game_guarantee) parts.push(formatGuarantee(tournament.game_guarantee));
  return parts.join(" · ");
}

export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const divisions = tournament.divisions ?? [];

  // THE GRID's cards — the existing division rows ARE the groups (Men's/
  // Women's/Coed) until real gender x division rows exist (dispatch-brief-4;
  // afa-product-plan.md "central insight"). Ordered by sort_order then name.
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
  const firstContact = contacts[0] ?? null;
  const firstContactSms = firstContact ? smsHref(firstContact.phone) : null;

  const directionsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${tournament.venue_name}, ${tournament.venue_address ?? ""}`
  )}`;
  const calendarHref = `/tournaments/${tournament.slug}/calendar.ics`;
  const dateRange = formatDateRange(tournament.start_date, tournament.end_date);
  const moneyLine = formatMoneyLine(tournament);

  const actionCount = firstContactSms ? 3 : 2;

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
        {moneyLine && <p className="text-sm text-afa-ink/80 mt-1">{moneyLine}</p>}
      </div>

      {/* Action row — facts that act (afa-product-plan.md, "Action links").
          Each fact has ONE text home on this page (JD ruling 2026-07-23,
          "facts once" — the poster is art, exempt): dates live under the
          name above; the VENUE's one home is the Directions card sub;
          phone numbers' one home is the Contacts block at the bottom, so
          Calendar and Text carry no repeating sub. */}
      <div className={`grid gap-2 ${actionCount === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        <Door
          href={directionsHref}
          title="Directions"
          sub={`${tournament.venue_name}${tournament.venue_address ? `, ${tournament.venue_address}` : ""}`}
        />
        <Door href={calendarHref} title="Calendar" sub="Add to your phone" />
        {firstContactSms && (
          <Door
            href={firstContactSms}
            title={`Text ${firstContact.name.split(" ")[0]}`}
            sub="Tournament director"
          />
        )}
      </div>

      {/* THE GRID — one card per group, carrying its day and its divisions
          (afa-product-plan.md "central insight"; dispatch-brief-4). Replaces
          BOTH the old "Divisions:" chip row and the "Brackets & Results"
          doors section. The whole card is the tap target down to that
          group's section below; the chips inside are structure, not links,
          until real gender x division rows exist. */}
      {groupCards.length > 0 && (
        <div className="space-y-3">
          {groupCards.map((division) => (
            <Link key={division.id} href={`#division-${division.id}`} className="block">
              <Card className="hover:border-afa-navy/50">
                <div className="flex items-center justify-between">
                  <p className="font-display text-lg text-afa-navy">
                    {division.display_name ?? division.name}
                  </p>
                  {division.day_label && <Chip variant="muted">{division.day_label}</Chip>}
                </div>
                {divisionChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {divisionChips.map((d) => (
                      <Chip key={d}>{d}</Chip>
                    ))}
                  </div>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Fine print — everything left with no other home on the page. The
          Open* asterisk in the chips above finds its answer in the first
          line here. */}
      {tournament.notes && (
        <div className="text-xs text-afa-ink/60 space-y-0.5">
          {tournament.notes.split(". ").map((line, i, arr) => {
            const text = line.trim();
            if (!text) return null;
            const withDot = i < arr.length - 1 && !text.endsWith(".") ? `${text}.` : text;
            return <p key={i}>{withDot}</p>;
          })}
        </div>
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

      {contacts.length > 0 && (
        <>
          <div className="chalk-line" />
          <div>
            <h2 className="text-lg font-bold text-afa-navy mb-2">Contacts</h2>
            <ul className="text-sm space-y-1">
              {contacts.map((c, i) => {
                const href = smsHref(c.phone);
                return (
                  <li key={i}>
                    {href ? (
                      <a href={href} className="flex items-center gap-1 min-h-11 py-1 hover:underline">
                        <span className="font-semibold">{c.name}</span>
                        {c.phone && <span className="text-afa-ink/70">— {c.phone}</span>}
                      </a>
                    ) : (
                      <>
                        {c.name}
                        {c.phone ? ` — ${c.phone}` : ""}
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
