import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { generateBracket } from "@/lib/bracket/generate";
import { isBracketDraft } from "@/lib/bracket/propagate";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { divisionId, format } = body ?? {};
  if (!divisionId) return Response.json({ error: "Missing divisionId" }, { status: 400 });

  const draft = await isBracketDraft(divisionId);
  if (!draft) {
    return Response.json(
      { error: "This bracket is locked — a real game already has a score. Generating again would erase results." },
      { status: 409 }
    );
  }

  try {
    const result = await generateBracket(divisionId, format === "double_elim_consolation" ? "double_elim_consolation" : "double_elim");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ error: err.message || "Could not generate bracket" }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!(await requireScorekeeperSession())) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const divisionId = searchParams.get("divisionId");
  if (!divisionId) return Response.json({ error: "Missing divisionId" }, { status: 400 });

  const draft = await isBracketDraft(divisionId);
  if (!draft) {
    return Response.json({ error: "This bracket is locked — can't clear it." }, { status: 409 });
  }

  const supabase = getServiceClient();
  await supabase.from("games").delete().eq("division_id", divisionId);
  await supabase.from("brackets").delete().eq("division_id", divisionId);
  return Response.json({ ok: true });
}
