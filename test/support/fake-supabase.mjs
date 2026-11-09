// Minimal in-memory stand-in for the supabase-js query builder — only what
// lib/bracket/propagate.js uses: select/eq/or/order/maybeSingle/single,
// update(...).eq(...), insert(...)[.select().single()].
export const db = { games: [], brackets: [], divisions: [] };
let nextId = 1;

function parseOr(expr) {
  return expr.split(",").map((part) => {
    const [col, op, ...rest] = part.split(".");
    if (op !== "eq") throw new Error(`fake: unsupported or op ${op}`);
    return [col, rest.join(".")];
  });
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.orders = [];
    this.mode = "select";
    this._single = null;
    this.head = false;
  }
  select(_cols, opts) { if (this.mode === "select" && opts?.head) this.head = true; this.wantRows = true; return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  or(expr) { const ors = parseOr(expr); this.filters.push((r) => ors.some(([c, v]) => String(r[c]) === v)); return this; }
  order(col, { ascending = true } = {}) { this.orders.push([col, ascending]); return this; }
  maybeSingle() { this._single = "maybe"; return this; }
  single() { this._single = "one"; return this; }
  update(patch) { this.mode = "update"; this.patch = patch; return this; }
  insert(row) { this.mode = "insert"; this.row = row; return this; }
  then(resolve, reject) { try { resolve(this.run()); } catch (e) { reject(e); } }
  run() {
    const rows = db[this.table];
    if (!rows) throw new Error(`fake: no table ${this.table}`);
    if (this.mode === "insert") {
      const list = (Array.isArray(this.row) ? this.row : [this.row]).map((r) => ({ id: `ins${nextId++}`, ...r }));
      rows.push(...list);
      const data = this._single ? list[0] : list;
      return { data, error: null };
    }
    let hit = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === "update") {
      for (const r of hit) Object.assign(r, this.patch);
      return { data: null, error: null };
    }
    for (const [col, asc] of [...this.orders].reverse()) {
      hit = [...hit].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
    }
    if (this.head) return { data: null, count: hit.length, error: null };
    const copy = hit.map((r) => ({ ...r }));
    if (this._single === "maybe") return { data: copy[0] ?? null, error: null };
    if (this._single === "one") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { message: "not one row" } };
    return { data: copy, error: null };
  }
}
export function getServiceClient() {
  return { from: (table) => new Query(table) };
}
export const getPublicClient = getServiceClient;
export const isSupabaseConfigured = () => true;
