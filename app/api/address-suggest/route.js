// Address typeahead: Google Places when GOOGLE_MAPS_API_KEY is set,
// otherwise free OpenStreetMap Photon (weaker). Key stays server-side.

export const runtime = "nodejs";

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY ||
  "";

// Southern Utah bias (St. George)
const LAT = 37.1041;
const LON = -113.5841;

function googleEnabled() {
  return Boolean(GOOGLE_KEY && GOOGLE_KEY.length > 10);
}

/**
 * Google Places Autocomplete (legacy REST) — best results for US street addresses.
 */
async function googleAutocomplete(input) {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/autocomplete/json"
  );
  url.searchParams.set("input", input);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("location", `${LAT},${LON}`);
  url.searchParams.set("radius", "120000"); // ~75 mi
  url.searchParams.set("strictbounds", "false");
  url.searchParams.set("key", GOOGLE_KEY);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn("google autocomplete http", res.status, t.slice(0, 200));
    return [];
  }
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    console.warn("google autocomplete status", data.status, data.error_message);
    return [];
  }
  return (data.predictions ?? []).map((p) => ({
    label: p.description,
    placeId: p.place_id,
    // Structured fields filled on pick via /api/address-details
    street: "",
    city: "",
    state: "",
    zip: "",
  }));
}

// ---- OSM fallback (no key) ----------------------------------------------

const PHOTON = "https://photon.komoot.io/api/";
const USER_AGENT =
  "AFA-Softball-Southern-Utah/1.0 (league site; contact: afasoftballutah)";

async function photonFallback(q) {
  try {
    const url = new URL(PHOTON);
    url.searchParams.set("q", q);
    url.searchParams.set("lat", String(LAT));
    url.searchParams.set("lon", String(LON));
    url.searchParams.set("limit", "6");
    url.searchParams.set("lang", "en");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features ?? [])
      .map((f) => {
        const p = f.properties || {};
        const street = [p.housenumber, p.street].filter(Boolean).join(" ");
        const city = p.city || p.town || p.village || p.county || "";
        const state = p.state || "";
        const zip = p.postcode || "";
        const label =
          [street, city, state, zip].filter(Boolean).join(", ") ||
          p.name ||
          "";
        if (!label) return null;
        return {
          label,
          placeId: null,
          street: street || label,
          city,
          state: String(state).slice(0, 2).toUpperCase() === state
            ? state
            : abbreviateState(state),
          zip,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.warn("photon fallback", err?.message || err);
    return [];
  }
}

function abbreviateState(name) {
  const map = {
    utah: "UT",
    arizona: "AZ",
    nevada: "NV",
    colorado: "CO",
    california: "CA",
  };
  return map[String(name || "").toLowerCase()] || String(name || "").slice(0, 2).toUpperCase();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") ?? "").trim();
  if (raw.length < 3) {
    return Response.json({
      suggestions: [],
      provider: googleEnabled() ? "google" : "osm",
    });
  }

  try {
    if (googleEnabled()) {
      const suggestions = await googleAutocomplete(raw);
      return Response.json({
        suggestions: suggestions.slice(0, 8),
        provider: "google",
      });
    }

    const suggestions = await photonFallback(raw);
    return Response.json({
      suggestions: suggestions.slice(0, 6),
      provider: "osm",
    });
  } catch (err) {
    console.warn("address-suggest failed", err?.message || err);
    return Response.json({ suggestions: [], provider: "error" });
  }
}
