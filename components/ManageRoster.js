"use client";

import { useCallback, useEffect, useState } from "react";
import ManagerPlayerFields, {
  managerPlayerDisplay,
  managerPlayerReady,
} from "@/components/ManagerPlayerFields";
import SuspendPlayer from "@/components/scorekeeper/SuspendPlayer";

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [dualProbe, setDualProbe] = useState(null); // { warnings, otherTeams, hasSameGender }
  const [addedLink, setAddedLink] = useState(null);
  const [copied, setCopied] = useState("");

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

  function onPersonChange(next) {
    setPerson(next);
    setError("");
    // Probe when we have a directory pick or a complete name
    if (next.playerId || managerPlayerReady(next)) {
      probeDual(next);
    } else {
      setDualProbe(null);
    }
  }

  async function submitPerson() {
    if (!managerPlayerReady(person)) {
      setError("First name, last name, and gender (M/F) are required");
      return;
    }
    const probe = dualProbe || (await probeDual(person));
    if (probe?.otherTeams?.length) {
      const teams = probe.otherTeams.map((t) => t.teamName).join(", ");
      const ok = window.confirm(
        `${managerPlayerDisplay(person)} is already on another same-gender team: ${teams}.\n\n` +
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
          firstName: person.firstName.trim(),
          lastName: person.lastName.trim(),
          gender: person.gender,
          playerId: person.playerId || null,
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
            gender: json.member.gender || person.gender,
            birthDate: null,
            signed: false,
            removed: false,
            isManager: false,
            playerId: json.member.playerId || person.playerId || null,
            dualRosterTeams: dualTeams,
          },
        ];
      });
      setAddedLink(json.member);
      if (json.warnings?.length) {
        setWarning(json.warnings.join(" "));
      }
      setPerson({ firstName: "", lastName: "", gender: "", playerId: null });
      setDualProbe(null);
      setAdding(false);
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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

  async function remove(m, toPool) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          memberId: m.id,
          toPool: Boolean(toPool),
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
            <span className="flex flex-wrap gap-2 items-center">
              {directorMode && m.playerId ? (
                <SuspendPlayer
                  player={{ id: m.playerId, name: m.name }}
                  tournaments={tournaments}
                  suspensions={m.suspensions ?? []}
                  defaultTournamentId={tournamentId}
                  buttonLabel="Suspend"
                  buttonClass={
                    m.suspended
                      ? "pill bg-afa-red/10 border-afa-red/40 text-afa-red text-[12px]"
                      : "pill text-[12px]"
                  }
                />
              ) : null}
              {canEdit && !m.isManager ? (
                <>
                  <button
                    type="button"
                    className="t-label underline"
                    disabled={busy}
                    onClick={() => remove(m, true)}
                  >
                    To pool
                  </button>
                  <button
                    type="button"
                    className="t-label text-afa-red underline"
                    disabled={busy}
                    onClick={() => remove(m, false)}
                  >
                    Remove
                  </button>
                </>
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
        <div className="card p-4 space-y-3">
          {!adding ? (
            <button
              type="button"
              className="btn-action w-full"
              onClick={() => {
                setAdding(true);
                setError("");
                setWarning("");
                setDualProbe(null);
                setAddedLink(null);
              }}
            >
              + Add a player
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="t-strong">Add a player</p>
                <button
                  type="button"
                  className="t-label underline text-afa-muted"
                  onClick={() => {
                    setAdding(false);
                    setDualProbe(null);
                  }}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
              <p className="t-meta">
                Search for someone already on file, or type first name, last
                name, and gender. They fill in legal name, preferred name, birth
                date, email, and address when they sign their waiver.
              </p>
              {dualProbe?.otherTeams?.length > 0 && (
                <div
                  className={
                    "rounded-lg border px-3 py-2 text-sm " +
                    (dualProbe.hasSameGender
                      ? "border-afa-red/40 bg-afa-red/10 text-afa-red font-semibold"
                      : "border-amber-300 bg-amber-50 text-amber-950 font-semibold")
                  }
                  role="status"
                >
                  {dualProbe.warnings.map((w, i) => (
                    <p key={i} className={i > 0 ? "mt-1" : undefined}>
                      {w}
                    </p>
                  ))}
                </div>
              )}
              <ManagerPlayerFields
                value={person}
                onChange={onPersonChange}
                knownPlayers={knownPlayers}
                excludePlayerIds={members
                  .filter((m) => !m.removed && m.playerId)
                  .map((m) => m.playerId)}
                fieldClass="w-full border border-afa-navy/30 rounded px-3 py-2"
              />
              <button
                type="button"
                className="btn-action w-full"
                disabled={busy || !managerPlayerReady(person)}
                onClick={submitPerson}
              >
                {busy
                  ? "Saving…"
                  : `Add ${managerPlayerDisplay(person) || "to roster"}`}
              </button>
            </>
          )}

          {addedLink && (
            <div className="rounded-xl bg-afa-navy/5 p-3 space-y-2">
              <p className="t-meta">
                {addedLink.name} is on the roster. They complete their own
                details and sign on their link (or the team roster link).
              </p>
              <button
                type="button"
                className="btn-transient w-full"
                onClick={() => copy(addedLink.signLink, "added")}
              >
                {copied === "added" ? "Copied" : "Copy their signing link"}
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
