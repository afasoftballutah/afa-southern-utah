import { splitSides, isGf2Dashed, slotText } from "@/lib/bracket/tree";

const SIDE_LABELS = { winners: "Winners", losers: "Losers", final: "Final" };

function roundLabel(side, round) {
  if (side === "final") return round === 1 ? "Grand Final" : "If Necessary";
  return `Round ${round}`;
}

/** Read-only, public-facing grouped list — same anatomy the scorekeeper's
 * BracketManager shows internally, but with no edit controls and no PIN.
 * A deliberately separate component: BracketManager stays untouched, and
 * this one never renders team-slot pickers, score inputs, or regenerate
 * buttons. Stays the phone default per spec. */
export default function ListView({ games }) {
  const { winners, losers, final } = splitSides(games);
  const sides = [
    { name: "winners", rounds: winners },
    { name: "losers", rounds: losers },
    { name: "final", rounds: final.length ? groupFinal(final) : [] },
  ];

  return (
    <div className="space-y-5">
      {sides.map(
        (side) =>
          side.rounds.length > 0 && (
            <div key={side.name} className="space-y-2">
              <h3 className="text-sm font-bold text-afa-navy">{SIDE_LABELS[side.name]}</h3>
              {side.rounds.map(({ round, games: roundGames }, i) => (
                <div key={round}>
                  {i > 0 && <div className="chalk-line" />}
                  <p className="text-xs font-semibold text-afa-ink/50 mt-2 mb-1">{roundLabel(side.name, round)}</p>
                  <div className="space-y-1.5">
                    {roundGames.map((g) => (
                      <GameLine key={g.id} game={g} dashed={side.name === "final" && round === 2 && isGf2Dashed(final[0])} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}

function groupFinal(finalGames) {
  return finalGames.map((g) => ({ round: g.round, games: [g] }));
}

function GameLine({ game, dashed }) {
  const pending = game.status === "pending";
  if (game.is_bye) {
    const name = game.winner_slot ? game[`${game.winner_slot}_name`] : game.team1_name || game.team2_name;
    return <p className="text-sm font-bold text-afa-ink">{name} — bye</p>;
  }
  const t1 = slotText(game.team1_name, game.team1_is_open_entry);
  const t2 = slotText(game.team2_name, game.team2_is_open_entry);
  return (
    <p className={`text-sm ${dashed ? "border border-dashed border-afa-navy/40 rounded px-2 py-1 inline-block" : ""}`}>
      <span className={game.winner_slot === "team1" ? "font-bold" : ""}>{t1}</span>
      {!pending && game.team1_score != null ? ` ${game.team1_score}` : ""}
      <span className="text-afa-ink/40"> vs </span>
      <span className={game.winner_slot === "team2" ? "font-bold" : ""}>{t2}</span>
      {!pending && game.team2_score != null ? ` ${game.team2_score}` : ""}
    </p>
  );
}
