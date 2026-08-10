import { getServiceClient } from "@/lib/supabase";
import {
  requireDirectorSession,
  requireScorekeeperSession,
} from "@/lib/scorekeeper-auth";

export const runtime = "nodejs";

function mapRow(r) {
  const preferred = r.preferred_name?.trim() || "";
  const legal = `${r.last_name}, ${r.first_name}`;
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    preferredName: r.preferred_name || "",
    cardNumber: r.card_number,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    phone: r.phone,
    email: r.email,
    pitchFast: r.pitch_fast,
    pitchSlow: r.pitch_slow,
    status: r.status,
    notes: r.notes,
    displayName: preferred || legal,
  };
}

/** List umpires — any staff (field needs the list to assign). */
export async function GET(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") !== "0";

  const supabase = getServiceClient();
  let q = supabase
    .from("umpires")
    .select("*")
    .order("last_name")
    .order("first_name");
  if (activeOnly) q = q.eq("status", "active");

  const { data, error } = await q;
  if (error) {
    // Table may not exist yet before migration
    if (error.message?.includes("umpires") || error.code === "42P01") {
      return Response.json({ umpires: [], needsMigration: true });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ umpires: (data ?? []).map(mapRow) });
}

/** Create umpire — director only. */
export async function POST(request) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const first = String(body.firstName || "").trim();
  const last = String(body.lastName || "").trim();
  if (!first || !last) {
    return Response.json(
      { error: "Legal first and last name required" },
      { status: 400 }
    );
  }

  const pitchFast = Boolean(body.pitchFast);
  const pitchSlow = body.pitchSlow !== false; // default slow for this region
  if (!pitchFast && !pitchSlow) {
    return Response.json(
      { error: "Pick at least one pitch type (Fast / Slow)" },
      { status: 400 }
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("umpires")
    .insert({
      first_name: first,
      last_name: last,
      preferred_name: body.preferredName?.trim() || null,
      card_number: body.cardNumber?.trim() || null,
      address: body.address?.trim() || null,
      city: body.city?.trim() || null,
      state: body.state?.trim() || null,
      zip: body.zip?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      pitch_fast: pitchFast,
      pitch_slow: pitchSlow,
      status: body.status === "inactive" ? "inactive" : "active",
      notes: body.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ umpire: mapRow(data) });
}

/** Update umpire — director only. */
export async function PATCH(request) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const patch = { updated_at: new Date().toISOString() };
  if (body.firstName != null) patch.first_name = String(body.firstName).trim();
  if (body.lastName != null) patch.last_name = String(body.lastName).trim();
  if (body.preferredName !== undefined)
    patch.preferred_name = body.preferredName?.trim() || null;
  if (body.cardNumber !== undefined)
    patch.card_number = body.cardNumber?.trim() || null;
  if (body.address !== undefined) patch.address = body.address?.trim() || null;
  if (body.city !== undefined) patch.city = body.city?.trim() || null;
  if (body.state !== undefined) patch.state = body.state?.trim() || null;
  if (body.zip !== undefined) patch.zip = body.zip?.trim() || null;
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
  if (body.email !== undefined) patch.email = body.email?.trim() || null;
  if (body.pitchFast !== undefined) patch.pitch_fast = Boolean(body.pitchFast);
  if (body.pitchSlow !== undefined) patch.pitch_slow = Boolean(body.pitchSlow);
  if (body.status === "active" || body.status === "inactive")
    patch.status = body.status;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("umpires")
    .update(patch)
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ umpire: mapRow(data) });
}
