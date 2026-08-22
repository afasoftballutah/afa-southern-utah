import { requireDirectorSession } from "@/lib/scorekeeper-auth";
import { getServiceClient } from "@/lib/supabase";
import { parseSheetModelText, responsesOutputText } from "@/lib/bracket/read-sheet";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "grok-4.5";
const MAX_IMAGE_CHARS = 2_800_000; // ~2MB of base64

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function POST(request) {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }

  const key = process.env.XAI_API_KEY;
  if (!key) {
    return bad("Set XAI_API_KEY on the server to read a sheet photo.", 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const divisionId = body.divisionId;
  const image = String(body.image ?? "");
  if (!divisionId) return bad("Which division?");
  if (!image.startsWith("data:image/")) return bad("Need a photo of the sheet.");
  if (image.length > MAX_IMAGE_CHARS) return bad("That photo is too large. Step back and try again.");

  const supabase = getServiceClient();
  const { data: division } = await supabase
    .from("divisions")
    .select("id")
    .eq("id", divisionId)
    .maybeSingle();
  if (!division) return bad("Division not found", 404);

  const { data: regs } = await supabase
    .from("registrations")
    .select("team_name")
    .eq("division_id", divisionId)
    .neq("status", "withdrawn");
  const knownTeams = (regs ?? []).map((r) => r.team_name).filter(Boolean);

  const teamHint = knownTeams.length
    ? `Known team names in this division (prefer these spellings): ${knownTeams.join(", ")}.`
    : "Team names as written on the sheet.";

  const prompt = `This is a photo of a slow-pitch tournament bracket sheet (paper).
Extract every game. Reply with JSON only, no markdown:
{"games":[{"n":1,"a":"Team or Winner of Game 2","b":"Team or Loser of Game 3","field":null,"time":null}]}
Rules:
- n is the printed GAME number (G1, Game 4), not a round name.
- If a slot says Winner of Game N or Loser of Game N, copy that exactly.
- ${teamHint}
- field optional (F4, Field 4). time optional (9:00 AM, 2p).
- Skip blank games. Combine winners and losers bands if both are in the photo.`;

  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  let json = null;
  const responses = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: image, detail: "high" },
            { type: "input_text", text: prompt },
          ],
        },
      ],
    }),
  });
  json = await responses.json().catch(() => null);
  let text = responses.ok ? responsesOutputText(json) : "";
  if (!text) {
    const chat = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image, detail: "high" } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    json = await chat.json().catch(() => null);
    if (!chat.ok) {
      console.error("from-photo xAI", chat.status, json);
      return bad(json?.error?.message || "Could not read that photo.", 502);
    }
    text = json?.choices?.[0]?.message?.content ?? "";
  }

  try {
    const draft = parseSheetModelText(text, {
      knownTeams,
      playDay: body.playDay || null,
    });
    return Response.json({ ok: true, games: draft.games });
  } catch (err) {
    return bad(err.message || "Could not read games off that photo.");
  }
}
