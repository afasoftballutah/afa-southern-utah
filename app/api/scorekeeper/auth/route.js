import { cookies } from "next/headers";
import { verifyPin, makeSessionCookieValue, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/scorekeeper-auth";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const { pin } = body ?? {};
  if (!pin) return Response.json({ error: "PIN required" }, { status: 400 });

  const ok = await verifyPin(pin);
  if (!ok) return Response.json({ error: "Wrong PIN" }, { status: 401 });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, makeSessionCookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });

  return Response.json({ ok: true });
}
