"use client";

import { useState } from "react";
import DirectorForm, { Field, Input, Combo, directorPost, toCents, fromCents } from "./DirectorForm";
import PosterUpload from "./PosterUpload";
import DeleteTournament from "./DeleteTournament";
import { venueLabel, resolveVenue } from "@/lib/director";
import { timeInputValue } from "@/lib/league-time";
import { gamesShown, gamesStored, tournamentTermsLines } from "@/lib/tournament-terms";

function TermsView({ tournament: t, onEdit }) {
  const lines = tournamentTermsLines(t);
  return (
    <div className="card p-4 w-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="t-strong">{lines.name}</p>
          {lines.when ? <p className="t-body">{lines.when}</p> : null}
          {lines.venue ? <p className="t-body">{lines.venue}</p> : null}
          {lines.money ? <p className="t-meta">{lines.money}</p> : null}
          {lines.closes ? <p className="t-meta">{lines.closes}</p> : null}
        </div>
        <div className="shrink-0 flex items-start gap-2">
          {t.poster_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={t.poster_url}
              alt=""
              className="h-9 w-auto rounded border border-afa-navy/15"
            />
          ) : null}
          <button type="button" className="pill" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function TermsForm({ tournament: t, venues, onCancel }) {
  const [fee, setFee] = useState(fromCents(t.entry_fee_cents));
  const [deposit, setDeposit] = useState(fromCents(t.deposit_cents));
  const [umpFee, setUmpFee] = useState(fromCents(t.ump_fee_cents));
  const [guarantee, setGuarantee] = useState(gamesShown(t.game_guarantee));
  const [closes, setCloses] = useState((t.registration_closes ?? "").slice(0, 10));
  const [venue, setVenue] = useState(venueLabel(t.venue_name, t.venue_address));
  const [start, setStart] = useState((t.start_date ?? "").slice(0, 10));
  const [end, setEnd] = useState((t.end_date ?? "").slice(0, 10));
  const [dayStart, setDayStart] = useState(timeInputValue(t.day_start_time));
  const [name, setName] = useState(t.name ?? "");
  const venueOptions = venues.map((v) => venueLabel(v, null));

  return (
    <DirectorForm
      heading="Terms"
      alwaysOpen
      row
      submitLabel="Save terms"
      submitIcon={
        <svg viewBox="0 0 16 16" className="w-4 h-4" fill="currentColor" aria-hidden="true">
          <path d="M2.75 1.5h8.19a1 1 0 0 1 .71.29l2.56 2.56a1 1 0 0 1 .29.71v9.19a1.25 1.25 0 0 1-1.25 1.25H2.75A1.25 1.25 0 0 1 1.5 14.25V2.75A1.25 1.25 0 0 1 2.75 1.5Zm2 .75v3.5a.75.75 0 0 0 .75.75h4.25a.75.75 0 0 0 .75-.75v-3.5h-1.5v2.75h-1.25V2.25h-3Zm.5 7a.75.75 0 0 0-.75.75v4.5h7.5v-4.5a.75.75 0 0 0-.75-.75h-6Z" />
        </svg>
      }
      submitSolid
      actions={
        <>
          <button type="button" className="pill" onClick={onCancel}>
            Cancel
          </button>
          <DeleteTournament tournamentId={t.id} name={t.name} />
        </>
      }
      onSubmit={async () => {
        const res = await directorPost({
          action: "updateTournament",
          tournamentId: t.id,
          patch: {
            name: name.trim() || t.name,
            start_date: start || null,
            end_date: end || start || null,
            day_start_time: dayStart || null,
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
      <Field label="Poster" width="shrink-0" group>
        <PosterUpload tournamentId={t.id} posterUrl={t.poster_url} />
      </Field>
      <Field label="Start" width="w-28 shrink-0">
        <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </Field>
      <Field label="End" width="w-28 shrink-0">
        <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </Field>
      <Field label="Day start" width="w-28 shrink-0" title="First pitch / fields open each day — all divisions share this clock">
        <Input
          type="time"
          value={dayStart}
          onChange={(e) => setDayStart(e.target.value)}
        />
      </Field>
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

export default function TournamentEditor({ tournament, venues = [] }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return <TermsView tournament={tournament} onEdit={() => setEditing(true)} />;
  }
  return (
    <TermsForm
      tournament={tournament}
      venues={venues}
      onCancel={() => setEditing(false)}
    />
  );
}
