// Undo for pool play made by mistake (J.D., 2026-11-09: a director built a
// 22-team round robin for Worlds Men's E by accident and had no way back).
//
// Pool play can be taken off a division only while none of its games has a
// score. Once one has, the pools are results, and results are not undone
// by a button.

/** True once anything at all has been recorded for this pool game. */
export function poolGameHasScore(game) {
  if (!game) return false;
  return (
    game.status === "final" ||
    game.team1_score != null ||
    game.team2_score != null
  );
}

/**
 * Why pool play cannot be removed, or null when it can.
 * @param {Array<{status?: string, team1_score?: number|null, team2_score?: number|null}>} poolGames
 */
export function poolRemovalBlocker(poolGames) {
  const list = poolGames ?? [];
  if (list.length === 0) return "This division has no pool play to remove";
  const scored = list.filter(poolGameHasScore).length;
  if (scored > 0) {
    return scored === 1
      ? "1 pool game already has a score, so pool play can't be removed"
      : `${scored} pool games already have scores, so pool play can't be removed`;
  }
  return null;
}

export function canRemovePoolPlay(poolGames) {
  return poolRemovalBlocker(poolGames) === null;
}

/**
 * Server side of "Remove pool play". Checks, then deletes only unscored
 * rows (so a score that lands between the check and the delete survives),
 * then confirms nothing is left.
 * @returns {Promise<{status: number, body: object}>}
 */
export async function removePoolPlay(supabase, divisionId) {
  if (!divisionId) return { status: 400, body: { error: "Which division?" } };

  const { data: poolGames, error: loadErr } = await supabase
    .from("pool_games")
    .select("id, status, team1_score, team2_score")
    .eq("division_id", divisionId);
  if (loadErr) {
    console.error("removePoolPlay load failed", loadErr);
    return { status: 500, body: { error: "Could not check pool games" } };
  }
  const blocker = poolRemovalBlocker(poolGames);
  if (blocker) return { status: 409, body: { error: blocker } };

  const { data: removed, error: delErr } = await supabase
    .from("pool_games")
    .delete()
    .eq("division_id", divisionId)
    .neq("status", "final")
    .is("team1_score", null)
    .is("team2_score", null)
    .select("id");
  if (delErr) {
    console.error("removePoolPlay delete failed", delErr);
    return { status: 500, body: { error: "Could not remove pool play" } };
  }
  const n = removed?.length ?? 0;

  const { count: left, error: countErr } = await supabase
    .from("pool_games")
    .select("id", { count: "exact", head: true })
    .eq("division_id", divisionId);
  if (countErr) {
    console.error("removePoolPlay recount failed", countErr);
    return { status: 500, body: { error: `Removed ${n} pool games; could not confirm the rest` } };
  }
  if ((left ?? 0) > 0) {
    return {
      status: 409,
      body: { error: `Removed ${n} pool games; ${left} with a score were kept` },
    };
  }
  return { status: 200, body: { ok: true, removed: n } };
}
