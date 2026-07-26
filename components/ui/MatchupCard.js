// MatchupCard — THE matchup, wherever it appears (JD, 2026-07-26:
// "basically that becomes our matchup card format").
//
// The bracket's own game unit, lifted out so the schedule feed, the pool
// cards and the bracket all draw a game the same way: two white pills on
// a tinted card, the card carrying the shadow — one raised object, not
// two hovering over a third.
//
// The tint says which bracket. Pool play is white, because a pool game
// belongs to no bracket yet.
//
// components/bracket/BracketMatchup.js stays where it is: it works from
// seed refs and source games and carries the drop colours, none of which
// exist outside the drawing. This is the same recipe with plain props.

const GROUND = {
  Gold: "#fbf6e6",
  Silver: "#f4f6f9",
  Bronze: "#f9f1eb",
};

function Pill({ name, seed, score, won, waiting }) {
  return (
    <div
      className={[
        "flex h-[34px] items-center gap-1.5 rounded-[7px] border bg-white px-2.5",
        won ? "border-afa-navy/50" : "border-afa-ink/[0.13]",
      ].join(" ")}
      style={score != null ? { paddingRight: 36, position: "relative" } : { position: "relative" }}
    >
      <span
        className={[
          "min-w-0 flex-1 truncate leading-none",
          waiting
            ? "text-center text-[12px] font-semibold italic text-afa-muted"
            : "team-name text-[14px]",
        ].join(" ")}
        style={waiting ? undefined : { fontWeight: won ? 700 : 400 }}
      >
        {seed && <span className="text-[11.5px] font-bold text-afa-muted">[{seed}] </span>}
        {name ?? "TBD"}
      </span>
      {score != null && (
        <span
          className={[
            "absolute right-0 top-1 bottom-1 flex w-[30px] items-center justify-center",
            "border-l border-afa-ink/[0.14] text-[14px] tabular-nums",
            won ? "font-bold text-afa-ink" : "text-afa-muted",
          ].join(" ")}
        >
          {score}
        </span>
      )}
    </div>
  );
}

/**
 * @param caption   the line above the card — "GOLD · GAME 8"
 * @param meta      { field, day, time } — the fixed column to the left of
 *                  the card. Part of THIS component so a game says where
 *                  and when the same way everywhere (JD, 2026-07-26); it
 *                  was two lines in a pool card and three in the schedule.
 * @param division  "Gold" | "Silver" | "Bronze" — tints the ground; anything
 *                  else (pool play) stays white
 * @param seeds     optional { [teamName]: "D1" }
 */
export default function MatchupCard({
  caption,
  meta,
  division,
  team1,
  team2,
  score1,
  score2,
  isFinal,
  seeds,
  className = "",
}) {
  const tie = isFinal && score1 === score2;
  const won1 = isFinal && !tie && score1 > score2;
  const won2 = isFinal && !tie && score2 > score1;
  const seedOf = (n) => (n && seeds ? seeds[n] ?? null : null);

  // When and where go ABOVE the card, on one line, the way the bracket
  // does it (JD, 2026-07-26: "I like how we did that for the bracket").
  // A left-hand column was a second grammar for the same fact, and it
  // took width the names wanted on a phone.
  const line = [caption, meta?.day, meta?.time, meta?.field].filter(Boolean).join(" \u00b7 ");

  const card = (
    <div className="min-w-0">
      {line && (
        <p className="mb-1 truncate text-center text-[10.5px] font-semibold uppercase tracking-[.03em] text-afa-ink">
          {line}
        </p>
      )}
      <div
        className="card flex flex-col gap-1 rounded-[11px] px-2 py-2.5"
        style={{ background: GROUND[division] ?? "#fff" }}
      >
        <Pill name={team1} seed={seedOf(team1)} score={isFinal ? score1 : null} won={won1} waiting={!team1} />
        <Pill name={team2} seed={seedOf(team2)} score={isFinal ? score2 : null} won={won2} waiting={!team2} />
      </div>
    </div>
  );

  return <div className={`min-w-0 ${className}`}>{card}</div>;
}

