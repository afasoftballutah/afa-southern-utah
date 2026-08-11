// Resolve a Google place_id into street / city / state / zip.
// Server-only key — never call Places from the browser.

export const runtime = "nodejs";

const GOOGLE_KEY =
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_PLACES_API_KEY ||
  "";

function component(components, type) {
  const c = (components ?? []).find((x) => (x.types ?? []).includes(type));
  return c?.long_name || c?.short_name || "";
}

function shortComponent(components, type) {
  const c = (components ?? []).find((x) => (x.types ?? []).includes(type));
  return c?.short_name || c?.long_name || "";
}

export async function GET(request) {
  if (!GOOGLE_KEY) {
    return Response.json(
      { error: "Google Places is not configured" },
      { status: 503 }
    );
  }

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId) {
    return Response.json({ error: "placeId required" }, { status: 400 });
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "address_component,formatted_address");
  url.searchParams.set("key", GOOGLE_KEY);

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return Response.json({ error: "Place details failed" }, { status: 502 });
    }
    const data = await res.json();
    if (data.status !== "OK" || !data.result) {
      console.warn("place details", data.status, data.error_message);
      return Response.json(
        { error: data.error_message || data.status || "Not found" },
        { status: 404 }
      );
    }

    const comps = data.result.address_components ?? [];
    const streetNumber = component(comps, "street_number");
    const route = component(comps, "route");
    const street = [streetNumber, route].filter(Boolean).join(" ");
    const city =
      component(comps, "locality") ||
      component(comps, "sublocality") ||
      component(comps, "neighborhood") ||
      component(comps, "administrative_area_level_2");
    const state = shortComponent(comps, "administrative_area_level_1");
    const zip = component(comps, "postal_code");
    let formatted =
      data.result.formatted_address ||
      [street, city, state, zip].filter(Boolean).join(", ");
    // Prefer street,city,state,zip without country; strip ", USA" etc.
    const compact = [street, city, state, zip].filter(Boolean).join(", ");
    if (compact) formatted = compact;
    else {
      formatted = String(formatted)
        .replace(
          /,?\s*(United States of America|United States|USA|US)\s*$/i,
          ""
        )
        .replace(/[,\s]+$/g, "")
        .trim();
    }

    return Response.json({
      label: formatted,
      street: street || formatted,
      city,
      state,
      zip,
      formatted,
    });
  } catch (err) {
    console.error("address-details", err);
    return Response.json({ error: "Place details failed" }, { status: 500 });
  }
}
