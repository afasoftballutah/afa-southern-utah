import { Anton, Oswald } from "next/font/google";
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

// The bracket's team face (redesign spec 5.2). Condensed like the display
// face, so a team pill reads as a scoreboard, but VARIABLE: a team name is
// always black and its weight is what says winner, loser or undecided.
// Anton was tried first and cannot do that — it ships one weight, so a
// winner and a loser render identically. No `weight` here on purpose,
// which is what loads the variable cut.
const teamFace = Oswald({
  subsets: ["latin"],
  variable: "--font-team-face",
});

export const metadata = {
  title: "AFA Southern Utah Slow-Pitch",
  description:
    "America's recreational sport played as it should be. Great events, good times, family fun, best prizes, politics free. AFA Southern Utah Slow Pitch — tournaments, registration, and results.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`h-full ${displayFace.variable} ${teamFace.variable}`}>
      <body className="min-h-full flex flex-col antialiased">
        {/* Site shell — look lives in globals.css (.site-*). */}
        <header className="site-header print:hidden">
          <div className="site-header__inner">
            <Link href="/" className="site-brand">
              <img src="/afa-logo.png" alt="" width={32} height={32} />
              <span className="site-wordmark">AFA Softball Southern Utah</span>
            </Link>
            <nav className="site-nav">
              {/* Top bar: all dark-blue text links (uniform). Color-law buttons live in page content. */}
              <Link href="/tournaments" className="site-nav__link">
                Tournaments
              </Link>
              <Link href="/rules" className="site-nav__link">
                Rules
              </Link>
              <Link href="/register" className="site-nav__link">
                Register
              </Link>
            </nav>
          </div>
        </header>

        {/* The public site is read on a phone at a ballpark, so it stays narrow.
            The control center is a desk tool with eight-column tables and
            one-line forms, and 4xl was forcing them to wrap (JD, 2026-07-27:
            "should we use a slightly wider page?"). The class is set per
            route by the page below via a CSS variable on <body>. */}
        <main className="site-main">{children}</main>

        {/* Fine print, sized AND written like fine print (JD, 2026-07-24). */}
        <footer className="site-footer print:hidden">
          <div className="site-footer__inner">
            <p>AFA &mdash; Southern Utah Slow Pitch</p>
            <p className="site-footer__muted">
              Names and contacts only. Nothing is sold.
            </p>
            <p className="site-footer__muted">
              Registering means signing the AFA release &mdash; full text on{" "}
              <Link href="/register">Register</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
