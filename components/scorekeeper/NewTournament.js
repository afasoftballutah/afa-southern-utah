"use client";

import { useState } from "react";
import RoomShell, {
  RoomField,
  RoomHall,
  RoomSelect,
} from "@/components/forms/RoomShell";
import { AddButton, DirectorAddPortal } from "./DirectorAddSlot";
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

  return (
    <>
      <DirectorAddPortal>
        {!open ? (
          <AddButton onClick={() => setOpen(true)}>+ Add tournament</AddButton>
        ) : null}
      </DirectorAddPortal>
      {open && (
    <div className="w-full min-w-0">
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
            ? "Fees and poster come after create."
            : null
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
            <div className="flex flex-wrap items-end gap-2">
              <RoomField
                label="Start"
                required
                type="date"
                className="w-[10.5rem] shrink-0"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
              <RoomField
                label="End"
                optional
                type="date"
                className="w-[10.5rem] shrink-0"
                value={form.endDate}
                onChange={(e) =>
                  setForm({ ...form, endDate: e.target.value })
                }
              />
            </div>
            <RoomField
              label="Venue"
              optional
              explainer="Venue (optional)"
              list="venues-new-room"
              value={form.venueName}
              onChange={(e) =>
                setForm({ ...form, venueName: e.target.value })
              }
              autoComplete="off"
            />
            <datalist id="venues-new-room">
              {venues.map((v) => {
                const lab = venueLabel(v, null);
                return <option key={lab} value={lab} />;
              })}
            </datalist>
            <RoomSelect
              label="Region"
              className="max-w-[14rem]"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            >
              {REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </RoomSelect>
          </>
        )}
      </RoomShell>
    </div>
      )}
    </>
  );
}
