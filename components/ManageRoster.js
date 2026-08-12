"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  managerPlayerDisplay,
  managerPlayerReady,
} from "@/components/ManagerPlayerFields";
import SuspendPlayer from "@/components/scorekeeper/SuspendPlayer";
import WaiverSignLink from "@/components/scorekeeper/WaiverSignLink";

export default function ManageRoster({
  token,
  initialMembers,
  rosterToken,
  canEdit = true,
  /** Shown on the manager's row — "You" for managers, "Manager" for directors. */
  managerLabel = "You",
  /** Directory people for the add-player dropdown (id, label, first, last, gender). */
  knownPlayers = [],
  /** Director registration page: show suspend controls mid-tournament. */
  directorMode = false,
  tournamentId = null,
  tournaments = [],
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pool, setPool] = useState([]);
  const [person, setPerson] = useState({
    firstName: "",
    lastName: "",
    gender: "",
    playerId: null,
  });
  // person.playerId set when manager picks from the directory search.
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState("search"); // search | manual
  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [needGender, setNeedGender] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [dualProbe, setDualProbe] = useState(null); // { warnings, otherTeams, hasSameGender }
  const [addedLink, setAddedLink] = useState(null);
  const [copied, setCopied] = useState("");

  const excludeIds = useMemo(
    () =>
      new Set(
        members.filter((m) => !m.removed && m.playerId).map((m) => m.playerId)
      ),
    [members]
  );
  const searchOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (knownPlayers ?? [])
      .filter((p) => !excludeIds.has(p.id))
      .filter(
        (p) =>
          (p.search && p.search.includes(q)) ||
          (p.label && p.label.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [knownPlayers, excludeIds, query]);

  function resetAddForm() {
    setPerson({ firstName: "", lastName: "", gender: "", playerId: null });
    setQuery("");
    setAddMode("search");
    setNeedGender(null);
    setListOpen(false);
    setDualProbe(null);
  }

  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);
  const dualCount = active.filter(
    (m) => (m.dualRosterTeams ?? []).length > 0
  ).length;

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/register/roster?token=${encodeURIComponent(token)}`
      );
      const json = await res.json();
      if (res.ok) setPool(json.pool ?? []);
    } catch {
      /* pool optional if table missing */
    }
  }, [token]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  async function probeDual(nextPerson) {
    const p = nextPerson || person;
    const name = managerPlayerDisplay(p);
    if (!name && !p.playerId) {
      setDualProbe(null);
      return null;
    }
    try {
      const q = new URLSearchParams({ token });
      if (name) q.set("probeName", name);
      if (p.playerId) q.set("probePlayerId", p.playerId);
      const res = await fetch(`/api/register/roster?${q}`);
      const json = await res.json();
      if (!res.ok) return null;
      const probe = {
        warnings: json.warnings ?? [],
        otherTeams: json.otherTeams ?? [],
        hasSameGender: Boolean(json.hasSameGender),
      };
      setDualProbe(probe.otherTeams.length ? probe : null);
      return probe;
    } catch {
      return null;
    }
  }

  async function submitPerson(override) {
    const p = override || person;
    if (!managerPlayerReady(p)) {
      setError("First name, last name, and gender (M/F) are required");
      return;
    }
    const probe = await probeDual(p);
    if (probe?.otherTeams?.length) {
      const teams = probe.otherTeams.map((t) => t.teamName).join(", ");
      const ok = window.confirm(
        `${managerPlayerDisplay(p)} is already on another same-gender team: ${teams}.\n\n` +
          `Not allowed without review: two Men's, two Women's, or two Coed teams.\n` +
          `(Coed + Men's or Coed + Women's is fine.)\n` +
          `You can still add them; both teams will show a Check flag for the director.\n\n` +
          `Add them anyway?`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError("");
    setWarning("");
    setAddedLink(null);
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          gender: p.gender,
          playerId: p.playerId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add");
      const dualTeams = json.member?.dualRosterTeams ?? [];
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? {
                  ...m,
                  removed: false,
                  name: json.member.name ?? m.name,
                  gender: json.member.gender ?? m.gender,
                  playerId: json.member.playerId ?? m.playerId,
                  dualRosterTeams: dualTeams,
                }
              : m
          );
        }
        return [
          ...cur,
          {
            id: json.member.id,
            name: json.member.name,
            role: "player",
            gender: json.member.gender || p.gender,
            birthDate: null,
            signed: false,
            removed: false,
            isManager: false,
            playerId: json.member.playerId || p.playerId || null,
            dualRosterTeams: dualTeams,
          },
        ];
      });
      setAddedLink(json.member);
      if (json.warnings?.length) {
        setWarning(json.warnings.join(" "));
      }
      resetAddForm();
      setAdding(false);
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function pickKnown(hit) {
    if (!hit) return;
    const base = {
      firstName: hit.firstName || "",
      lastName: hit.lastName || "",
      gender: hit.gender || "",
      playerId: hit.id,
    };
    if (base.gender === "M" || base.gender === "F") {
      submitPerson(base);
      return;
    }
    setNeedGender(base);
    setQuery("");
    setListOpen(false);
  }

  async function claim(entry) {
    const whose = managerLabel === "Manager" ? "this roster" : "your roster";
    if (
      !window.confirm(
        `Add ${entry.name} from the free-agent pool to ${whose}?`
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, poolId: entry.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not claim");
      const dualTeams = json.member?.dualRosterTeams ?? [];
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? {
                  ...m,
                  removed: false,
                  birthDate: json.member.birthDate ?? m.birthDate,
                  dualRosterTeams: dualTeams,
                }
              : m
          );
        }
        return [
          ...cur,
          {
            id: json.member.id,
            name: json.member.name,
            role: "player",
            birthDate: json.member.birthDate ?? null,
            gender: json.member.gender ?? null,
            signed: false,
            removed: false,
            isManager: false,
            dualRosterTeams: dualTeams,
          },
        ];
      });
      setAddedLink(json.member);
      if (json.warnings?.length) setWarning(json.warnings.join(" "));
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(m) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          memberId: m.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove");
      setMembers((cur) =>
        cur.map((row) =>
          row.id === m.id ? { ...row, removed: true, signed: row.signed } : row
        )
      );
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(m) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, restoreMemberId: m.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not restore");
      setMembers((cur) =>
        cur.map((row) =>
          row.id === m.id ? { ...row, removed: false } : row
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}
      {warning && (
        <p
          className="text-sm font-semibold text-amber-900 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
          role="status"
        >
          {warning}
        </p>
      )}
      {dualCount > 0 && (
        <p className="text-sm font-semibold text-amber-950 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          {dualCount} player{dualCount === 1 ? "" : "s"} also listed on another
          Men&apos;s, Women&apos;s, or Coed team this tournament — the director
          will see a Check flag. (Coed + Men&apos;s/Women&apos;s is fine.)
        </p>
      )}

      <ul className="card divide-y divide-black/5">
        {active.map((m) => (
          <li
            key={m.id}
            className={
              "flex flex-wrap items-center justify-between gap-2 px-4 py-3 " +
              (m.suspended
                ? "bg-afa-red/[0.06]"
                : (m.dualRosterTeams ?? []).length
                  ? "bg-amber-50/80"
                  : "")
            }
          >
            <span className="min-w-0">
              <span className="t-body font-semibold">
                {m.name}
                {m.gender ? (
                  <span className="t-meta font-normal"> · {m.gender}</span>
                ) : null}
                {m.isManager ? (
                  <span className="t-meta font-normal"> · {managerLabel}</span>
                ) : null}
                {m.suspended ? (
                  <span className="t-meta font-semibold text-afa-red">
                    {" "}
                    · Suspended
                  </span>
                ) : null}
                {(m.dualRosterTeams ?? []).length > 0 ? (
                  <span className="t-meta font-semibold text-amber-900">
                    {" "}
                    · Also on {m.dualRosterTeams.join(", ")}
                  </span>
                ) : null}
              </span>
              <span className="t-meta block">
                {m.signed ? "Signed" : "Waiting to sign"}
                {m.suspended
                  ? " · does not count toward roster requirements"
                  : ""}
              </span>
              {m.suspended && m.suspension?.note ? (
                <span className="t-meta block text-[12px] text-afa-red/90">
                  {m.suspension.note}
                </span>
              ) : null}
            </span>
            <span className="flex flex-wrap gap-1.5 items-center shrink-0">
              {m.signPath || m.signed ? (
                <WaiverSignLink href={m.signPath} signed={m.signed} />
              ) : null}
              {directorMode && m.playerId ? (
                <SuspendPlayer
                  player={{ id: m.playerId, name: m.name }}
                  tournaments={tournaments}
                  suspensions={m.suspensions ?? []}
                  defaultTournamentId={tournamentId}
                  buttonLabel="Suspend"
                  buttonClass={
                    m.suspended
                      ? "pill bg-afa-red/10 border-afa-red/40 text-afa-red"
                      : "pill"
                  }
                />
              ) : null}
              {canEdit && !m.isManager ? (
                <button
                  type="button"
                  className="pill text-afa-red border-afa-red/30"
                  disabled={busy}
                  onClick={() => remove(m)}
                >
                  Remove
                </button>
              ) : null}
            </span>
          </li>
        ))}
        {active.length === 0 && (
          <li className="px-4 py-3 t-meta">Nobody on the roster yet.</li>
        )}
      </ul>

      {canEdit && removed.length > 0 && (
        <div className="card p-4 space-y-2">
          <p className="t-strong">Removed</p>
          <ul className="divide-y divide-black/5">
            {removed.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <span className="t-meta">{m.name}</span>
                <button
                  type="button"
                  className="btn-transient text-sm"
                  disabled={busy}
                  onClick={() => restore(m)}
                >
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <div className="card p-3 space-y-2">
          {needGender && (
            <div className="space-y-2">
              <p className="t-body text-sm font-semibold">
                {managerPlayerDisplay(needGender)} — pick gender
              </p>
              <div className="flex gap-2">
                {["M", "F"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    className="flex-1 rounded-lg border-2 border-afa-navy/20 py-2 font-bold text-sm"
                    disabled={busy}
                    onClick={() => {
                      const next = { ...needGender, gender: g };
                      setNeedGender(null);
                      submitPerson(next);
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="t-label underline text-afa-muted"
                onClick={() => setNeedGender(null)}
              >
                Cancel
              </button>
            </div>
          )}

          {!needGender && !adding && (
            <button
              type="button"
              className="pill pill-solid w-full justify-center"
              onClick={() => {
                resetAddForm();
                setAdding(true);
                setError("");
                setWarning("");
                setAddedLink(null);
              }}
            >
              + Add player
            </button>
          )}

          {!needGender && adding && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="t-strong text-sm">Add player</p>
                <button
                  type="button"
                  className="t-label underline text-afa-muted"
                  onClick={() => {
                    resetAddForm();
                    setAdding(false);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
              <p className="t-meta text-[12px]">
                Search the directory — pick to add. Or type a new name.
              </p>

              {addMode === "search" && knownPlayers.length > 0 && (
                <div className="relative">
                  <input
                    type="search"
                    className="form-field"
                    value={query}
                    placeholder="Search last name, first name…"
                    autoComplete="off"
                    autoFocus
                    disabled={busy}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setListOpen(true);
                    }}
                    onFocus={() => setListOpen(true)}
                    onBlur={() => setTimeout(() => setListOpen(false), 150)}
                  />
                  {listOpen && query.trim() && (
                    <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-afa-navy/15 bg-white shadow-lg">
                      {searchOptions.length === 0 ? (
                        <li className="px-3 py-2 t-meta text-sm">
                          No match —{" "}
                          <button
                            type="button"
                            className="underline font-semibold"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              const parts = query.trim().split(/\s+/);
                              setPerson({
                                firstName: parts[0] || "",
                                lastName: parts.slice(1).join(" ") || "",
                                gender: "",
                                playerId: null,
                              });
                              setAddMode("manual");
                            }}
                          >
                            add as new
                          </button>
                        </li>
                      ) : (
                        searchOptions.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-afa-navy/5"
                              disabled={busy}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pickKnown(p)}
                            >
                              <span className="font-semibold">{p.label}</span>
                              {p.gender ? (
                                <span className="t-meta"> · {p.gender}</span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="t-label underline text-afa-muted mt-1"
                    onClick={() => setAddMode("manual")}
                  >
                    New player (type name)
                  </button>
                </div>
              )}

              {(addMode === "manual" || knownPlayers.length === 0) && (
                <div className="space-y-2">
                  {knownPlayers.length > 0 && (
                    <button
                      type="button"
                      className="t-label underline text-afa-muted"
                      onClick={() => setAddMode("search")}
                    >
                      ← Search directory
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="form-field"
                      placeholder="First"
                      value={person.firstName}
                      disabled={busy}
                      onChange={(e) =>
                        setPerson((d) => ({
                          ...d,
                          firstName: e.target.value,
                          playerId: null,
                        }))
                      }
                    />
                    <input
                      className="form-field"
                      placeholder="Last"
                      value={person.lastName}
                      disabled={busy}
                      onChange={(e) =>
                        setPerson((d) => ({
                          ...d,
                          lastName: e.target.value,
                          playerId: null,
                        }))
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    {["M", "F"].map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={busy}
                        className={
                          "flex-1 rounded-lg border-2 py-2 font-bold text-sm " +
                          (person.gender === g
                            ? "border-afa-navy bg-afa-navy text-white"
                            : "border-afa-navy/20")
                        }
                        onClick={() =>
                          setPerson((d) => ({ ...d, gender: g }))
                        }
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-action w-full"
                    disabled={busy || !managerPlayerReady(person)}
                    onClick={() => submitPerson()}
                  >
                    {busy ? "Saving…" : "Add to roster"}
                  </button>
                </div>
              )}
            </div>
          )}

          {addedLink && (
            <div className="rounded-lg bg-afa-navy/5 px-3 py-2 space-y-1">
              <p className="t-meta text-[13px]">
                {addedLink.name} added
                {addedLink.dualRosterTeams?.length
                  ? ` · also on ${addedLink.dualRosterTeams.join(", ")}`
                  : ""}
                .
              </p>
              <button
                type="button"
                className="t-label underline"
                onClick={() => copy(addedLink.signLink, "added")}
              >
                {copied === "added" ? "Copied" : "Copy signing link"}
              </button>
            </div>
          )}
        </div>
      )}

      {canEdit && pool.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="t-strong">Free-agent pool</p>
          <p className="t-meta">
            Players released from other teams in this tournament (same gender).
            Claim them onto your roster.
          </p>
          <ul className="divide-y divide-black/5 border border-black/5 rounded-lg">
            {pool.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <span className="t-body font-semibold">{p.name}</span>
                <button
                  type="button"
                  className="btn-transient text-sm"
                  disabled={busy}
                  onClick={() => claim(p)}
                >
                  Claim
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rosterToken && (
        <p className="t-meta">
          Team sign link:{" "}
          <a
            className="underline"
            href={`${origin}/register/roster/${rosterToken}`}
          >
            open roster
          </a>
        </p>
      )}
    </div>
  );
}
