import { requireScorekeeperSession, verifyPin, setPin } from "@/lib/scorekeeper-auth";

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
  const { currentPin, newPin } = body ?? {};
  if (!currentPin || !newPin) {
    return Response.json({ error: "Current and new PIN required" }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    return Response.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
  }

  const ok = await verifyPin(currentPin);
  if (!ok) return Response.json({ error: "Current PIN is wrong" }, { status: 401 });

  await setPin(newPin);
  return Response.json({ ok: true });
}
