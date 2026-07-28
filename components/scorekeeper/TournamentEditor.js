"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Select, directorPost, toCents, fromCents } from "./DirectorForm";
import PosterUpload from "./PosterUpload";
import DeleteTournament from "./DeleteTournament";
import { venueParts } from "@/lib/director";

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
  const [guarantee, setGuarantee] = useState(t.game_guarantee ?? "");
  const [closes, setCloses] = useState((t.registration_closes ?? "").slice(0, 10));
  const [venue, setVenue] = useState(t.venue_name ?? "");
  const [start, setStart] = useState((t.start_date ?? "").slice(0, 10));
  const [end, setEnd] = useState((t.end_date ?? "").slice(0, 10));
  const [name, setName] = useState(t.name ?? "");

  return (
      <DirectorForm
        heading="Terms"
        alwaysOpen
        submitLabel="Save terms"
        // An SVG, not a glyph: 🖫 has no coverage in the system font stack and
        // rendered as an empty box.
        submitIcon={
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2.5 2.5h8.6L13.5 4.9v8.6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
            <path d="M5 2.5v4h6v-4M5 14v-4h6v4" />
          </svg>
        }
        row
        confirmMessage="Save these terms?"
        actions={<DeleteTournament tournamentId={t.id} name={t.name} />}
        onSubmit={async () => {
          const res = await directorPost({
            action: "updateTournament",
            tournamentId: t.id,
            patch: {
              name: name.trim() || t.name,
              start_date: start || null,
              end_date: end || start || null,
              venue_name: venue || null,
              entry_fee_cents: toCents(fee),
              deposit_cents: toCents(deposit),
              ump_fee_cents: toCents(umpFee),
              game_guarantee: guarantee || null,
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
        <Field label="Where" width="w-40 shrink-0"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
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
          <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="3GG" />
        </Field>
        <Field label="Closes" width="w-28 shrink-0">
          <Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </Field>
      </DirectorForm>

  );
}
