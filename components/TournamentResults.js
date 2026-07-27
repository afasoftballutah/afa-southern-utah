import Link from "next/link";
import Card from "@/components/ui/Card";

// The archive face of a finished tournament — one column per bracket, podium
// first, photos only when a director uploaded them. Lives above the schedule,
// never instead of it.

function TeamRow({ row, href }) {
  const body = (
    <div className="grid min-h-11 grid-cols-[1.5rem_minmax(0,1fr)_3.25rem] items-center gap-x-2">
      <span className="text-base leading-none" aria-hidden="true">
        {row.medal}
      </span>
      <span className="team-name truncate font-semibold" title={row.team}>
        {row.team}
      </span>
      <span className="text-right font-semibold tabular-nums text-afa-ink/[0.78]">
        {row.w}&ndash;{row.l}
      </span>
    </div>
  );
  if (!href) return body;
  return (
    <Link
      href={href}
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-afa-navy/40"
    >
      {body}
    </Link>
  );
}

function DivisionColumn({ column, slug }) {
  const standingsHref = `/tournaments/${slug}/division/${column.divisionId}`;
  return (
    <div className="min-w-0 space-y-1">
      <h3 className="t-label">{column.divisionName}</h3>
      <div className="space-y-0.5">
        {column.podium.map((row) => (
          <TeamRow
            key={`${row.place}-${row.team}`}
            row={row}
            href={standingsHref}
          />
        ))}
      </div>
      {column.podium.length > 0 && (
        <Link href={standingsHref} className="t-meta inline-block pt-1 text-afa-navy underline decoration-afa-navy/30 underline-offset-2">
          Full standings &rsaquo;
        </Link>
      )}
      {(column.photos ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {column.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id ?? p.photo_url}
              src={p.photo_url}
              alt={p.caption || `${column.divisionName} placement`}
              className="h-20 w-20 rounded-lg object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TournamentResults({ results = [], slug, unfinished = false }) {
  if (!results.length) return null;
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-heading">Results</h2>
        <span className="t-meta">{unfinished ? "Unfinished" : "Final"}</span>
      </div>
      <div
        className={`grid gap-6 ${
          results.length === 1
            ? "grid-cols-1"
            : results.length === 2
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        {results.map((column) => (
          <DivisionColumn key={column.divisionId + column.divisionName} column={column} slug={slug} />
        ))}
      </div>
    </Card>
  );
}
