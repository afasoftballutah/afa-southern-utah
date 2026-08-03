"use client";

import { useCallback, useEffect, useState } from "react";

export default function ManageRoster({
  token,
  initialMembers,
  rosterToken,
  canEdit = true,
  /** Shown on the manager's row — "You" for managers, "Manager" for directors. */
  managerLabel = "You",
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pool, setPool] = useState([]);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addedLink, setAddedLink] = useState(null);
  const [copied, setCopied] = useState("");

  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/register/roster?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (res.ok) setPool(json.pool ?? []);
    } catch {
      /* pool optional if table missing */
    }
  }, [token]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  async function add() {
    setBusy(true);
    setError("");
    setAddedLink(null);
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, birthDate: birthDate || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add");
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? { ...m, removed: false, birthDate: json.member.birthDate ?? m.birthDate }
              : m
          );
        }
        return [
          ...cur,
          {
            id: json.member.id,
            name: json.member.name,
            role: "player",
            birthDate: json.member.birthDate || birthDate || null,
            signed: false,
            removed: false,
            isManager: false,
          },
        ];
      });
      setAddedLink(json.member);
      setName("");
      setBirthDate("");
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function claim(entry) {
    const whose = managerLabel === "Manager" ? "this roster" : "your roster";
    if (!window.confirm(`Add ${entry.name} from the free-agent pool to ${whose}?`)) return;
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
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? { ...m, removed: false, birthDate: json.member.birthDate ?? m.birthDate }
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
            signed: false,
            removed: false,
            isManager: false,
          },
        ];
      });
      setAddedLink(json.member);
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function restore(member) {
    if (!window.confirm(`Put ${member.name} back on the roster?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, restoreMemberId: member.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not restore");
      setMembers((cur) =>
        cur.map((m) =>
          m.id === member.id
            ? {
                ...m,
                removed: false,
                birthDate: json.member?.birthDate ?? m.birthDate,
                signed: json.member?.signed ?? m.signed,
              }
            : m
        )
      );
      setAddedLink(json.member);
      loadPool();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(member, toPool) {
    const msg = toPool
      ? `Release ${member.name} to the free-agent pool? Other teams in this tournament can claim them.`
      : `Take ${member.name} off the roster? They will not go into the free-agent pool.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, memberId: member.id, toPool: Boolean(toPool) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove");
      setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, removed: true } : m)));
      if (toPool) loadPool();
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

  return (
    <div className="space-y-4">
      <ul className="card divide-y divide-black/5">
        {active.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="t-body min-w-0">
              {m.name}
              {m.role !== "player" && <span className="t-meta"> &middot; {m.role}</span>}
              {m.gender ? <span className="t-meta"> &middot; {m.gender}</span> : null}
              {m.rating ? <span className="t-meta"> &middot; {m.rating}</span> : null}
              {m.signed ? (
                <span className="t-meta"> &middot; signed</span>
              ) : (
                <span className="t-meta"> &middot; unsigned</span>
              )}
              {!m.birthDate && <span className="t-meta"> &middot; no birth date</span>}
            </span>
            {m.isManager ? (
              <span className="t-label shrink-0">{managerLabel}</span>
            ) : canEdit ? (
              <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className="t-label text-afa-flag-blue underline"
                  disabled={busy}
                  onClick={() => remove(m, true)}
                  title="Other teams can claim them"
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
              </span>
            ) : null}
          </li>
        ))}
        {active.length === 0 && (
          <li className="px-4 py-3 t-meta">Nobody on the roster yet.</li>
        )}
      </ul>

      {canEdit && (
        <div className="card p-4 space-y-3">
          <p className="t-strong">Add a player</p>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">Name</span>
            <input
              className="w-full border border-afa-navy/30 rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-semibold mb-1">
              Birth date <span className="font-normal text-afa-ink/60">— needed for the waiver</span>
            </span>
            <input
              type="date"
              className="w-full border border-afa-navy/30 rounded px-3 py-2"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-action w-full"
            disabled={busy || !name.trim()}
            onClick={add}
          >
            {busy ? "Working…" : "Add to roster"}
          </button>

          {addedLink && (
            <div className="rounded-xl bg-afa-navy/5 p-3 space-y-2">
              <p className="t-meta">
                {addedLink.name} is on the roster. They can find their name on the
                team link, or use this one directly.
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
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="t-body">
                  {p.name}
                  {p.birth_date && (
                    <span className="t-meta"> · born {String(p.birth_date).slice(0, 10)}</span>
                  )}
                </span>
                <button
                  type="button"
                  className="pill shrink-0"
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

      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}

      {rosterToken && (
        <button
          type="button"
          className="btn-transient w-full"
          onClick={() =>
            copy(`${window.location.origin}/register/roster/${rosterToken}`, "roster")
          }
        >
          {copied === "roster" ? "Copied" : "Copy the team link"}
        </button>
      )}

      {removed.length > 0 && (
        <details open={removed.length <= 5}>
          <summary className="t-meta cursor-pointer">
            {removed.length} removed
            {canEdit ? " — restore to put them back" : ""}
          </summary>
          <ul className="mt-2 card divide-y divide-black/5">
            {removed.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-2"
              >
                <span className="t-meta">
                  {m.name}
                  {m.signed ? " · had signed" : ""}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    className="t-label text-afa-flag-blue underline shrink-0"
                    disabled={busy}
                    onClick={() => restore(m)}
                  >
                    Restore
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
