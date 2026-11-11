import Link from "next/link";
import { getTournamentWordmarks } from "@/lib/data";
import SiteNav from "@/components/SiteNav";
import SiteWordmark from "@/components/SiteWordmark";

export default async function SiteHeader() {
  let tournaments = [];
  try {
    tournaments = await getTournamentWordmarks();
  } catch {
    tournaments = [];
  }
  return (
    <header className="site-header print:hidden">
      <div className="site-header__inner">
        <Link href="/" className="site-brand" aria-label="AFA SlowPitch home">
          <img
            className="site-brand__logo"
            src="/afa-logo.png"
            alt=""
            width={90}
            height={72}
          />
        </Link>
        <div className="site-wordmark-slot">
          <SiteWordmark tournaments={tournaments} />
        </div>
        <SiteNav />
      </div>
    </header>
  );
}
