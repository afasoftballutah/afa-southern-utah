import { cookies } from "next/headers";
import { verifyPin, makeSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/scorekeeper-auth";
import { checkLocked, recordAttempt } from "@/lib/scorekeeper-throttle";

export const runtime = "nodejs";

function lockedResponse(lock) {
  return Response.json(
    { error: "Too many wrong PINs — try again later." },
    { status: 429, headers: { "Retry-After": String(lock.retry_after_seconds) } }
  );
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { pin, role: rawRole } = body ?? {};
  if (!pin) return Response.json({ error: "PIN required" }, { status: 400 });

  // director = full control center; scorekeeper = field-day tools only
  const role =
    rawRole === "scorekeeper" || rawRole === "field"
      ? "scorekeeper"
      : "director";

  // Gate before the bcrypt compare — cheaper, and a locked-out caller never
  // gets a timing signal from the compare at all.
  const existingLock = await checkLocked(request);
  if (existingLock) return lockedResponse(existingLock);

  const ok = await verifyPin(pin);
  const newLock = await recordAttempt(request, ok);

  if (!ok) {
    if (newLock) return lockedResponse(newLock);
    return Response.json({ error: "Wrong PIN" }, { status: 401 });
  }

  // `secure` follows the actual protocol rather than being hardcoded true.
  // A Secure cookie is DISCARDED by the browser over plain HTTP, so a
  // hardcoded true meant the door silently failed on any non-HTTPS origin:
  // the PIN verified, the server returned 200, the browser threw the
  // session away, and the director landed back on the PIN screen having
  // typed it correctly (found 2026-07-24 testing over Tailscale). On
  // Vercel the proxy sets x-forwarded-proto=https, so production keeps
  // Secure exactly as before — this only relaxes where Secure could not
  // have worked in the first place.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    new URL(request.url).protocol.replace(":", "");
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, makeSessionCookieValue(role), {
    httpOnly: true,
    secure: proto === "https",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return Response.json({ ok: true, role });
}
