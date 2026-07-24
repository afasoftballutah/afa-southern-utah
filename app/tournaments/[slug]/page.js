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

// Division doors get the font-display treatment (Anton allow-list:
// tournament names, region/month headers, division door titles —
// dispatch-brief-3 Hard Boundaries). A local variant rather than editing
// the shared Door component, which stays plain everywhere else it's used
// (Home's Schedules/Rules doors are not on that allow-list).
function DivisionDoor({ href, title, sub }) {
  return (
    <Link href={href} className="block min-h-11">
      <Card className="h-full hover:border-afa-navy/50">
        <p className="font-display text-afa-navy">{title}</p>
        {sub && <p className="text-xs text-afa-ink/60 mt-1">{sub}</p>}
      </Card>
    </Link>
  );
}

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `${tournament.name} — AFA Southern Utah` : "Tournament" };
}

// Group headers, Men's/Women's/Coed in that order when gender is set;
// anything without a gender falls under one "Divisions" group (data
// reality, dispatch-brief-3 — every existing row is unparsed today, so
// this collapses to a single "Divisions" group until gender/class_id get
// populated in a later phase).
const GENDER_LABEL = { mens: "Men's", womens: "Women's", coed: "Coed" };
const GENDER_ORDER = ["mens", "womens", "coed"];

function groupDivisions(divisions) {
  const byGender = new Map();
  const ungrouped = [];
  for (const d of divisions) {
    if (d.gender && GENDER_LABEL[d.gender]) {
      if (!byGender.has(d.gender)) byGender.set(d.gender, []);
      byGender.get(d.gender).push(d);
    } else {
      ungrouped.push(d);
    }
  }
  const groups = GENDER_ORDER.filter((g) => byGender.has(g)).map((g) => ({
    label: GENDER_LABEL[g],
    divisions: byGender.get(g),
  }));
  if (ungrouped.length > 0) groups.push({ label: "Divisions", divisions: ungrouped });
  return groups;
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

export default async function TournamentDetailPage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const divisions = tournament.divisions ?? [];
  const dividedGroups = groupDivisions(divisions);
  const contacts = Array.isArray(tournament.contacts) ? tournament.contacts : [];
  const firstContact = contacts[0] ?? null;
  const firstContactSms = firstContact ? smsHref(firstContact.phone) : null;

  const directionsHref = `https://maps.google.com/?q=${encodeURIComponent(
    `${tournament.venue_name}, ${tournament.venue_address ?? ""}`
  )}`;
  const calendarHref = `/tournaments/${tournament.slug}/calendar.ics`;
  const dateRange = formatDateRange(tournament.start_date, tournament.end_date);

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
        {tournament.is_placeholder && (
          <p className="text-sm text-afa-ink/60 mt-1">
            Shown for reference — last year&rsquo;s poster, not a live date.
          </p>
        )}
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

      {/* Facts said nowhere else: money and the guarantee. Dates, venue,
          and divisions have their single homes elsewhere on the page. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {tournament.entry_fee_cents != null && (
          <>
            <dt className="font-semibold">Entry Fee</dt>
            <dd>{formatFee(tournament.entry_fee_cents)}</dd>
          </>
        )}
        {tournament.deposit_cents != null && (
          <>
            <dt className="font-semibold">Deposit</dt>
            <dd>{formatFee(tournament.deposit_cents)}</dd>
          </>
        )}
        {tournament.game_guarantee && (
          <>
            <dt className="font-semibold">Game Guarantee</dt>
            <dd>{tournament.game_guarantee}</dd>
          </>
        )}
        {tournament.fb_album_url && (
          <>
            <dt className="font-semibold">Photos</dt>
            <dd>
              <a
                href={tournament.fb_album_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-afa-navy"
              >
                Facebook album
              </a>
            </dd>
          </>
        )}
      </dl>

      {tournament.notes && (
        <div className="text-sm text-afa-ink/80 space-y-1">
          {tournament.notes.split(". ").map((line, i, arr) => {
            const text = line.trim();
            if (!text) return null;
            const withDot = i < arr.length - 1 && !text.endsWith(".") ? `${text}.` : text;
            return <p key={i}>{withDot}</p>;
          })}
        </div>
      )}

      {dividedGroups.length > 0 && (
        <>
          <div className="chalk-line" />
          {/* The divisions offered (Rec/E/D/Open…) — vocabulary law: these
              are the DIVISIONS; Men's/Women's/Coed are groups. Chips are
              this fact's one home on the page. */}
          {tournament.divisions_offered && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-afa-navy mr-1">Divisions:</span>
              {tournament.divisions_offered.split(",").map((d) => (
                <Chip key={d.trim()}>{d.trim()}</Chip>
              ))}
            </div>
          )}
          <div className="space-y-4">
            {dividedGroups.map((group) => (
              <div key={group.label}>
                <h2 className="font-display text-lg text-afa-navy/80 mb-2">{group.label}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {group.divisions.map((division) => (
                    <DivisionDoor
                      key={division.id}
                      href={`#division-${division.id}`}
                      title={division.display_name ?? division.name}
                      sub={hasBracketContent(division) ? "Bracket & results" : "Coming with the bracket"}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
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
