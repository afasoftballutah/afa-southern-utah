import { requireScorekeeperSession, verifyPin, setPin } from "@/lib/scorekeeper-auth";
import { checkLocked, recordAttempt } from "@/lib/scorekeeper-throttle";

export const runtime = "nodejs";

function lockedResponse(lock) {
  return Response.json(
    { error: "Too many wrong PINs — try again later." },
    { status: 429, headers: { "Retry-After": String(lock.retry_after_seconds) } }
  );
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
  const { currentPin, newPin } = body ?? {};
  if (!currentPin || !newPin) {
    return Response.json({ error: "Current and new PIN required" }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    return Response.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
  }

  // Same PIN-compare attack surface as /api/scorekeeper/auth — throttle it
  // the same way (a stolen/valid session cookie shouldn't turn into a free
  // pass to brute-force the current PIN here).
  const existingLock = await checkLocked(request);
  if (existingLock) return lockedResponse(existingLock);

  const ok = await verifyPin(currentPin);
  const newLock = await recordAttempt(request, ok);

  if (!ok) {
    if (newLock) return lockedResponse(newLock);
    return Response.json({ error: "Current PIN is wrong" }, { status: 401 });
  }

  await setPin(newPin);
  return Response.json({ ok: true });
}
