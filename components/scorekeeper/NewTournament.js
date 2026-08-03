"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Select, Combo, directorPost } from "./DirectorForm";
import { venueLabel, resolveVenue } from "@/lib/director";

const REGIONS = [
  { value: "southern_utah", label: "Southern Utah" },
  { value: "northern_utah", label: "Northern Utah" },
  { value: "colorado", label: "Colorado" },
  { value: "arizona", label: "Arizona" },
  { value: "nevada", label: "Nevada" },
];

export default function NewTournament({ venues = [] }) {
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  const [venueName, setVenue] = useState("");
  const [region, setRegion] = useState("southern_utah");

  return (
    <DirectorForm
      heading="Add a tournament"
      submitLabel="Create"
      row
      confirmMessage="Create this tournament? It appears on the public site right away."
      onSubmit={async () => {
        const res = await directorPost({
          action: "createTournament",
          name,
          startDate,
          endDate,
          venueName: resolveVenue(venueName, venues),
          region,
        });
        if (res.error) return res.error;
        window.location.reload();
      }}
    >
      <Field label="Tournament" width="w-44 shrink-0">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Start" width="w-28 shrink-0">
        <Input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="End" width="w-28 shrink-0">
        <Input type="date" value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Where" width="w-44 shrink-0">
        {/* Same box as the terms row: the list is the venues already in use,
            and a new one is typed straight in. */}
        <Combo
          id="venues-new"
          options={venues.map((v) => venueLabel(v, null))}
          value={venueName}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="Canyons"
        />
      </Field>
      <Field label="Region" width="w-40 shrink-0">
        <Select value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </Field>
    </DirectorForm>
  );
}
