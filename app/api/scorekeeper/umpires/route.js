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

/**
 * Create umpire, or merge two (action: "merge", keepId, dropId).
 * Director only.
 */
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

  // ---- Merge duplicate into keeper -----------------------------------
  if (body.action === "merge") {
    const keepId = body.keepId;
    const dropId = body.dropId;
    if (!keepId || !dropId) {
      return Response.json(
        { error: "keepId and dropId required" },
        { status: 400 }
      );
    }
    if (keepId === dropId) {
      return Response.json(
        { error: "Cannot merge an umpire into itself" },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const { data: keep, error: keepErr } = await supabase
      .from("umpires")
      .select("*")
      .eq("id", keepId)
      .maybeSingle();
    const { data: drop, error: dropErr } = await supabase
      .from("umpires")
      .select("*")
      .eq("id", dropId)
      .maybeSingle();
    if (keepErr || dropErr || !keep || !drop) {
      return Response.json({ error: "Umpire not found" }, { status: 404 });
    }

    // Point every game assignment at the keeper
    for (const table of ["games", "pool_games"]) {
      for (const col of ["umpire1_id", "umpire2_id"]) {
        const { error } = await supabase
          .from(table)
          .update({ [col]: keepId })
          .eq(col, dropId);
        if (error && error.code !== "42703" && !error.message?.includes("umpire")) {
          // Missing column = migration not run; ignore reassign
          if (!String(error.message || "").includes("does not exist")) {
            console.error(`merge reassign ${table}.${col}`, error);
          }
        }
      }
    }

    // Fill blank contact / card fields on the keeper from the duplicate
    const fill = {};
    const take = (keepKey, dropKey = keepKey) => {
      if ((keep[keepKey] == null || keep[keepKey] === "") && drop[dropKey]) {
        fill[keepKey] = drop[dropKey];
      }
    };
    take("preferred_name");
    take("card_number");
    take("address");
    take("city");
    take("state");
    take("zip");
    take("phone");
    take("email");
    take("notes");
    // Pitch: if keeper has only one type and drop has the other, set both
    if (!keep.pitch_fast && drop.pitch_fast) fill.pitch_fast = true;
    if (!keep.pitch_slow && drop.pitch_slow) fill.pitch_slow = true;
    if (Object.keys(fill).length) {
      fill.updated_at = new Date().toISOString();
      await supabase.from("umpires").update(fill).eq("id", keepId);
    }

    const { error: delErr } = await supabase
      .from("umpires")
      .delete()
      .eq("id", dropId);
    if (delErr) {
      return Response.json({ error: delErr.message }, { status: 500 });
    }

    const { data: updated } = await supabase
      .from("umpires")
      .select("*")
      .eq("id", keepId)
      .single();

    return Response.json({
      ok: true,
      umpire: mapRow(updated ?? keep),
      mergedAway: dropId,
    });
  }

  // ---- Create --------------------------------------------------------
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

/** Hard-delete umpire — director only. Games lose the assignment (ON DELETE SET NULL). */
export async function DELETE(request) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  const id =
    new URL(request.url).searchParams.get("id") ||
    (await request.json().catch(() => ({}))).id;
  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("umpires")
    .select("id, first_name, last_name")
    .eq("id", id)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Umpire not found" }, { status: 404 });
  }

  const { error } = await supabase.from("umpires").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({
    ok: true,
    deleted: `${existing.last_name}, ${existing.first_name}`,
  });
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
