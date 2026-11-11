import Link from "next/link";
import { headers } from "next/headers";
import { getTournamentBasicsBySlug } from "@/lib/data";
import SiteNav from "@/components/SiteNav";

function tournamentSlugFromPath(pathname) {
  const m = /^\/tournaments\/([^/]+)/.exec(pathname || "");
  return m ? decodeURIComponent(m[1]) : null;
}

export default async function SiteHeader() {
  const pathname = (await headers()).get("x-pathname") || "";
  const slug = tournamentSlugFromPath(pathname);
  let name = null;
  if (slug) {
    try {
      const t = await getTournamentBasicsBySlug(slug);
      if (t?.name) name = t.name;
    } catch {
      name = null;
    }
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
          {name && slug ? (
            <Link href={`/tournaments/${slug}`} className="site-wordmark">
              {name}
            </Link>
          ) : (
            <Link href="/" className="site-wordmark">
              AFA SlowPitch
            </Link>
          )}
        </div>
        <SiteNav />
      </div>
    </header>
  );
}
