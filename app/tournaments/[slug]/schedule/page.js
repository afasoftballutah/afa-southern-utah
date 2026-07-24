import { notFound } from "next/navigation";
import Link from "next/link";
import { getTournamentBySlug, getTournamentSchedule } from "@/lib/data";
import { formatFieldTime } from "@/lib/bracket/tree";
import Chip from "@/components/ui/Chip";

export const revalidate = 30;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  return { title: tournament ? `Schedule — ${tournament.name}` : "Schedule" };
}

// Field bucketing for "natural" order (dispatch-brief-11, JD's "what's on
// Field 6?" use case): numbered fields sort by their digits (Field 10
// after Field 9, never lexically between Field 1 and Field 2), a field
// string with no digits sorts after every numbered field, and games with
// no field at all land in a final "Field TBD" bucket. One tuple per
// bucket so a single sort covers all three tiers.
function fieldSortKey(field) {
  if (!field) return [2, 0, ""];
  const match = field.match(/\d+/);
  if (match) return [0, parseInt(match[0], 10), field];
  return [1, 0, field];
}

function compareFieldGroups(a, b) {
  const ka = fieldSortKey(a.field);
  const kb = fieldSortKey(b.field);
  if (ka[0] !== kb[0]) return ka[0] - kb[0];
  if (ka[1] !== kb[1]) return ka[1] - kb[1];
  return ka[2].localeCompare(kb[2]);
}

function groupByField(rows) {
  const byField = new Map();
  for (const row of rows) {
    const key = row.field || null;
    if (!byField.has(key)) byField.set(key, []);
    byField.get(key).push(row);
  }
  return [...byField.entries()]
    .map(([field, games]) => ({
      field,
      heading: field ?? "Field TBD",
      // Chronological within the field — null scheduled_time (a bracket
      // slot not yet timed) sorts to the end rather than crashing the
      // comparison or floating to the top as an epoch-zero "earliest" game.
      games: [...games].sort((x, y) => {
        const tx = x.scheduledTime ? new Date(x.scheduledTime).getTime() : Infinity;
        const ty = y.scheduledTime ? new Date(y.scheduledTime).getTime() : Infinity;
        return tx - ty;
      }),
    }))
    .sort(compareFieldGroups);
}

function GameRow({ row }) {
  // Reuse formatFieldTime (lib/bracket/tree.js) for the weekday+time string
  // in the league's Mountain zone — pass no `field` key so it returns just
  // the date/time half, since the field is already this section's heading.
  const timeLabel = formatFieldTime({ scheduled_time: row.scheduledTime });
  const team1 = row.team1 ?? "TBD";
  const team2 = row.team2 ?? "TBD";
  const isTie = row.isFinal && row.score1 === row.score2;
  const team1Won = row.isFinal && !isTie && row.score1 > row.score2;
  const team2Won = row.isFinal && !isTie && row.score2 > row.score1;

  return (
    <div className="py-2 text-sm">
      <p>
        {timeLabel && <span className="font-semibold text-afa-navy">{timeLabel}</span>}
        <span className="text-afa-ink/60"> · {row.divisionName} · {row.label}</span>
      </p>
      <p>
        {row.isFinal ? (
          <>
            <span className={team1Won ? "font-semibold" : ""}>
              {team1} {row.score1}
            </span>
            {", "}
            <span className={team2Won ? "font-semibold" : ""}>
              {team2} {row.score2}
            </span>
          </>
        ) : (
          <>
            {team1} vs {team2}
          </>
        )}
      </p>
    </div>
  );
}

export default async function SchedulePage({ params }) {
  const { slug } = await params;
  const tournament = await getTournamentBySlug(slug);
  if (!tournament) notFound();

  const rows = await getTournamentSchedule(slug);
  const fieldGroups = groupByField(rows);

  return (
    <div className="space-y-6">
      <Link
        href={`/tournaments/${slug}`}
        className="text-sm text-afa-navy underline min-h-11 inline-flex items-center"
      >
        ← {tournament.name}
      </Link>

      <div className="text-center">
        <h1 className="font-display text-2xl text-afa-navy">Schedule</h1>
        <p className="text-sm text-afa-ink/70 mt-1">{tournament.name}</p>
      </div>

      {fieldGroups.length === 0 ? (
        <p className="text-sm text-afa-ink/70">No schedule posted yet — check back.</p>
      ) : (
        <div className="space-y-6">
          {fieldGroups.map((group) => (
            <div key={group.field ?? "tbd"} className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-lg text-afa-navy">{group.heading}</h2>
                <Chip variant="muted">
                  {group.games.length} game{group.games.length === 1 ? "" : "s"}
                </Chip>
              </div>
              <div className="divide-y divide-afa-navy/10">
                {group.games.map((g) => (
                  <GameRow key={g.id} row={g} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
