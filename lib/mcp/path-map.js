// Every game a team can still reach, from the bracket flow
// (lib/bracket/flow.js, the same arrows the site draws): from its next game,
// Winner → the game it feeds, Loser → the losers side (or out, with the
// finishing place), the final → the if-necessary game. Used by the team
// view's field grid to light up the team's paths.

export const CHAMP = "champion";
const num = (label) => /^G(\d+)$/.exec(label ?? "")?.[1] ?? null;

/** Every game the team can still reach from `start`, with its win/loss edges. */
export function pathGraph(start, rows) {
  const by = new Map();
  for (const r of rows) if (r.divisionId === start.divisionId && num(r.label)) by.set(num(r.label), r);
  const nodes = new Map();
  const edges = [];
  const queue = [start];
  while (queue.length) {
    const g = queue.shift();
    if (!g || nodes.has(g.label)) continue;
    const f = g.flow ?? {};
    const node = { label: g.label, row: g, out: null };
    nodes.set(g.label, node);
    const ifN = /(\d+)\s*$/.exec(String(f.ifGame ?? ""))?.[1] ?? null;
    if (f.winner?.next && by.has(String(f.winner.next))) {
      edges.push({ from: g.label, to: `G${f.winner.next}`, kind: "win" });
      queue.push(by.get(String(f.winner.next)));
    } else if (f.winner?.place === "\uD83C\uDFC6") edges.push({ from: g.label, to: CHAMP, kind: "win" });
    if (f.loser?.next && by.has(String(f.loser.next))) {
      edges.push({ from: g.label, to: `G${f.loser.next}`, kind: "loss" });
      queue.push(by.get(String(f.loser.next)));
    } else if (f.loser?.place) node.out = f.loser.place;
    if (ifN && by.has(ifN)) {
      edges.push({ from: g.label, to: `G${ifN}`, kind: "if" });
      queue.push(by.get(ifN));
      node.final = true;
    }
  }
  return { nodes, edges };
}
