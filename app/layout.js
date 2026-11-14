import { Anton, Outfit } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { Analytics } from "@vercel/analytics/next";

// Display — Anton for wordmark + titles. Self-hosted via next/font.
const displayFace = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display-face",
});

// Body + teams — Outfit (variable weight covers winner/loser on the bracket).
const bodyFace = Outfit({
  subsets: ["latin"],
  variable: "--font-body-face",
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
    <html
      lang="en"
      className={`h-full ${displayFace.variable} ${bodyFace.variable}`}
    >
      <body className="min-h-full flex flex-col antialiased">
        {/* Review copy only (scratch data, never prod): NEXT_PUBLIC_REVIEW_COPY=1
            at build time. Off by default; nothing sets it in this repo. */}
        {process.env.NEXT_PUBLIC_REVIEW_COPY === "1" ? (
          <div
            role="status"
            className="print:hidden"
            style={{ background: "#fde68a", color: "#78350f", fontSize: "12px", lineHeight: "1.4", padding: "3px 8px", textAlign: "center", fontWeight: 600 }}
          >
            Review copy, test data
          </div>
        ) : null}
        {/* Site shell — look lives in globals.css (.site-*). On a
            tournament page the wordmark is that tournament's name (JD,
            2026-11-11); the logo still goes home. */}
        <SiteHeader />

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
        <Analytics />
      </body>
    </html>
  );
}
