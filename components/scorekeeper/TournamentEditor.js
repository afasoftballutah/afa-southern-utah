"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Select, directorPost, toCents, fromCents } from "./DirectorForm";
import PosterUpload from "./PosterUpload";

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
        row
        confirmMessage="Save these terms? Anything left blank stays off the public page."
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
        <Field label="Tournament" width="w-56">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Starts" width="w-40"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ends" width="w-40"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Where" width="w-64"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
        <Field label="Entry fee" width="w-20">
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="300" />
        </Field>
        <Field label="Deposit" width="w-20">
          <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="100" />
        </Field>
        <Field label="Ump fee" width="w-20">
          <Input inputMode="decimal" value={umpFee} onChange={(e) => setUmpFee(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Guarantee" width="w-20">
          <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="3GG" />
        </Field>
        <Field label="Closes" width="w-40">
          <Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </Field>
        <Field label="Poster">
          <PosterUpload tournamentId={t.id} posterUrl={t.poster_url} />
        </Field>
      </DirectorForm>

  );
}
