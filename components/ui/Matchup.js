// Matchup — the bracket tree's own vocabulary (afa-bracket-tree-spec.md),
// lifted out to a shared component (dispatch-brief-12) so a matchup reads
// the same way everywhere it appears: an optional caption, then the two
// teams as stacked rows, name left, score in a narrow right column, a
// hairline between them. Unplayed shows no score at all — never 0-0.
// Winner (strictly greater score, only when final) reads by weight on
// both its name and its score; equal scores at final leave both plain.
//
// highlightTeam (dispatch-brief-14) — optional, defaults to unset so every
// existing call site is unchanged. When it exact-matches a row's team
// name, that row's NAME (not its score) gets font-semibold too — this
// composes with winner-bolding via OR, never doubling up the class.
export default function Matchup({
  caption,
  team1,
  team2,
  score1,
  score2,
  isFinal,
  highlightTeam,
  className,
}) {
  const isTie = isFinal && score1 === score2;
  const team1Won = isFinal && !isTie && score1 > score2;
  const team2Won = isFinal && !isTie && score2 > score1;
  const team1Highlighted = team1Won || (highlightTeam != null && team1 === highlightTeam);
  const team2Highlighted = team2Won || (highlightTeam != null && team2 === highlightTeam);

  return (
    <div
      className={[
        "rounded-lg border border-afa-navy/15 border-t-2 border-t-afa-navy bg-white p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {caption && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-afa-muted">{caption}</p>
      )}
      <div className={`divide-y divide-afa-navy/10${caption ? " mt-2" : ""}`}>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className={`text-sm min-w-0 truncate ${team1Highlighted ? "font-semibold" : ""}`}>
            {team1 ?? "TBD"}
          </span>
          <span className={`w-8 text-right text-sm tabular-nums shrink-0 ${team1Won ? "font-semibold" : ""}`}>
            {isFinal ? score1 : ""}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className={`text-sm min-w-0 truncate ${team2Highlighted ? "font-semibold" : ""}`}>
            {team2 ?? "TBD"}
          </span>
          <span className={`w-8 text-right text-sm tabular-nums shrink-0 ${team2Won ? "font-semibold" : ""}`}>
            {isFinal ? score2 : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
