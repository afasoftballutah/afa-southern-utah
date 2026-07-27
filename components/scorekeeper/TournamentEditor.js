"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Select, directorPost, toCents, fromCents } from "./DirectorForm";

const GENDERS = [
  { value: "", label: "Not set" },
  { value: "mens", label: "Men's" },
  { value: "womens", label: "Women's" },
  { value: "coed", label: "Coed" },
];

// The two things a director does to a tournament: state the terms, and add a
// division. Both collapsed, so the page opens as a list of what exists rather
// than a wall of inputs.
export default function TournamentEditor({ tournament, classes }) {
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
        note="Anything left blank stays off the public page. A blank fee is not a free tournament — it is a fee nobody has set yet."
        submitLabel="Save terms"
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
        <Field label="Starts"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Ends"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Where"><Input value={venue} onChange={(e) => setVenue(e.target.value)} /></Field>
        <Field label="Entry fee" hint="Dollars. Type 300, not 30000.">
          <Input inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="300" />
        </Field>
        <Field label="Deposit">
          <Input inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="100" />
        </Field>
        <Field label="Ump fee per game">
          <Input inputMode="decimal" value={umpFee} onChange={(e) => setUmpFee(e.target.value)} placeholder="10" />
        </Field>
        <Field label="Game guarantee" hint="3GG or 4GG.">
          <Input value={guarantee} onChange={(e) => setGuarantee(e.target.value)} placeholder="3GG" />
        </Field>
        <Field label="Registration closes" hint="The last day a team can sign up. Leave blank and it stays open until the tournament starts.">
          <Input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
        </Field>
      </DirectorForm>

      <DirectorForm
        heading="Add a division"
        note="Men's, Women's or Coed. Gender and class are what keep two teams with the same name apart, so set them if you know them."
        submitLabel="Add division"
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
        <Field label="Name"><Input value={divName} onChange={(e) => setDivName(e.target.value)} placeholder="Coed" /></Field>
        <Field label="Gender">
          <Select value={divGender} onChange={(e) => setDivGender(e.target.value)}>
            {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </Select>
        </Field>
        <Field label="Class">
          <Select value={divClass} onChange={(e) => setDivClass(e.target.value)}>
            <option value="">Not set</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </DirectorForm>
    </div>
  );
}
