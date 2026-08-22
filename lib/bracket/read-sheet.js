import { parseGameWhenInput } from "@/lib/league-time";

const FEED_RE = /^(Winner|Loser) of Game (\d+)$/i;

export function canonicalFeedName(raw) {
  const m = FEED_RE.exec(String(raw ?? "").trim());
  if (!m) return String(raw ?? "").trim();
  return `${m[1][0].toUpperCase() === "L" ? "Loser" : "Winner"} of Game ${Number(m[2])}`;
}

function foldName(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ");
}

export function isFeedSlot(raw) {
  return FEED_RE.test(canonicalFeedName(raw));
}

export function matchKnownTeam(raw, known = []) {
  const name = canonicalFeedName(raw);
  if (!name || isFeedSlot(name)) return name;
  const want = foldName(name);
  if (!want) return name;
  const hit = known.find((k) => foldName(k) === want);
  if (hit) return hit;
  const loose = known.find((k) => {
    const have = foldName(k);
    return have.includes(want) || want.includes(have);
  });
  return loose || name;
}

/** Real team names on the sheet that are not already in the division. */
export function missingSheetTeams(games = [], knownTeams = []) {
  const known = new Set((knownTeams ?? []).map(foldName).filter(Boolean));
  const out = [];
  const seen = new Set();
  for (const g of games) {
    for (const raw of [g.a, g.b, g.team1, g.team2]) {
      const name = canonicalFeedName(raw);
      if (!name || isFeedSlot(name)) continue;
      const key = foldName(name);
      if (!key || known.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

/** "9:00 AM" / "9a" / "21:00" → "HH:MM" or null. */
export function parseSheetClock(raw) {
  const s = String(raw ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (!s) return null;
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] != null ? Number(m[2]) : 0;
  const ap = (m[3] || "").toLowerCase();
  if (h > 23 || min > 59) return null;
  if (ap === "p" || ap === "pm") {
    if (h < 12) h += 12;
  } else if (ap === "a" || ap === "am") {
    if (h === 12) h = 0;
  }
  if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function seatFromSheetName(raw, byRound) {
  const name = canonicalFeedName(raw);
  if (!name) return { error: "Both sides need a team, or Winner/Loser of a game." };
  const m = FEED_RE.exec(name);
  if (!m) return { name, sourceId: null, sourceResult: null };
  const n = Number(m[2]);
  const id = byRound?.get(n) ?? null;
  return {
    name,
    sourceId: id,
    sourceResult: m[1].toLowerCase().startsWith("l") ? "loser" : "winner",
  };
}

/**
 * Model JSON (possibly fenced) → { games: [{ n, a, b, field, time, scheduledTime }] }
 */
export function parseSheetModelText(text, { knownTeams = [], playDay = null } = {}) {
  const raw = String(text ?? "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const jsonText = (fenced ? fenced[1] : raw).trim();
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Could not read games off that photo.");
    data = JSON.parse(jsonText.slice(start, end + 1));
  }
  const list = Array.isArray(data) ? data : data.games;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("No games found on that photo.");
  }
  const games = [];
  for (const row of list) {
    const n = Number(row.n ?? row.round ?? row.game);
    if (!Number.isInteger(n) || n < 1) continue;
    const a = matchKnownTeam(row.a ?? row.team1 ?? row.home ?? "", knownTeams);
    const b = matchKnownTeam(row.b ?? row.team2 ?? row.away ?? "", knownTeams);
    if (!a || !b) continue;
    const clock = parseSheetClock(row.time ?? row.clock ?? "");
    const when = clock ? parseGameWhenInput(clock, playDay) : null;
    games.push({
      n,
      a,
      b,
      field: String(row.field ?? "").trim() || null,
      time: clock,
      scheduledTime: when ? when.toISOString() : null,
    });
  }
  games.sort((x, y) => x.n - y.n);
  if (!games.length) throw new Error("No games found on that photo.");
  return { games };
}

export function responsesOutputText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const chunks = [];
  for (const item of payload.output ?? []) {
    for (const c of item.content ?? []) {
      if (typeof c.text === "string") chunks.push(c.text);
      else if (typeof c.output_text === "string") chunks.push(c.output_text);
    }
  }
  return chunks.join("\n").trim();
}
