// Free US address typeahead — Photon (partial names) + Nominatim.
// No API key. Filters so typed street text must match; expands Trl→Trail, etc.

export const runtime = "nodejs";

const PHOTON = "https://photon.komoot.io/api/";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "AFA-Softball-Southern-Utah/1.0 (league site; contact: afasoftballutah)";
// Southern Utah (St. George / Ivins)
const LAT = "37.12";
const LON = "-113.62";
const VIEWBOX = "-114.0,36.8,-113.2,37.5";

const DIRECTIONALS = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "north", "south", "east", "west",
]);

// Common postal / OSM abbreviations → full (helps "Trl" find "Trail")
const ABBREV = {
  trl: "trail",
  tr: "trail",
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  cir: "circle",
  blvd: "boulevard",
  pkwy: "parkway",
  hwy: "highway",
  pl: "place",
  ter: "terrace",
  sq: "square",
};

function expandToken(t) {
  const low = t.toLowerCase();
  return ABBREV[low] || low;
}

function tokenize(q) {
  return q
    .toLowerCase()
    .replace(/[.,#/]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function parseQuery(raw) {
  const tokens = tokenize(raw);
  let house = null;
  const rest = [];
  for (const t of tokens) {
    if (!house && /^\d+[a-z]?$/.test(t)) house = t.replace(/[a-z]/g, "");
    else rest.push(t);
  }
  // Street-name tokens: not directionals, not pure zip (5+ digits), not state codes alone
  const nameTokens = rest
    .filter((t) => {
      if (DIRECTIONALS.has(t)) return false;
      if (/^\d{5}(-\d{4})?$/.test(t)) return false;
      if (t.length < 3) return false;
      if (/^(ut|az|nv|usa)$/.test(t)) return false;
      return true;
    })
    .map(expandToken);

  return {
    house,
    nameTokens,
    dirTokens: rest.filter((t) => DIRECTIONALS.has(t)),
    cityHints: rest.filter((t) =>
      ["ivins", "washington", "hurricane", "santa", "clara", "leeds", "toquerville"].includes(t)
    ),
    all: tokens,
    raw: raw.trim(),
  };
}

/**
 * Street must match the road fragment (longest name token), e.g. "cortez".
 * Abbreviations expanded so "trl" matches "trail".
 */
function streetMatches(streetName, parsed) {
  if (!streetName) return false;
  const words = streetName
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(expandToken);

  if (parsed.nameTokens.length === 0) return true;

  // Prefer road-name tokens over place names: drop common city words from primary pick
  const roadish = parsed.nameTokens.filter(
    (t) => !["ivins", "george", "utah", "county"].includes(t)
  );
  const pool = roadish.length ? roadish : parsed.nameTokens;
  const primary = [...pool].sort((a, b) => b.length - a.length)[0];
  if (!primary || primary.length < 3) return true;

  return words.some(
    (w) => w.startsWith(primary) || (primary.length >= 4 && w.includes(primary))
  );
}

function formatLine({ street, city, state, zip }) {
  return [street, city, state, zip].filter(Boolean).join(", ");
}

function roadScore(name) {
  const n = name.toLowerCase();
  const roadLike =
    /\b(street|st|avenue|ave|road|rd|drive|dr|lane|ln|way|court|ct|circle|cir|blvd|boulevard|parkway|pkwy|trail|trl|place|pl|terrace)\b/i.test(
      n
    );
  const notRoad =
    /\b(cliffs?|monument|mine|campground|park|national|hotel|casino|temple|university)\b/i.test(
      n
    );
  return (roadLike ? 3 : 0) - (notRoad ? 3 : 0);
}

function fromPhoton(f, parsed) {
  const p = f.properties ?? {};
  const country = String(p.countrycode || "").toUpperCase();
  if (country && country !== "US") return null;

  // Prefer highway / house, skip businesses when we want an address
  const key = p.osm_key || "";
  if (key === "tourism" || key === "amenity" || key === "landuse") return null;

  const streetName = p.name || p.street || "";
  if (!streetMatches(streetName, parsed)) return null;

  const house = p.housenumber || parsed.house || "";
  const base = streetName;
  const streetOut =
    house && !String(base).match(new RegExp(`^${house}\\b`))
      ? `${house} ${base}`.trim()
      : [p.housenumber, base].filter(Boolean).join(" ") || base;

  const city = p.city || p.town || p.village || p.district || "";
  const state = p.state || "";
  const zip = p.postcode || "";
  const label = formatLine({ street: streetOut, city, state, zip });
  if (!label) return null;

  let rank = (p.housenumber ? 3 : parsed.house ? 2 : 1) + roadScore(streetName);
  if (parsed.cityHints.some((c) => city.toLowerCase().includes(c))) rank += 4;
  if (/utah/i.test(state)) rank += 1;
  if (/st\.?\s*george|ivins|washington/i.test(city)) rank += 1;

  return {
    label,
    street: streetOut,
    city,
    state,
    zip,
    rank,
  };
}

function fromNominatim(item, parsed) {
  const a = item.address ?? {};
  const road = a.road || a.pedestrian || a.residential || item.name || "";
  if (!streetMatches(road, parsed) && !streetMatches(item.name || "", parsed)) {
    return null;
  }

  const house = a.house_number || parsed.house || "";
  const streetOut =
    house && !String(road).match(new RegExp(`^${house}\\b`))
      ? `${house} ${road}`.trim()
      : [a.house_number, road].filter(Boolean).join(" ") || road;

  const city =
    a.city || a.town || a.village || a.hamlet || a.municipality || a.county || "";
  const state = a.state || "";
  const zip = a.postcode || "";
  const label = formatLine({ street: streetOut, city, state, zip });
  if (!label) return null;

  let rank = (a.house_number ? 3 : parsed.house ? 2 : 1) + roadScore(road);
  if (parsed.cityHints.some((c) => city.toLowerCase().includes(c))) rank += 4;
  if (/utah/i.test(state)) rank += 1;
  rank += (Number(item.importance) || 0) * 2;

  return {
    label,
    street: streetOut,
    city,
    state,
    zip,
    rank,
  };
}

async function photonSearch(q) {
  const url = new URL(PHOTON);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "12");
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", LAT);
  url.searchParams.set("lon", LON);
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(4000),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.features ?? [];
}

async function nominatimSearch(q) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "us");
  url.searchParams.set("limit", "8");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "0");
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(5000),
    next: { revalidate: 0 },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Expand abbreviations in the query string for the geocoder. */
function expandQuery(q) {
  return q
    .split(/(\s+)/)
    .map((part) => {
      const bare = part.toLowerCase().replace(/\./g, "");
      if (ABBREV[bare]) {
        // Preserve casing lightly — geocoders are case-insensitive
        return ABBREV[bare].replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return part;
    })
    .join("");
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") ?? "").trim();
  if (raw.length < 3) {
    return Response.json({ suggestions: [] });
  }

  const parsed = parseQuery(raw);
  const expanded = expandQuery(raw);

  // Street-focused strings (drop house # for discovery)
  const streetBits = tokenize(expanded).filter((t) => !/^\d+[a-z]?$/.test(t));
  const streetQ = streetBits.join(" ") || expanded;
  const primary =
    parsed.nameTokens.length > 0
      ? [...parsed.nameTokens].sort((a, b) => b.length - a.length)[0]
      : "";

  const queries = [expanded, streetQ, raw];
  if (primary && primary.length >= 3) {
    queries.push(primary);
    // Local bias for partial road names (Ivins / St George area)
    if (parsed.cityHints.includes("ivins")) {
      queries.push(`${primary} Ivins Utah`);
      queries.push(`${streetQ} Ivins`);
    } else {
      queries.push(`${primary} St. George Utah`);
      queries.push(`${streetQ} Ivins Utah`);
    }
  }

  try {
    const uniqQ = [...new Set(queries.filter(Boolean))].slice(0, 6);
    const [photonBatches, nomiBatches] = await Promise.all([
      Promise.all(uniqQ.map((q) => photonSearch(q))),
      Promise.all(uniqQ.map((q) => nominatimSearch(q))),
    ]);

    const out = [];
    for (const f of photonBatches.flat()) {
      const s = fromPhoton(f, parsed);
      if (s) out.push(s);
    }
    for (const item of nomiBatches.flat()) {
      const s = fromNominatim(item, parsed);
      if (s) out.push(s);
    }

    const seen = new Set();
    const unique = [];
    for (const s of out) {
      const k = s.label.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(s);
    }

    unique.sort((a, b) => b.rank - a.rank);

    const suggestions = unique.slice(0, 6).map(({ label, street, city, state, zip }) => ({
      label,
      street,
      city,
      state,
      zip,
    }));

    return Response.json({ suggestions });
  } catch (err) {
    console.warn("address-suggest failed", err?.message || err);
    return Response.json({ suggestions: [] });
  }
}
