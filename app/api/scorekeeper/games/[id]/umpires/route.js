import { getServiceClient } from "@/lib/supabase";
import { requireDirectorSession } from "@/lib/scorekeeper-auth";

export const runtime = "nodejs";

/**
 * Assign umpires to a bracket game or pool game — director only.
 * Body: { kind: 'bracket'|'pool', umpire1Id?: string|null, umpire2Id?: string|null }
 */
export async function PATCH(request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind = body.kind === "pool" ? "pool" : "bracket";
  const table = kind === "pool" ? "pool_games" : "games";
  const patch = {};
  if ("umpire1Id" in body) {
    patch.umpire1_id = body.umpire1Id || null;
  }
  if ("umpire2Id" in body) {
    patch.umpire2_id = body.umpire2Id || null;
  }
  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select("id, umpire1_id, umpire2_id")
    .single();

  if (error) {
    if (error.message?.includes("umpire") || error.code === "42703") {
      return Response.json(
        {
          error:
            "Umpire columns missing — run migration-2026-08-10-umpires.sql in Supabase",
        },
        { status: 503 }
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    game: {
      id: data.id,
      umpire1Id: data.umpire1_id,
      umpire2Id: data.umpire2_id,
    },
  });
}
