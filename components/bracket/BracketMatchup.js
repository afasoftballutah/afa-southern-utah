// BracketMatchup — the drawn bracket's own game unit (redesign spec 5.2,
// 5.3, 5.4). Deliberately NOT components/ui/Matchup: that one is shared
// with the pools and the fallback list, and restyling it in place would
// change three surfaces to fix one.
//
// The unit is a light card in the bracket's colour carrying the shadow,
// with two WHITE pills sitting flat on it at the card's own depth — one
// raised object, not two objects hovering over a third.
//
// GEOMETRY IS A CONTRACT. The card is a hard 92px because every connector
// anchor in lib computeLayout derives from it, and inside that 92 the two
// pill centres sit at 27 and 65 from the card top, which is where the
// loser drops aim. 10 padding + 34 pill + 4 gap + 34 pill + 10 padding.
// Changing any one of those numbers means changing all of them together
// and re-verifying every endpoint.

export const BOX_H = 92;
export const SIDE_Y = [27, 65];

// Flattened onto white, never translucent: at 50% alpha the dotted loser
// drops showed straight through the team names, which is the one thing a
// pill exists to prevent.
const CARD_BG = {
  Gold: "#fbf6e6",
  Silver: "#f4f6f9",
  Bronze: "#f9f1eb",
};

const FEED_RE = /^(Winner|Loser) of Game (\d+)$/;

/**
 * One team's pill.
 *
 * A name is ALWAYS black; weight carries the state (spec 5.2). Fading a
 * real team to grey made it look like a placeholder.
 *
 * A slot nobody has reached yet is not a team and does not sit where team
 * names sit: it renders italic, centred across the whole pill, with no
 * score gutter to align against.
 */
function Pill({ label, tag, score, won, waiting, tint }) {
  return (
    <div
      className={[
        "relative flex items-center gap-1.5 rounded-[7px] border bg-white",
        "h-[34px] px-2.5",
        waiting ? "justify-center" : "justify-center",
        won ? "border-afa-navy/50" : "border-afa-ink/[0.13]",
      ].join(" ")}
      style={score != null ? { paddingRight: 36 } : undefined}
    >
      <span
        className={[
          "min-w-0 truncate leading-none",
          waiting
            ? "italic text-[12px] font-semibold tracking-[.01em]"
            : "font-display text-[14px] text-afa-ink",
          waiting ? "flex-1 text-center" : "",
        ].join(" ")}
        style={{ color: waiting ? tint || "var(--afa-muted)" : undefined }}
      >
        {tag && (
          <span
            className="text-[11.5px] font-bold"
            style={{ color: waiting ? "inherit" : "var(--afa-muted)" }}
          >
            [{tag}]
          </span>
        )}
        {tag && label ? " " : ""}
        {label}
      </span>
      {score != null && (
        <span
          className={[
            "absolute right-0 top-1 bottom-1 w-[30px] flex items-center justify-center",
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
 * @param {object} game        the games row
 * @param {string} division    "Gold" | "Silver" | "Bronze" — tints the card
 * @param {string} badgeColor  colour of the drop LEAVING this game, or null
 * @param {Function} resolveSeed  (seedRef) => { name, label, poolReady } | null
 * @param {Function} seedTagFor   (teamName) => "D1" | null
 * @param {object} slotTint    { 0?: color, 1?: color } for waiting slots
 */
export default function BracketMatchup({
  game,
  division,
  badgeColor,
  resolveSeed,
  seedTagFor,
  slotTint = {},
  caption,
  order,
  ring,
}) {
  const isFinal = game.status === "final";
  const s1 = game.team1_score;
  const s2 = game.team2_score;
  const won1 = isFinal && s1 > s2;
  const won2 = isFinal && s2 > s1;

  const side = (nameKey, refKey, srcKey, resKey, score, won) => {
    const name = game[nameKey];
    const ref = game[refKey];
    const seed = resolveSeed ? resolveSeed(ref) : null;
    const feed = game[srcKey] ? String(game[resKey] ?? "winner") : null;
    const feedNum = FEED_RE.exec(name ?? "");

    // A seeded slot's truth is its seed ref, not the name printed in it:
    // the transcribed brackets still carry the names the league's old
    // sheet had, and seeding is what replaces them.
    // A seeded slot resolves through its ref when pool results are known.
    // Otherwise fall back to the name the slot already holds: the
    // transcribed brackets carry real team names from the league's own
    // sheet, and showing "[E2]" alone in place of a named team would be a
    // regression. Only a slot with neither is genuinely waiting.
    if (seed) {
      const resolved = seed.name ?? (name && !FEED_RE.test(name) ? name : null);
      return resolved
        ? { label: resolved, tag: seed.label, score: isFinal ? score : null, won }
        : { label: null, tag: seed.label, waiting: true };
    }

    // A real name means the feeder game finished and propagated. The team
    // arrives; its POOL SEED stays in front of it, not the game number —
    // the seed says who they are all tournament (spec 5.3).
    if (name && !FEED_RE.test(name)) {
      return {
        label: name,
        tag: seedTagFor ? seedTagFor(name) : null,
        score: isFinal ? score : null,
        won,
      };
    }

    if (feedNum) {
      return { label: null, tag: `${feedNum[1]} ${feedNum[2]}`, waiting: true };
    }
    if (feed) {
      const n = game[`${srcKey}_round`];
      return {
        label: null,
        tag: n ? `${feed === "loser" ? "Loser" : "Winner"} ${n}` : null,
        waiting: true,
      };
    }
    return { label: null, tag: null, waiting: true };
  };

  const a = side("team1_name", "team1_seed_ref", "team1_source_game_id", "team1_source_result", s1, won1);
  const b = side("team2_name", "team2_seed_ref", "team2_source_game_id", "team2_source_result", s2, won2);
  const rows = order && order[0] === 1 ? [b, a] : [a, b];
  const tints = order && order[0] === 1 ? [slotTint[1], slotTint[0]] : [slotTint[0], slotTint[1]];

  return (
    <div className="relative">
      {/* Time and field sit ABOVE the card on a borderless white field,
          flush to its top edge. Below the card they sat in the lane the
          dotted drops run through, and a dotted line through "SAT 12A" is
          unreadable. Flush means there is nowhere for a dot to land
          between the time and the game it belongs to. */}
      {caption && (
        <div className="absolute left-0 right-0 bottom-full text-center pointer-events-none">
          <span className="inline-block bg-white px-[7px] pt-px pb-[3px] rounded-t text-[10.5px] font-semibold uppercase tracking-[.03em] text-afa-ink whitespace-nowrap">
            {caption}
          </span>
        </div>
      )}

      <div
        className="relative rounded-[11px] flex flex-col gap-1 px-2 py-2.5 box-border"
        style={{
          minHeight: BOX_H,
          background: CARD_BG[division] ?? "#f4f6f9",
          boxShadow:
            ring === "mine"
              ? // Every game a team plays, outlined and lit (JD, 2026-07-26:
                // "surround all their games in the blue outline and have
                // them glow a bit maybe?"). Same navy ring as focus, plus
                // a soft halo so a run reads as a path through the
                // drawing rather than as several unrelated highlights.
                "0 0 0 2px var(--afa-navy), 0 0 20px rgba(30,58,110,.30), 0 6px 16px -6px rgba(22,35,61,.5)"
              : ring === "next"
              ? // Their NEXT game, the one thing they came to find. Same
                // ring, brighter halo.
                "0 0 0 2.5px var(--afa-navy), 0 0 28px rgba(30,58,110,.45), 0 6px 16px -6px rgba(22,35,61,.5)"
              : ring === "focus"
              ? "0 0 0 2px var(--afa-navy), 0 6px 16px -6px rgba(22,35,61,.5)"
              : ring === "dest"
              ? "0 0 0 1.5px rgba(30,58,110,.35), 0 6px 14px -6px rgba(22,35,61,.4)"
              : "0 1px 1px rgba(22,35,61,.05), 0 5px 10px -5px rgba(22,35,61,.4)",
        }}
      >
        {/* Game number, inside the card's top-left, filled with the colour
            of the drop leaving this game. A navy badge means this game
            sends nobody down: everything in the losers band, and the
            final. */}
        <span
          className="absolute left-[7px] top-[5px] z-[3] min-w-[18px] h-[14px] px-1 rounded inline-flex items-center justify-center text-[9px] font-bold tabular-nums text-white"
          style={{ background: badgeColor || "var(--afa-navy)" }}
          title={`Game ${game.round}`}
        >
          {game.round}
        </span>

        {rows.map((r, i) => (
          <Pill key={i} {...r} tint={tints[i]} />
        ))}
      </div>
    </div>
  );
}

/**
 * A BYE always enters at the TOP of its matchup (spec 5.4).
 *
 * A game only has a bye in it when its two slots are DIFFERENT KINDS of
 * arrival: a pool seed against a bracket winner, or, in the losers
 * bracket, a team that dropped in early waiting on whoever survives a
 * losers game. Whichever slot was settled first is the one waiting.
 *
 * Two winners' feeds, or two loser drops, are left exactly as the layout
 * ordered them — there the top row means the upper feeder, and that
 * convention is worth more than this rule. The ordering is fixed for the
 * tournament rather than shifting as results come in, so nothing reflows
 * under a director mid-scoring.
 */
export function rowOrder(game, roundOf) {
  const kind = (ref, srcId, res) => (ref ? "seed" : srcId ? String(res ?? "winner") : null);
  const when = (ref, srcId) => (ref ? 0 : srcId ? roundOf(srcId) ?? Infinity : Infinity);
  const k1 = kind(game.team1_seed_ref, game.team1_source_game_id, game.team1_source_result);
  const k2 = kind(game.team2_seed_ref, game.team2_source_game_id, game.team2_source_result);
  if (!k1 || !k2 || k1 === k2) return [0, 1];
  return when(game.team2_seed_ref, game.team2_source_game_id) <
    when(game.team1_seed_ref, game.team1_source_game_id)
    ? [1, 0]
    : [0, 1];
}
