import { requireScorekeeperSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || "");
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

async function uploadPhoto(supabase, divisionId, place, photoDataUrl) {
  if (!photoDataUrl) return null;
  const decoded = decodeDataUrl(photoDataUrl);
  if (!decoded) throw new Error("Photo must be a valid image data URL");
  const ext = decoded.contentType.split("/")[1] || "jpg";
  const path = `${divisionId}-${place}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("photos")
    .upload(path, decoded.buffer, { contentType: decoded.contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return data.publicUrl;
}

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
  const { divisionId, champion, runnerUp } = body ?? {};
  if (!divisionId || !champion?.teamName || !runnerUp?.teamName) {
    return Response.json({ error: "divisionId, champion, and runnerUp team names are required" }, { status: 400 });
  }

  const supabase = getServiceClient();

  try {
    const championPhotoUrl = await uploadPhoto(supabase, divisionId, "champion", champion.photoDataUrl);
    const runnerUpPhotoUrl = await uploadPhoto(supabase, divisionId, "runner_up", runnerUp.photoDataUrl);

    // Replace any existing placements for this division (re-recording is
    // fine — a director fixing a mistaken photo shouldn't need a DB console).
    await supabase.from("placements").delete().eq("division_id", divisionId);

    const { error: insertError } = await supabase.from("placements").insert([
      { division_id: divisionId, place: "champion", team_name: champion.teamName, photo_url: championPhotoUrl },
      { division_id: divisionId, place: "runner_up", team_name: runnerUp.teamName, photo_url: runnerUpPhotoUrl },
    ]);
    if (insertError) throw new Error(insertError.message);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message || "Could not save placements" }, { status: 500 });
  }
}
