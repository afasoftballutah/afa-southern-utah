"use client";

import { useState } from "react";
import RoomShell, { RoomField, RoomHall } from "@/components/forms/RoomShell";
import { directorPost } from "./DirectorForm";
import { venueLabel, resolveVenue } from "@/lib/director";

const REGIONS = [
  { value: "southern_utah", label: "Southern Utah" },
  { value: "northern_utah", label: "Northern Utah" },
  { value: "colorado", label: "Colorado" },
  { value: "arizona", label: "Arizona" },
  { value: "nevada", label: "Nevada" },
];

const ROOM = { 1: "Name", 2: "When & where" };

const empty = () => ({
  name: "",
  startDate: "",
  endDate: "",
  venueName: "",
  region: "southern_utah",
});

/**
 * Add tournament — same Room flow as add umpire.
 * Door: name → When & where → create.
 */
export default function NewTournament({ venues = [] }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(empty);
  const [baseline] = useState(() => JSON.stringify(empty()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const dirty = JSON.stringify(form) !== baseline;

  function close() {
    setOpen(false);
    setPage(1);
    setForm(empty());
    setError("");
  }

  function page1Ok() {
    return form.name.trim().length > 0;
  }
  function page2Ok() {
    return Boolean(form.startDate);
  }

  async function submit(e) {
    e?.preventDefault?.();
    setError("");
    if (page === 1) {
      if (!page1Ok()) {
        setError("Tournament name is required.");
        return;
      }
      setPage(2);
      return;
    }
    if (!page2Ok()) {
      setError("Start date is required.");
      return;
    }
    setBusy(true);
    try {
      const res = await directorPost({
        action: "createTournament",
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        venueName: resolveVenue(form.venueName, venues),
        region: form.region,
      });
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
      if (res.tournament?.id) {
        window.location.href = `/director/tournaments/${res.tournament.id}`;
        return;
      }
      window.location.reload();
    } catch (err) {
      setError(err.message || "Could not create");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn-action shrink-0"
        onClick={() => setOpen(true)}
      >
        + Add tournament
      </button>
    );
  }

  return (
    <div className="w-full basis-full min-w-0">
      <RoomShell
        title="Add tournament"
        roomTitle={ROOM[page]}
        page={page}
        totalPages={2}
        dirty={dirty}
        onClose={close}
        error={error}
        welcome={
          page === 1
            ? "What is this event called? You can set fees and the poster after it is created."
            : "When and where it runs. End date and venue can wait."
        }
        hall={
          page > 1 ? (
            <RoomHall
              lines={[{ label: "Name", value: form.name }]}
              onEdit={() => setPage(1)}
            />
          ) : null
        }
        onBack={page > 1 ? () => setPage(1) : null}
        primaryLabel={page < 2 ? "Continue" : busy ? "Creating…" : "Create tournament"}
        primaryDisabled={
          busy || (page === 1 ? !page1Ok() : !page2Ok())
        }
        busy={busy}
        onSubmit={submit}
        className="max-w-none"
      >
        {page === 1 && (
          <RoomField
            label="Tournament name"
            required
            explainer="e.g. Coed Heat Stroker"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
        {page === 2 && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1 min-w-0">
                <span className="form-label font-bold text-afa-navy">Start</span>
                <input
                  type="date"
                  className="form-field w-full"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  required
                />
                <p className="text-[11px] font-bold uppercase tracking-wide text-afa-navy">
                  Required
                </p>
              </label>
              <label className="block space-y-1 min-w-0">
                <span className="form-label font-normal text-afa-muted">
                  End
                </span>
                <input
                  type="date"
                  className="form-field w-full"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                />
                <p className="text-[11px] font-normal uppercase tracking-wide text-afa-muted/80">
                  Optional
                </p>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="form-label font-normal text-afa-muted">
                Venue
              </span>
              <input
                className="form-field w-full"
                list="venues-new-room"
                value={form.venueName}
                onChange={(e) =>
                  setForm({ ...form, venueName: e.target.value })
                }
                placeholder="Canyons"
                autoComplete="off"
              />
              <datalist id="venues-new-room">
                {venues.map((v) => {
                  const lab = venueLabel(v, null);
                  return <option key={lab} value={lab} />;
                })}
              </datalist>
              <p className="text-[11px] font-normal uppercase tracking-wide text-afa-muted/80">
                Optional
              </p>
            </label>
            <label className="block space-y-1">
              <span className="form-label font-bold text-afa-navy">Region</span>
              <select
                className="form-field w-full"
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
              >
                {REGIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </RoomShell>
    </div>
  );
}
