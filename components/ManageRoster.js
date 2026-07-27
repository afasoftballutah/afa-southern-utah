"use client";

import { useState } from "react";

export default function ManageRoster({ token, initialMembers, rosterToken }) {
  const [members, setMembers] = useState(initialMembers);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addedLink, setAddedLink] = useState(null);
  const [copied, setCopied] = useState("");

  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);

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
        if (back) return cur.map((m) => (m.id === back.id ? { ...m, removed: false } : m));
        return [
          ...cur,
          {
            id: json.member.id,
            name: json.member.name,
            role: "player",
            birthDate: birthDate || null,
            signed: false,
            removed: false,
            isManager: false,
          },
        ];
      });
      setAddedLink(json.member);
      setName("");
      setBirthDate("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(member) {
    if (!confirm(`Take ${member.name} off the roster?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/register/roster", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, memberId: member.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove");
      setMembers((cur) => cur.map((m) => (m.id === member.id ? { ...m, removed: true } : m)));
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
            <span className="t-body">
              {m.name}
              {m.role !== "player" && <span className="t-meta"> &middot; {m.role}</span>}
              {m.signed && <span className="t-meta"> &middot; signed</span>}
              {/* No birth date means no person record, and no way to know they
                  are the same player next season. Worth saying, quietly. */}
              {!m.birthDate && <span className="t-meta"> &middot; no birth date</span>}
            </span>
            {m.isManager ? (
              <span className="t-label shrink-0">You</span>
            ) : (
              <button
                type="button"
                className="t-label shrink-0 text-afa-red underline"
                disabled={busy}
                onClick={() => remove(m)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

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
        <button type="button" className="btn w-full" disabled={busy || !name.trim()} onClick={add}>
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
              className="btn-quiet w-full"
              onClick={() => copy(addedLink.signLink, "added")}
            >
              {copied === "added" ? "Copied" : "Copy their signing link"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="t-meta text-afa-red font-semibold">{error}</p>}

      <button
        type="button"
        className="btn-quiet w-full"
        onClick={() =>
          copy(`${window.location.origin}/register/roster/${rosterToken}`, "roster")
        }
      >
        {copied === "roster" ? "Copied" : "Copy the team link"}
      </button>

      {removed.length > 0 && (
        <details>
          <summary className="t-meta cursor-pointer">
            {removed.length} removed — add them back by name
          </summary>
          <ul className="mt-2 space-y-1">
            {removed.map((m) => (
              <li key={m.id} className="t-meta">
                {m.name}
                {m.signed && " · had signed"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
