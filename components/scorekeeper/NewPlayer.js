"use client";

import { useState } from "react";
import RoomShell, { RoomField, RoomHall } from "@/components/forms/RoomShell";
import { RATINGS } from "@/lib/class";
import { AddButton, DirectorAddPortal } from "./DirectorAddSlot";
import { directorPost } from "./DirectorForm";

const ROOM = { 1: "Name", 2: "Details" };

const empty = () => ({
  legalFirstName: "",
  legalLastName: "",
  preferredName: "",
  birthDate: "",
  email: "",
  gender: "",
  rating: "",
  address: "",
});

/**
 * Add player to the directory — Room flow like umpires.
 */
export default function NewPlayer() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(empty);
  const [baseline] = useState(() => JSON.stringify(empty()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = JSON.stringify(form) !== baseline;
  const display = [form.preferredName || form.legalFirstName, form.legalLastName]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(" ");

  function close() {
    setOpen(false);
    setPage(1);
    setForm(empty());
    setError("");
  }

  function page1Ok() {
    return (
      form.legalFirstName.trim().length > 0 &&
      form.legalLastName.trim().length > 0
    );
  }
  function page2Ok() {
    return (
      Boolean(form.birthDate) &&
      form.email.trim().length > 0 &&
      (form.gender === "M" || form.gender === "F")
    );
  }

  async function submit(e) {
    e?.preventDefault?.();
    setError("");
    if (page === 1) {
      if (!page1Ok()) {
        setError("Legal first and last name are required.");
        return;
      }
      setPage(2);
      return;
    }
    if (!page2Ok()) {
      setError("Birth date, email, and gender (M/F) are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await directorPost({
        action: "createPlayer",
        legalFirstName: form.legalFirstName.trim(),
        legalLastName: form.legalLastName.trim(),
        preferredName: form.preferredName.trim() || null,
        birthDate: form.birthDate,
        email: form.email.trim(),
        gender: form.gender || null,
        rating: form.rating || null,
        address: form.address.trim() || null,
      });
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err.message || "Could not create");
      setBusy(false);
    }
  }

  return (
    <>
      <DirectorAddPortal>
        {!open ? (
          <AddButton onClick={() => setOpen(true)}>+ Add player</AddButton>
        ) : null}
      </DirectorAddPortal>
      {open && (
    <div className="w-full min-w-0">
      <RoomShell
        title="Add player"
        roomTitle={ROOM[page]}
        page={page}
        totalPages={2}
        dirty={dirty}
        onClose={close}
        error={error}
        welcome={
          page === 1
            ? "Legal name as on a license or ID."
            : "Birth date is how we match this person later. Address is optional."
        }
        hall={
          page > 1 ? (
            <RoomHall
              lines={[{ label: "Name", value: display }]}
              onEdit={() => setPage(1)}
            />
          ) : null
        }
        onBack={page > 1 ? () => setPage(1) : null}
        primaryLabel={
          page < 2 ? "Continue" : busy ? "Saving…" : "Save to directory"
        }
        primaryDisabled={
          busy || (page === 1 ? !page1Ok() : !page2Ok())
        }
        busy={busy}
        onSubmit={submit}
        className="max-w-none"
      >
        {page === 1 && (
          <div className="grid grid-cols-3 gap-2">
            <RoomField
              label="Legal last"
              required
              autoComplete="family-name"
              value={form.legalLastName}
              onChange={(e) =>
                setForm({ ...form, legalLastName: e.target.value })
              }
            />
            <RoomField
              label="Legal first"
              required
              autoComplete="given-name"
              value={form.legalFirstName}
              onChange={(e) =>
                setForm({ ...form, legalFirstName: e.target.value })
              }
            />
            <RoomField
              label="Preferred"
              optional
              value={form.preferredName}
              onChange={(e) =>
                setForm({ ...form, preferredName: e.target.value })
              }
            />
          </div>
        )}
        {page === 2 && (
          <>
            <RoomField
              label="Birth date"
              required
              type="date"
              value={form.birthDate}
              onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
            />
            <RoomField
              label="Email"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <label className="block space-y-1">
              <span className="form-label font-bold text-afa-navy">Gender</span>
              <select
                className="form-field w-full"
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
              >
                <option value="">Pick…</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
              <p className="text-[11px] font-bold uppercase tracking-wide text-afa-navy">
                Required
              </p>
            </label>
            <label className="block space-y-1">
              <span className="form-label font-normal text-afa-muted">
                Rating
              </span>
              <select
                className="form-field w-full"
                value={form.rating}
                onChange={(e) => setForm({ ...form, rating: e.target.value })}
              >
                <option value="">—</option>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <p className="text-[11px] font-normal uppercase tracking-wide text-afa-muted/80">
                Optional
              </p>
            </label>
            <RoomField
              label="Address"
              optional
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </>
        )}
      </RoomShell>
    </div>
      )}
    </>
  );
}
