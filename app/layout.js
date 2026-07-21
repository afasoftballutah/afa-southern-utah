import "./globals.css";
import Link from "next/link";

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
      className="px-3 py-2 text-sm font-semibold text-white hover:text-afa-cream"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-afa-cream text-afa-ink antialiased">
        <header className="bg-afa-navy border-b-4 border-afa-red">
          <div className="max-w-4xl mx-auto flex items-center justify-between px-4 py-3">
            <Link href="/" className="text-white font-black text-lg tracking-tight">
              AFA <span className="text-afa-red">Southern Utah</span>
            </Link>
            <nav className="flex flex-wrap">
              <NavLink href="/tournaments">Tournaments</NavLink>
              <NavLink href="/rules">Rules</NavLink>
              <NavLink href="/register">Register</NavLink>
            </nav>
          </div>
        </header>

        <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6">
          {children}
        </main>

        <footer className="bg-afa-navy text-white text-sm">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-2">
            <p>
              American Fastpitch Association &mdash; Southern Utah Slow Pitch
              Division.
            </p>
            <p className="text-white/80">
              We collect names and contact info to run the league and
              register teams for tournaments. Nothing is sold.
            </p>
            <p className="text-white/80">
              Registering a team requires reading and signing the official
              AFA liability release. See{" "}
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
