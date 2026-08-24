"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import {
  forgetRegistration,
  readMyRegistrations,
  rememberRegistration,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";
import { isPlaceholderManager, sameManager, sameRegistrationName } from "@/lib/register-key";
import { clubDivisionIds } from "@/lib/tournament-teams";

function sameSeat(a, b) {
  if (a.divisionId && b.divisionId) return a.divisionId === b.divisionId;
  if (a.seatLabel && b.seatLabel) return a.seatLabel === b.seatLabel;
  if (a.genderKey && b.genderKey && a.genderKey === b.genderKey) {
    return String(a.levelLabel || "") === String(b.levelLabel || "");
  }
  return false;
}

const LINK =
  "btn-transient text-sm px-3 py-1.5 min-h-0";
const MANAGE = "btn-action text-sm px-3 py-1.5 min-h-0";

function TeamRow({ r, slug, onForget }) {
  const divisionHref =
    r.divisionId && slug
      ? `/tournaments/${slug}/division/${r.divisionId}`
      : null;
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
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
        {r.manageToken ? (
          <Link
            href={`/register/manage/${encodeURIComponent(r.manageToken)}`}
            className={MANAGE}
          >
            Manage
          </Link>
        ) : null}
        {r.rosterToken ? (
          <Link
            href={`/register/roster/${encodeURIComponent(r.rosterToken)}`}
            className={LINK}
          >
            Team
          </Link>
        ) : null}
        {divisionHref ? (
          <Link href={divisionHref} className={LINK}>
            Division
          </Link>
        ) : null}
        {r.manageToken && onForget ? (
          <button
            type="button"
            className="t-meta px-2 py-1 leading-none"
            aria-label={`Forget ${r.teamName} on this phone`}
            title="Forget on this phone"
            onClick={() => onForget(r)}
          >
            ×
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
  onMineDivisions,
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
    const mine = readMyRegistrations().filter(
      (r) => r.tournamentSlug === slug && r.manageToken
    );
    if (mine.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/register/siblings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manageTokens: mine.map((r) => r.manageToken),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        for (const t of json.teams || []) {
          if (!t.manageToken || !t.teamName) continue;
          rememberRegistration({
            teamName: t.teamName,
            tournamentName: t.tournamentName,
            tournamentSlug: t.tournamentSlug || slug,
            divisionId: t.divisionId,
            manageToken: t.manageToken,
            rosterToken: t.rosterToken,
            manageLink: t.manageLink,
            rosterLink: t.rosterLink,
            genderKey: t.genderKey,
            genderLabel: t.genderLabel,
            levelLabel: t.levelLabel,
            seatLabel: t.seatLabel,
            managerEmail: t.managerEmail,
            managerName: t.managerName,
          });
        }
        if (!cancelled) {
          setLocal(
            readMyRegistrations().filter((r) => r.tournamentSlug === slug)
          );
        }
      } catch {
        /* offline — keep whatever this phone already has */
      }
    })();
    return () => {
      cancelled = true;
    };
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
          .slice(0, 12);

  function pick(t) {
    const mgr = (t.managerNames ?? [])[0] || "";
    const ids = isPlaceholderManager(mgr)
      ? t.divisionId
        ? [t.divisionId]
        : []
      : clubDivisionIds(teams, {
          teamName: t.name,
          managerName: mgr,
          divisionId: t.divisionId,
        });
    onTeam?.(t.name);
    onMineDivisions?.(ids);
    writeMe({ teamName: t.name, source: "picked" });
    try {
      window.localStorage.setItem(`afa-team-${slug}`, t.name);
    } catch {
      /* private browsing */
    }
    setQuery("");
    onPanel?.(null);
  }

  function forget(row) {
    if (row.manageToken) forgetRegistration(row.manageToken);
    const next = readMyRegistrations().filter((r) => r.tournamentSlug === slug);
    setLocal(next);
    if (
      selectedTeam === row.teamName &&
      !next.some((r) => sameRegistrationName(r.teamName, selectedTeam))
    ) {
      onTeam?.("");
      onMineDivisions?.([]);
    }
  }

  const shown = useMemo(() => {
    const rows = [...local];
    for (const t of teams) {
      const already = rows.some(
        (r) =>
          sameRegistrationName(r.teamName, t.name) &&
          sameSeat(r, t)
      );
      if (already) continue;
      const mine = local.filter((r) => sameRegistrationName(r.teamName, t.name));
      if (mine.length === 0) continue;
      const dirMgr = { managerName: (t.managerNames ?? [])[0] || "" };
      if (!mine.some((r) => sameManager(r, dirMgr))) continue;
      rows.push({
        teamName: t.name,
        divisionId: t.divisionId,
        genderKey: t.genderKey,
        genderLabel: t.genderLabel,
        levelLabel: t.levelLabel,
        seatLabel: t.seatLabel,
      });
    }
    return rows;
  }, [local, teams]);

  const shownDivisionIds = useMemo(
    () => [...new Set(shown.map((r) => r.divisionId).filter(Boolean))],
    [shown]
  );

  useEffect(() => {
    if (shownDivisionIds.length) onMineDivisions?.(shownDivisionIds);
  }, [shownDivisionIds, onMineDivisions]);

  return (
    <div className="space-y-3">
      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((r) => (
            <TeamRow
              key={r.manageToken || `${r.teamName}-${r.divisionId || r.seatLabel}`}
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
              {hits.map((t) => {
                const managers = (t.managerNames ?? []).filter((m) =>
                  String(m).toLowerCase().includes(needle)
                );
                return (
                  <li key={`${t.name}-${t.divisionId || t.seatLabel}`}>
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
                      <span className="min-w-0">
                        <span className="team-name font-semibold truncate block">
                          {t.name}
                        </span>
                        {managers.length > 0 ? (
                          <span className="t-meta block truncate mt-0.5">
                            {managers.join(", ")}
                          </span>
                        ) : null}
                      </span>
                      <DivisionSeatMark
                        genderKey={t.genderKey}
                        seatLabel={t.seatLabel}
                        genderLabel={t.genderLabel}
                        levelLabel={t.levelLabel}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
