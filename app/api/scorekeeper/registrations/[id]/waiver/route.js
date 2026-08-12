import { requireDirectorSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";

export const runtime = "nodejs";

// Official filled roster / liability release. Regenerates so names and
// signature stamps are current, then streams the PDF (same document View
// Waiver and Print PDF use).

export async function GET(_request, { params }) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = getServiceClient();

  const { data: registration, error } = await supabase
    .from("registrations")
    .select("id, team_name")
    .eq("id", id)
    .maybeSingle();

  if (error || !registration) {
    return Response.json({ error: "Registration not found" }, { status: 404 });
  }

  let path;
  try {
    path = await regenerateAndStoreWaiverPdf(id);
  } catch (err) {
    console.error("waiver regen failed", err);
    return Response.json(
      { error: "Could not build the roster form — please try again" },
      { status: 500 }
    );
  }

  const { data: file, error: dlError } = await supabase.storage
    .from("waivers")
    .download(path);

  if (dlError || !file) {
    console.error("waiver download failed", dlError);
    return Response.json({ error: "Could not open the waiver — please try again" }, { status: 500 });
  }

  const filename = `${String(registration.team_name || "roster").replace(/[^\w.-]+/g, "-")}-roster.pdf`;
  return new Response(file, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
