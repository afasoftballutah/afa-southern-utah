// Anti-clickjacking (JD, 2026-11-10): no other site may put our pages in a
// frame. Our own pages may (the director print helpers use same-origin
// frames). The iOS app loads the site top-level in a WKWebView, which these
// headers do not affect. X-Frame-Options is the fallback for old browsers;
// when both are sent, browsers obey frame-ancestors.
export const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The site does not use camera, microphone, or geolocation.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Tokens live in the URL on these paths — do not leak them via Referer.
export const TOKEN_PATH_HEADERS = [
  ...SECURITY_HEADERS.filter((h) => h.key !== "Referrer-Policy"),
  { key: "Referrer-Policy", value: "no-referrer" },
];

const TOKEN_PATHS = [
  "/register/manage/:path*",
  "/register/roster/:path*",
  "/api/register/roster",
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // localhost and 127.0.0.1 are different origins in the browser; allow both in dev
  // so client JS / HMR work whether you open either URL.
  allowedDevOrigins: ["127.0.0.1", "localhost"],

  // Public images (files under /public, not /_next static assets): long
  // cache. immutable only on versioned names (e.g. *-v2.webp) so a replace
  // can bust the cache by renaming. Other assets keep their default headers.
  async headers() {
    const imageExt = "png|jpe?g|webp|gif|svg|ico|avif";
    const longCache = { key: "Cache-Control", value: "public, max-age=2592000" };
    const immutableCache = { key: "Cache-Control", value: "public, max-age=2592000, immutable" };
    // One path segment, or a known public/ subfolder — never /_next/*.
    const imageSources = [
      "/:file",
      "/posters/:file",
      "/brand/:file",
      "/guide/assets/:file",
      "/mockups/:file",
      "/docs/:file",
    ];
    // General long-cache first, then the versioned rule, so a *-v2.webp
    // match gets immutable (Next keeps the last matching Cache-Control).
    const imageHeaders = imageSources.flatMap((base) => [
      {
        source: `${base}(.*\\.(?:${imageExt}))`,
        headers: [...SECURITY_HEADERS, longCache],
      },
      {
        source: `${base}(.*-v\\d+\\.(?:${imageExt}))`,
        headers: [...SECURITY_HEADERS, immutableCache],
      },
    ]);
    const tokenHeaders = TOKEN_PATHS.map((source) => ({
      source,
      headers: TOKEN_PATH_HEADERS,
    }));
    return [
      ...imageHeaders,
      { source: "/:path*", headers: SECURITY_HEADERS },
      ...tokenHeaders,
    ];
  },

  // Old /scorekeeper/* director paths → /director/*; field → /scorekeeper/*
  async redirects() {
    return [
      {
        source: "/scorekeeper/field",
        destination: "/scorekeeper",
        permanent: true,
      },
      {
        source: "/scorekeeper/field/:path*",
        destination: "/scorekeeper/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/tournaments",
        destination: "/director/tournaments",
        permanent: true,
      },
      {
        source: "/scorekeeper/tournaments/:path*",
        destination: "/director/tournaments/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/teams",
        destination: "/director/teams",
        permanent: true,
      },
      {
        source: "/scorekeeper/teams/:path*",
        destination: "/director/teams/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/players",
        destination: "/director/players",
        permanent: true,
      },
      {
        source: "/scorekeeper/players/:path*",
        destination: "/director/players/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/registrations",
        destination: "/director/registrations",
        permanent: true,
      },
      {
        source: "/scorekeeper/registrations/:path*",
        destination: "/director/registrations/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/division/:path*",
        destination: "/director/division/:path*",
        permanent: true,
      },
      {
        source: "/scorekeeper/umpires",
        destination: "/director/umpires",
        permanent: true,
      },
      {
        source: "/scorekeeper/umpires/:path*",
        destination: "/director/umpires/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
