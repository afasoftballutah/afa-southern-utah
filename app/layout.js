import { Anton } from "next/font/google";
import "./globals.css";
import Link from "next/link";

// ONE display face, used only for tournament names (Lacy, 2026-07-21) —
// everything else in the site stays plain. Self-hosted at build time by
// next/font — no runtime dependency on Google's CDN.
const displayFace = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-face",
});

export const metadata = {
  title: "AFA Southern Utah Slow-Pitch",
  description:
    "American Fastpitch Association — Southern Utah Slow Pitch Division. Tournaments, registration, and results for St. George area softball.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

function NavLink({ href, children }) {
  return (
    <Link
      href={href}
      className="px-2 sm:px-3 py-2 text-sm font-semibold text-white hover:text-white/70"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full ${displayFace.variable}`}>
      <body className="min-h-full flex flex-col bg-afa-cream text-afa-ink antialiased">
        {/* Masthead — navy ground, eagle at left, name in white. Thin red
            bar underneath is the one place red is decoration, not action. */}
        <header className="bg-afa-navy border-b-2 border-afa-red print:hidden">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-3 sm:px-4 py-3 gap-2">
            <Link href="/" className="flex items-center gap-2 min-w-0 shrink">
              {/* Logo glow (JD ruling, dispatch-brief-3): the mark is
                  blue-on-blue against the navy masthead. A halo that hugs
                  the PNG's own alpha footprint, never a box/panel behind
                  it. */}
              <img
                src="/afa-logo.png"
                alt=""
                width={32}
                height={32}
                className="shrink-0 [filter:drop-shadow(0_0_2px_rgba(253,250,243,0.95))_drop-shadow(0_0_6px_rgba(253,250,243,0.5))]"
              />
              {/* At phone width the glowing mark IS the identity — the
                  wordmark yields so the nav never collides (390px can't
                  hold both; measured 2026-07-23). Full name from sm: up. */}
              <span className="hidden sm:inline text-white font-black whitespace-nowrap sm:text-lg leading-tight tracking-tight">
                AFA Southern Utah
              </span>
            </Link>
            <nav className="flex items-center shrink-0">
              <NavLink href="/tournaments">Tournaments</NavLink>
              <NavLink href="/rules">Rules</NavLink>
              <Link
                href="/register"
                className="ml-1 sm:ml-2 px-2 sm:px-3 py-2 text-sm font-bold text-white bg-afa-red rounded"
              >
                Register
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6">{children}</main>

        <footer className="bg-afa-navy text-white text-sm print:hidden">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-2">
            <p>American Fastpitch Association &mdash; Southern Utah Slow Pitch Division.</p>
            <p className="text-white/80">
              We collect names and contact info to run the league. Nothing is sold.
            </p>
            <p className="text-white/80">
              Registering a team means reading and signing the official AFA
              release. See{" "}
              <Link href="/register" className="underline">
                Register
              </Link>{" "}
              for the full text.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
