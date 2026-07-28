"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Combo, directorPost, toCents, fromCents } from "./DirectorForm";
import PosterUpload from "./PosterUpload";
import DeleteTournament from "./DeleteTournament";
import { venueLabel, resolveVenue } from "@/lib/director";

/** "3GG" is the column; "3" is what a director types. The unit is the label. */
const gamesShown = (stored) => String(stored ?? "").replace(/\s*GG$/i, "").trim();
const gamesStored = (typed) => {
  const t = gamesShown(typed);
  if (!t) return null;
  return /^\d+$/.test(t) ? `${t}GG` : t;
};

const GENDERS = [
  { value: "", label: "Not set" },
  { value: "mens", label: "Men's" },
  { value: "womens", label: "Women's" },
  { value: "coed", label: "Coed" },
];

// The two things a director does to a tournament: state the terms, and add a
// division. Both collapsed, so the page opens as a list of what exists rather
// than a wall of inputs.
export default function TournamentEditor({ tournament, venues = [] }) {
  const t = tournament;
  const [fee, setFee] = useState(fromCents(t.entry_fee_cents));
  const [deposit, setDeposit] = useState(fromCents(t.deposit_cents));
  const [umpFee, setUmpFee] = useState(fromCents(t.ump_fee_cents));
  const [guarantee, setGuarantee] = useState(gamesShown(t.game_guarantee));
  const [closes, setCloses] = useState((t.registration_closes ?? "").slice(0, 10));
  const [venue, setVenue] = useState(venueLabel(t.venue_name, t.venue_address));
  const [start, setStart] = useState((t.start_date ?? "").slice(0, 10));
  const [end, setEnd] = useState((t.end_date ?? "").slice(0, 10));
  const [name, setName] = useState(t.name ?? "");
  const venueOptions = venues.map((v) => venueLabel(v, null));

  return (
      <DirectorForm
        heading="Terms"
        alwaysOpen
        row
        submitLabel="Save terms"
        // A drawn floppy: solid body, metal shutter, paper label. The first
        // pass was three outline strokes that read as a generic box at 16px.
        // Filled and solid navy, so the one thing that commits the row is the
        // one thing on it that is not an outline.
        submitIcon={
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden="true">
            <path d="M2.75 1.5h8.19a1 1 0 0 1 .71.29l2.56 2.56a1 1 0 0 1 .29.71v9.19a1.25 1.25 0 0 1-1.25 1.25H2.75A1.25 1.25 0 0 1 1.5 14.25V2.75A1.25 1.25 0 0 1 2.75 1.5Zm2 .75v3.5a.75.75 0 0 0 .75.75h4.25a.75.75 0 0 0 .75-.75v-3.5h-1.5v2.75h-1.25V2.25h-3Zm.5 7a.75.75 0 0 0-.75.75v4.5h7.5v-4.5a.75.75 0 0 0-.75-.75h-6Z" />
          </svg>
        }
        submitSolid
        actions={<DeleteTournament tournamentId={t.id} name={t.name} />}
        onSubmit={async () => {
          const res = await directorPost({
            action: "updateTournament",
            tournamentId: t.id,
            patch: {
              name: name.trim() || t.name,
              start_date: start || null,
              end_date: end || start || null,
              venue_name: resolveVenue(venue, venues),
              entry_fee_cents: toCents(fee),
              deposit_cents: toCents(deposit),
              ump_fee_cents: toCents(umpFee),
              game_guarantee: gamesStored(guarantee),
              registration_closes: closes || null,
            },
          });
          if (res.error) return res.error;
          window.location.reload();
        }}
      >
        <Field label="Tournament" width="w-44 shrink-0">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Poster" width="shrink-0">
          <PosterUpload tournamentId={t.id} posterUrl={t.poster_url} />
        </Field>
        <Field label="Start" width="w-28 shrink-0"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End" width="w-28 shrink-0"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Where" width="w-52 shrink-0">
          <Combo
            id={`venues-${t.id}`}
            options={venueOptions}
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Canyons"
          />
        </Field>
        <Field label="Entry" width="w-12 shrink-0">
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="300" />
        </Field>
        <Field label="Deposit" width="w-14 shrink-0">
          <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="100" />
        </Field>
        <Field label="Fee" width="w-12 shrink-0">
          <Input inputMode="decimal" value={umpFee} onChange={(e) => setUmpFee(e.target.value)} placeholder="10" />
        </Field>
        <Field label="GG" width="w-14 shrink-0">
          <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="3" />
        </Field>
        <Field label="Closes" width="w-28 shrink-0">
          <Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </Field>
      </DirectorForm>

  );
}
