import { NextResponse } from "next/server";

// So the root SiteHeader can tell a tournament page from the rest of the
// site (the root layout does not receive the [slug] param).
export function middleware(request) {
  const res = NextResponse.next();
  res.headers.set("x-pathname", request.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
