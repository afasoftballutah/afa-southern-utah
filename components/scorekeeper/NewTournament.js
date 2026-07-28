"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Select, directorPost } from "./DirectorForm";

const REGIONS = [
  { value: "southern_utah", label: "Southern UT/NV" },
  { value: "northern_utah", label: "Northern Utah" },
  { value: "series", label: "AFA Tournament Series" },
];

export default function NewTournament() {
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [venueName, setVenue] = useState("");
  const [region, setRegion] = useState("southern_utah");

  return (
    <DirectorForm
      heading="Add a tournament"
      note="Name and start date are all that is needed. Everything else can be filled in later."
      submitLabel="Create tournament"
      confirmMessage="Create this tournament? It appears on the public site right away."
      onSubmit={async () => {
        const res = await directorPost({
          action: "createTournament",
          name,
          startDate,
          endDate,
          venueName,
          region,
        });
        if (res.error) return res.error;
        window.location.reload();
      }}
    >
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Starts"><Input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="Ends" hint="Leave blank for a one-day tournament.">
        <Input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Where"><Input value={venueName} onChange={(e) => setVenue(e.target.value)} placeholder="The Canyons Sports Complex" /></Field>
      <Field label="Region">
        <Select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </Field>
    </DirectorForm>
  );
}
