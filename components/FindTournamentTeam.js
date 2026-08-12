"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import {
  forgetTeamOnDevice,
  readMyRegistrations,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";

function TeamRow({ r, slug, onForget }) {
  return (
    <li
      className={
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 " +
        (r.genderKey
          ? "reg-team-row--" + r.genderKey
          : "border-afa-navy/10 bg-white")
      }
    >
      <div className="min-w-0">
        <p className="team-name font-semibold truncate">{r.teamName}</p>
        <p className="t-meta flex flex-wrap items-center gap-1.5 mt-0.5">
          <DivisionSeatMark
            genderKey={r.genderKey}
            seatLabel={r.seatLabel}
            genderLabel={r.genderLabel}
            levelLabel={r.levelLabel}
          />
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {r.manageToken ? (
          <Link
            href={`/register/manage/${encodeURIComponent(r.manageToken)}`}
            className="btn-action text-sm px-3 py-1.5"
          >
            Manage roster
          </Link>
        ) : null}
        {r.rosterToken ? (
          <Link
            href={`/register/roster/${encodeURIComponent(r.rosterToken)}`}
            className="btn-transient text-sm px-3 py-1.5"
          >
            Team link
          </Link>
        ) : r.divisionId ? (
          <Link
            href={`/tournaments/${slug}/division/${r.divisionId}`}
            className="btn-transient text-sm px-3 py-1.5"
          >
            Division
          </Link>
        ) : null}
        {r.manageToken && onForget ? (
          <button
            type="button"
            className="t-meta underline"
            onClick={() => onForget(r.teamName)}
          >
            Forget
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * User's teams first. Then Find (team or manager name) or Register.
 */
export default function FindTournamentTeam({
  slug,
  teams = [],
  selectedTeam = "",
  onTeam,
  registrationOpen = false,
  externalRegisterUrl = null,
  panel = null,
  onPanel,
}) {
  const [query, setQuery] = useState("");
  const [local, setLocal] = useState([]);

  useEffect(() => {
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
  }, [slug]);

  useEffect(() => {
    if (selectedTeam) return;
    const mine = readMyRegistrations().find((r) => r.tournamentSlug === slug);
    if (mine?.teamName) onTeam?.(mine.teamName);
  }, [slug, selectedTeam, onTeam]);

  const needle = query.trim().toLowerCase();
  const hits =
    needle.length === 0
      ? []
      : teams
          .filter((t) => {
            if (t.name.toLowerCase().includes(needle)) return true;
            return (t.managerNames ?? []).some((m) =>
              String(m).toLowerCase().includes(needle)
            );
          })
          .slice(0, 8);

  function pick(t) {
    onTeam?.(t.name);
    writeMe({ teamName: t.name, source: "picked" });
    try {
      window.localStorage.setItem(`afa-team-${slug}`, t.name);
    } catch {
      /* private browsing */
    }
    setQuery("");
  }

  function forget(name) {
    forgetTeamOnDevice(name);
    setLocal(readMyRegistrations().filter((r) => r.tournamentSlug === slug));
    if (selectedTeam === name) onTeam?.("");
  }

  const shown = [...local];
  if (selectedTeam && !shown.some((r) => r.teamName === selectedTeam)) {
    const t = teams.find((x) => x.name === selectedTeam);
    if (t) {
      shown.push({
        teamName: t.name,
        divisionId: t.divisionId,
        genderKey: t.genderKey,
        genderLabel: t.genderLabel,
        levelLabel: t.levelLabel,
        seatLabel: t.seatLabel,
      });
    }
  }

  return (
    <div className="space-y-3">
      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((r) => (
            <TeamRow
              key={r.manageToken || r.teamName}
              r={r}
              slug={slug}
              onForget={r.manageToken ? forget : undefined}
            />
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={panel === "find" ? "btn-action flex-1" : "btn-transient flex-1"}
          aria-pressed={panel === "find"}
          onClick={() => onPanel?.(panel === "find" ? null : "find")}
        >
          Find my team
        </button>
        {registrationOpen ? (
          externalRegisterUrl ? (
            <a
              href={externalRegisterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-transient flex-1 text-center"
            >
              Register
            </a>
          ) : (
            <button
              type="button"
              className={
                panel === "register" ? "btn-action flex-1" : "btn-transient flex-1"
              }
              aria-pressed={panel === "register"}
              onClick={() => onPanel?.(panel === "register" ? null : "register")}
            >
              Register
            </button>
          )
        ) : null}
      </div>

      {panel === "find" ? (
        <div className="form-surface p-4 space-y-2">
          <input
            type="search"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Team or manager name"
            aria-label="Team or manager name"
            aria-autocomplete="list"
            className="form-field w-full"
          />
          {needle.length > 0 && hits.length === 0 ? (
            <p className="t-meta">No team matches that name.</p>
          ) : null}
          {hits.length > 0 ? (
            <ul className="space-y-2" role="listbox">
              {hits.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    role="option"
                    className={
                      "w-full text-left flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 " +
                      (t.genderKey
                        ? "reg-team-row--" + t.genderKey
                        : "border-afa-navy/10 bg-white")
                    }
                    onClick={() => pick(t)}
                  >
                    <span className="team-name font-semibold truncate">
                      {t.name}
                    </span>
                    <DivisionSeatMark
                      genderKey={t.genderKey}
                      seatLabel={t.seatLabel}
                      genderLabel={t.genderLabel}
                      levelLabel={t.levelLabel}
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
