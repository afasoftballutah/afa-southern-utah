"use client";

import { useCallback, useEffect, useState } from "react";
import PersonWizard from "@/components/forms/PersonWizard";

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
  const [person, setPerson] = useState({
    legalFirstName: "",
    legalLastName: "",
    preferredName: "",
    email: "",
    birthDate: "",
  });
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addedLink, setAddedLink] = useState(null);
  const [copied, setCopied] = useState("");

  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);

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

  async function submitPerson(p) {
    if (!p.legalFirstName?.trim() || !p.legalLastName?.trim()) {
      setError("Legal first and last name are required");
      return;
    }
    setBusy(true);
    setError("");
    setAddedLink(null);
    try {
      const res = await fetch("/api/register/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          legalFirstName: p.legalFirstName.trim(),
          legalLastName: p.legalLastName.trim(),
          preferredName: p.preferredName?.trim() || null,
          email: p.email?.trim() || null,
          birthDate: p.birthDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not add");
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? {
                  ...m,
                  removed: false,
                  birthDate: json.member.birthDate ?? m.birthDate,
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
            birthDate: json.member.birthDate || p.birthDate || null,
            signed: false,
            removed: false,
            isManager: false,
          },
        ];
      });
      setAddedLink(json.member);
      setPerson({
        legalFirstName: "",
        legalLastName: "",
        preferredName: "",
        email: "",
        birthDate: "",
      });
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
      setMembers((cur) => {
        const back = cur.find((m) => m.id === json.member.id);
        if (back) {
          return cur.map((m) =>
            m.id === back.id
              ? {
                  ...m,
                  removed: false,
                  birthDate: json.member.birthDate ?? m.birthDate,
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

      <ul className="card divide-y divide-black/5">
        {active.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <span className="min-w-0">
              <span className="t-body font-semibold">
                {m.name}
                {m.isManager ? (
                  <span className="t-meta font-normal"> · {managerLabel}</span>
                ) : null}
              </span>
              <span className="t-meta block">
                {m.signed ? "Signed" : "Waiting to sign"}
                {m.birthDate ? ` · born ${m.birthDate}` : ""}
              </span>
            </span>
            {canEdit && !m.isManager ? (
              <span className="flex flex-wrap gap-2">
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
              </span>
            ) : null}
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
                  onClick={() => setAdding(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
              <p className="t-meta">
                Legal name must match a license or official ID. Preferred name
                is optional for the roster. Then birth date.
              </p>
              {busy ? (
                <p className="t-meta">Saving…</p>
              ) : (
                <PersonWizard
                  key="add-player"
                  variant="addPlayer"
                  value={person}
                  onChange={setPerson}
                  onComplete={submitPerson}
                  completeLabel="Add to roster"
                  fieldClass="w-full border border-afa-navy/30 rounded px-3 py-2"
                />
              )}
            </>
          )}

          {addedLink && (
            <div className="rounded-xl bg-afa-navy/5 p-3 space-y-2">
              <p className="t-meta">
                {addedLink.name} is on the roster. They can find their name on
                the team link, or use this one directly.
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
