import {
  requireDirectorSession,
  verifyPin,
  setPin,
  hasFieldPin,
} from "@/lib/scorekeeper-auth";
import { checkLocked, recordAttempt } from "@/lib/scorekeeper-throttle";

export const runtime = "nodejs";

function lockedResponse(lock) {
  return Response.json(
    { error: "Too many wrong PINs — try again later." },
    { status: 429, headers: { "Retry-After": String(lock.retry_after_seconds) } }
  );
}

/**
 * Director only. Change director PIN and/or field scorekeeper PIN.
 * Body: { currentPin, newPin, which: "director" | "scorekeeper" }
 * currentPin must always be the director PIN (proves authority).
 */
export async function POST(request) {
  if (!(await requireDirectorSession())) {
    return Response.json(
      { error: "Director only — sign in to the control center first" },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { currentPin, newPin, which: rawWhich } = body ?? {};
  if (!currentPin || !newPin) {
    return Response.json(
      { error: "Current director PIN and new PIN required" },
      { status: 400 }
    );
  }
  if (!/^\d{4,8}$/.test(String(newPin))) {
    return Response.json({ error: "PIN must be 4-8 digits" }, { status: 400 });
  }

  const which =
    rawWhich === "scorekeeper" || rawWhich === "field"
      ? "scorekeeper"
      : "director";

  const existingLock = await checkLocked(request);
  if (existingLock) return lockedResponse(existingLock);

  // Only the director PIN authorizes a change.
  const ok = await verifyPin(currentPin);
  const newLock = await recordAttempt(request, ok);

  if (!ok) {
    if (newLock) return lockedResponse(newLock);
    return Response.json({ error: "Current director PIN is wrong" }, { status: 401 });
  }

  await setPin(newPin, which);
  return Response.json({
    ok: true,
    which,
    hasFieldPin: which === "scorekeeper" ? true : await hasFieldPin(),
  });
}

export async function GET() {
  if (!(await requireDirectorSession())) {
    return Response.json({ error: "Director only" }, { status: 403 });
  }
  return Response.json({ hasFieldPin: await hasFieldPin() });
}
