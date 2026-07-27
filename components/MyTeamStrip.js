"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readMe, writeMe } from "@/lib/me";
import { teamSlug } from "@/lib/teams";

// The "you" strip on the home page. Renders nothing until the device says
// who it belongs to, and nothing at all on the server — localStorage does not
// exist during render, and reading it in the render pass is the classic
// hydration mismatch (same reason TournamentBrowser uses this shape).
//
// It shows only what this device already knew. No lookup, no request: players
// and roster_members are service_role only and a public page must not be able
// to resolve a person. Everything here came from a pick or a signature made
// on this device.
export default function MyTeamStrip() {
  const [me, setMe] = useState(null);

  useEffect(() => setMe(readMe()), []);

  if (!me?.teamName) return null;

  return (
    <section className="max-w-md mx-auto">
      <div className="card p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-label">{me.name ? `${me.name} · your team` : "Your team"}</p>
          <Link href={`/teams/${teamSlug(me.teamName)}`} className="team-name text-lg">
            {me.teamName}
          </Link>
          <p className="t-meta">Every schedule opens on them.</p>
        </div>
        <button
          type="button"
          className="t-label shrink-0 underline text-afa-muted"
          onClick={() => {
            writeMe(null);
            setMe(null);
          }}
        >
          Not me
        </button>
      </div>
    </section>
  );
}
