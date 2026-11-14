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

import FeedAwareName from "@/components/ui/FeedAwareName";
import { isWaitingSlot } from "@/lib/slot-label";
import { pillHonors } from "@/lib/matchup-honors";

const GROUND = {
  Gold: "#fbf6e6",
  Silver: "#f4f6f9",
  Bronze: "#f9f1eb",
};

// Caption metal — same family as seed chips / finish labels
const CAPTION = {
  Gold: "#c9a227",
  Silver: "#8b9bb0",
  Bronze: "#c47a4a",
};

// 🏆 champion · 🥈 runner-up on the deciding championship game.
// 🥉 plus an italic place ("3rd") on the 3rd-place team's elimination game.
// Other determined places are italic only ("5th", "7th", "13th").
const MEDAL = { gold: "\u{1F3C6}", silver: "\u{1F948}", bronze: "\u{1F949}" };

function Pill({ name, from, seed, score, won, waiting, medal, place }) {
  return (
    <div
      className={[
        "flex h-[34px] items-center gap-1.5 rounded-[7px] border bg-white px-2.5",
        won ? "border-afa-navy/50" : "border-afa-ink/[0.13]",
      ].join(" ")}
      style={score != null ? { paddingRight: 36, position: "relative" } : { position: "relative" }}
    >
      {medal && MEDAL[medal] && (
        <span className="shrink-0 text-[14px] leading-none" aria-hidden="true">
          {MEDAL[medal]}
        </span>
      )}
      {place && (
        <span
          className="shrink-0 text-[12px] font-bold italic leading-none"
          style={{ color: "var(--afa-action)" }}
        >
          {place}
        </span>
      )}
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
        <FeedAwareName name={name} from={from} />
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
  team1From,
  team2From,
  score1,
  score2,
  isFinal,
  championship,
  team1Place,
  team2Place,
  seeds,
  className = "",
}) {
  const tie = isFinal && score1 === score2;
  const won1 = isFinal && !tie && score1 > score2;
  const won2 = isFinal && !tie && score2 > score1;
  const decided = Boolean(won1 || won2);
  const seedOf = (n) => (n && seeds ? seeds[n] ?? null : null);

  // isFinal means the game has a score (status === "final"): show the
  // score, bold the winner, and put the winner on top.
  // Trophy / silver stay on the deciding championship game. An italic
  // place (and bronze for 3rd) lands on the eliminated team's pill once
  // that finish is known — the same eliminationPlacings labels Timeline uses.
  const honors = (won, place) => pillHonors({ championship, decided, won, place });
  let top = {
    name: team1,
    from: team1From,
    score: score1,
    won: won1,
    ...honors(won1, team1Place),
  };
  let bot = {
    name: team2,
    from: team2From,
    score: score2,
    won: won2,
    ...honors(won2, team2Place),
  };
  if (isFinal && won2) {
    [top, bot] = [bot, top];
  }

  // When and where go ABOVE the card, on one line, the way the bracket
  // does it (JD, 2026-07-26: "I like how we did that for the bracket").
  // A left-hand column was a second grammar for the same fact, and it
  // took width the names wanted on a phone.
  const line = [caption, meta?.day, meta?.time, meta?.field].filter(Boolean).join(" \u00b7 ");

  const card = (
    <div className="min-w-0">
      {line && (
        <p
          className="matchup-card__caption mb-1 truncate text-center text-[10.5px] font-semibold uppercase tracking-[.03em]"
          style={{ color: CAPTION[division] ?? "var(--matchup-caption, var(--afa-ink))" }}
        >
          {line}
        </p>
      )}
      <div
        className="card flex flex-col gap-1 rounded-[11px] px-2 py-2.5"
        style={{ background: GROUND[division] ?? "#fff" }}
      >
        <Pill
          name={top.name}
          from={top.from}
          seed={seedOf(top.name)}
          score={isFinal ? top.score : null}
          won={top.won}
          waiting={isWaitingSlot(top.name)}
          medal={top.medal}
          place={top.place}
        />
        <Pill
          name={bot.name}
          from={bot.from}
          seed={seedOf(bot.name)}
          score={isFinal ? bot.score : null}
          won={bot.won}
          waiting={isWaitingSlot(bot.name)}
          medal={bot.medal}
          place={bot.place}
        />
      </div>
    </div>
  );

  return <div className={`min-w-0 ${className}`}>{card}</div>;
}

