"use client";

import { useState } from "react";
import RoomShell, {
  RoomField,
  RoomHall,
  RoomSelect,
} from "@/components/forms/RoomShell";
import { AddButton, DirectorAddPortal } from "./DirectorAddSlot";
import { directorPost, toCents } from "./DirectorForm";
import { venueLabel, resolveVenue } from "@/lib/director";

const REGIONS = [
  { value: "southern_utah", label: "Southern Utah" },
  { value: "northern_utah", label: "Northern Utah" },
  { value: "colorado", label: "Colorado" },
  { value: "arizona", label: "Arizona" },
  { value: "nevada", label: "Nevada" },
];

/** "3" or "3GG" → stored "3GG" */
function gamesStored(typed) {
  const t = String(typed ?? "")
    .replace(/\s*GG$/i, "")
    .trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? `${t}GG` : t;
}

const ROOM = { 1: "Name", 2: "When & where", 3: "Terms" };

const empty = () => ({
  name: "",
  startDate: "",
  endDate: "",
  dayStart: "",
  venueName: "",
  region: "southern_utah",
  entryFee: "",
  deposit: "",
  umpFee: "",
  guarantee: "3",
  closes: "",
});

/**
 * Add tournament — full build in the room dialog (not half then leave).
 * 1 Name → 2 When & where → 3 Terms (fee, GG, closes) → create.
 * Poster + divisions stay on the list expand after create.
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
  // Terms are optional — director can leave fee/closes blank.
  function page3Ok() {
    return true;
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
    if (page === 2) {
      if (!page2Ok()) {
        setError("Start date is required.");
        return;
      }
      setPage(3);
      return;
    }
    if (!page3Ok()) return;

    setBusy(true);
    try {
      const res = await directorPost({
        action: "createTournament",
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        venueName: resolveVenue(form.venueName, venues),
        region: form.region,
        dayStartTime: form.dayStart || null,
        entryFeeCents: toCents(form.entryFee),
        depositCents: toCents(form.deposit),
        umpFeeCents: toCents(form.umpFee),
        gameGuarantee: gamesStored(form.guarantee),
        registrationCloses: form.closes || null,
      });
      if (res.error) {
        setError(res.error);
        setBusy(false);
        return;
      }
      // Stay on the list — expand the row there for poster/divisions.
      window.location.href = "/director/tournaments";
    } catch (err) {
      setError(err.message || "Could not create");
      setBusy(false);
    }
  }

  const primaryLabel =
    page < 3
      ? "Continue"
      : busy
        ? "Creating…"
        : "Create tournament";

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
            totalPages={3}
            dirty={dirty}
            onClose={close}
            error={error}
            welcome={
              page === 1
                ? "Name it. Dates, place, and fees next."
                : page === 3
                  ? "Money and the registration close date. Poster and divisions after create."
                  : null
            }
            hall={
              page > 1 ? (
                <RoomHall
                  lines={[
                    { label: "Name", value: form.name },
                    page > 2
                      ? {
                          label: "When",
                          value: [
                            form.startDate,
                            form.endDate && form.endDate !== form.startDate
                              ? `– ${form.endDate}`
                              : null,
                            form.venueName || null,
                          ]
                            .filter(Boolean)
                            .join(" "),
                        }
                      : null,
                  ].filter(Boolean)}
                  onEdit={() => setPage(1)}
                />
              ) : null
            }
            onBack={page > 1 ? () => setPage((p) => p - 1) : null}
            showSkip={page === 3}
            onSkip={
              page === 3
                ? () => {
                    // Create with whatever terms are filled (maybe none).
                    submit({ preventDefault() {} });
                  }
                : null
            }
            skipLabel="Skip terms"
            primaryLabel={primaryLabel}
            primaryDisabled={
              busy ||
              (page === 1 ? !page1Ok() : page === 2 ? !page2Ok() : false)
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
                  <RoomField
                    label="Day start"
                    optional
                    type="time"
                    className="w-[8.5rem] shrink-0"
                    value={form.dayStart}
                    onChange={(e) =>
                      setForm({ ...form, dayStart: e.target.value })
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
                  onChange={(e) =>
                    setForm({ ...form, region: e.target.value })
                  }
                >
                  {REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </RoomSelect>
              </>
            )}
            {page === 3 && (
              <>
                <div className="flex flex-wrap items-end gap-2">
                  <RoomField
                    label="Entry fee"
                    optional
                    explainer="300"
                    className="w-[5.5rem] shrink-0"
                    inputMode="decimal"
                    value={form.entryFee}
                    onChange={(e) =>
                      setForm({ ...form, entryFee: e.target.value })
                    }
                  />
                  <RoomField
                    label="Deposit"
                    optional
                    explainer="100"
                    className="w-[5.5rem] shrink-0"
                    inputMode="decimal"
                    value={form.deposit}
                    onChange={(e) =>
                      setForm({ ...form, deposit: e.target.value })
                    }
                  />
                  <RoomField
                    label="Ump fee"
                    optional
                    explainer="10"
                    className="w-[5rem] shrink-0"
                    inputMode="decimal"
                    value={form.umpFee}
                    onChange={(e) =>
                      setForm({ ...form, umpFee: e.target.value })
                    }
                  />
                  <RoomField
                    label="GG"
                    optional
                    explainer="3"
                    className="w-[4rem] shrink-0"
                    value={form.guarantee}
                    onChange={(e) =>
                      setForm({ ...form, guarantee: e.target.value })
                    }
                  />
                </div>
                <RoomField
                  label="Registration closes"
                  optional
                  type="date"
                  className="w-[10.5rem] shrink-0"
                  value={form.closes}
                  onChange={(e) =>
                    setForm({ ...form, closes: e.target.value })
                  }
                />
              </>
            )}
          </RoomShell>
        </div>
      )}
    </>
  );
}
