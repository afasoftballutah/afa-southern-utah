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
export default function TournamentEditor({ tournament, classes, venues = [] }) {
  const t = tournament;
  const [fee, setFee] = useState(fromCents(t.entry_fee_cents));
  const [deposit, setDeposit] = useState(fromCents(t.deposit_cents));
  const [umpFee, setUmpFee] = useState(fromCents(t.ump_fee_cents));
  const [guarantee, setGuarantee] = useState(t.game_guarantee ?? "");
  const [closes, setCloses] = useState((t.registration_closes ?? "").slice(0, 10));
  const [venue, setVenue] = useState(t.venue_name ?? "");
  const [start, setStart] = useState((t.start_date ?? "").slice(0, 10));
  const [end, setEnd] = useState((t.end_date ?? "").slice(0, 10));

  const [divName, setDivName] = useState("");
  const [divGender, setDivGender] = useState("");
  const [divClass, setDivClass] = useState("");

  return (
    <div className="space-y-3">
      <DirectorForm
        heading="Edit the terms"
        submitLabel="Save terms"
        row
        confirmMessage="Save these terms? Anything left blank stays off the public page."
        onSubmit={async () => {
          const res = await directorPost({
            action: "updateTournament",
            tournamentId: t.id,
            patch: {
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

      <DirectorForm
        heading="Add a division"
        submitLabel="Add division"
        row
        confirmMessage="Add this division? Teams can be entered into it straight away."
        onSubmit={async () => {
          const res = await directorPost({
            action: "addDivision",
            tournamentId: t.id,
            name: divName,
            gender: divGender || null,
            classId: divClass || null,
          });
          if (res.error) return res.error;
          window.location.reload();
        }}
      >
        <Field label="Name" width="w-36"><Input value={divName} onChange={(e) => setDivName(e.target.value)} placeholder="Coed" /></Field>
        <Field label="Gender" width="w-36">
          <Select value={divGender} onChange={(e) => setDivGender(e.target.value)}>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </Field>
        <Field label="Class" width="w-32">
          <Select value={divClass} onChange={(e) => setDivClass(e.target.value)}>
            <option value="">Not set</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </DirectorForm>
    </div>
  );
}
