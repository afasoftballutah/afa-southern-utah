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
            : "font-display text-[14px] text-afa-ink",
        ].join(" ")}
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
 * @param caption   the line above the card — "SUN 12A · F4", "GOLD · GAME 8"
 * @param division  "Gold" | "Silver" | "Bronze" — tints the ground; anything
 *                  else (pool play) stays white
 * @param seeds     optional { [teamName]: "D1" }
 */
export default function MatchupCard({
  caption,
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

  return (
    <div className={`min-w-0 ${className}`}>
      {caption && (
        <p className="t-label mb-1 truncate text-afa-muted">{caption}</p>
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
}
