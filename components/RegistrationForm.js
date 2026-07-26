"use client";

import { useMemo, useState } from "react";
import SignaturePad from "./SignaturePad";
import { RELEASE_TEXT, MAX_PLAYERS, MAX_COACHES, MIN_PLAYERS } from "@/lib/waiver";

const STEPS = ["Tournament", "Team", "Manager", "Players", "Coaches", "Sign & Submit"];

// Same region ordering as the Tournaments page (lib/data.js REGION_ORDER) —
// Southern Utah/Nevada first (home base), then Northern Utah, then the
// Series circuit. Kept local here since only region LABELS are shared
// (dispatch-brief-17); the order is a display concern of this filter alone.
const REGION_ORDER = ["southern_utah", "northern_utah", "series"];

const emptyPlayer = () => ({ name: "", birthDate: "", address: "" });
const emptyCoach = () => ({ name: "", email: "", phone: "" });

function formatStartDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function RegistrationForm({ tournaments, regionLabel }) {
  const [step, setStep] = useState(0);
  const [submitState, setSubmitState] = useState("idle"); // idle | submitting | done | error
  const [submitError, setSubmitError] = useState("");
  const [signers, setSigners] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Series filter (dispatch-brief-17) — "All" plus only the regions that
  // actually have a registerable tournament in this list. `tournaments` here
  // is already the registerable set (page.js filters is_placeholder/status).
  const [seriesFilter, setSeriesFilter] = useState("all");
  const filterOptions = useMemo(() => {
    const present = REGION_ORDER.filter((r) => tournaments.some((t) => t.region === r));
    return [{ value: "all", label: "All" }, ...present.map((r) => ({ value: r, label: regionLabel[r] }))];
  }, [tournaments, regionLabel]);
  const filteredTournaments = useMemo(() => {
    const list = seriesFilter === "all" ? tournaments : tournaments.filter((t) => t.region === seriesFilter);
    return list.slice().sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
  }, [tournaments, seriesFilter]);

  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? "");
  const tournament = useMemo(
    () => tournaments.find((t) => t.id === tournamentId),
    [tournaments, tournamentId]
  );
  const [divisionId, setDivisionId] = useState("");

  // Registerable divisions for the selected tournament — bracket-stage
  // children (Gold/Silver/Bronze) have a parent_division_id and must never
  // be offered here; a team registers into the parent (e.g. Coed), never
  // the stage (dispatch-brief-17 regression check).
  const registerableDivisions = useMemo(() => {
    return (tournament?.divisions ?? [])
      .filter((d) => d.parent_division_id == null)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [tournament]);
  const effectiveDivisionId = useMemo(() => {
    if (registerableDivisions.length === 1) return registerableDivisions[0].id;
    if (registerableDivisions.length === 0) return "";
    return divisionId;
  }, [registerableDivisions, divisionId]);

  function chooseFilter(next) {
    setSeriesFilter(next);
    const stillVisible = next === "all" || (tournament && tournament.region === next);
    if (!stillVisible) {
      setTournamentId("");
      setDivisionId("");
    }
  }

  const [teamName, setTeamName] = useState("");
  const [className, setClassName] = useState("");
  const [afaMembershipNumber, setAfaMembershipNumber] = useState("");

  const [manager, setManager] = useState({
    name: "",
    email: "",
    phone: "",
    cell: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  const [players, setPlayers] = useState([emptyPlayer(), emptyPlayer(), emptyPlayer()]);
  const [coaches, setCoaches] = useState([emptyCoach()]);

  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);

  function updatePlayer(index, field, value) {
    setPlayers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function updateCoach(index, field, value) {
    setCoaches((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function canProceed() {
    if (step === 0) return Boolean(tournamentId);
    if (step === 1) {
      return (
        teamName.trim().length > 0 &&
        (registerableDivisions.length === 0 || Boolean(effectiveDivisionId))
      );
    }
    if (step === 2) return manager.name.trim().length > 0 && manager.email.trim().length > 0;
    if (step === 3) return players.some((p) => p.name.trim().length > 0);
    if (step === 4) return true; // coaches optional
    return true;
  }

  async function submit() {
    setSubmitState("submitting");
    setSubmitError("");
    try {
      const payload = {
        tournamentId,
        divisionId: effectiveDivisionId,
        teamName: teamName.trim(),
        class: className.trim(),
        afaMembershipNumber: afaMembershipNumber.trim(),
        manager,
        players: players.filter((p) => p.name.trim().length > 0),
        coaches: coaches.filter((c) => c.name.trim().length > 0),
        signaturePng: signature,
      };
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Registration failed");
      setSigners(json.signers ?? []);
      setSubmitState("done");
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err.message || "Something went wrong. Please try again.");
    }
  }

  function copyLink(link, i) {
    navigator.clipboard?.writeText(link);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex((cur) => (cur === i ? null : cur)), 1500);
  }

  if (submitState === "done") {
    return (
      <div className="chalk-panel p-6 space-y-4">
        <h2 className="h-page">Registration saved</h2>
        <p className="text-afa-ink/80">
          {teamName} is on the books for {tournament?.name}.
        </p>
        <div className="chalk-line" />
        <div>
          <p className="font-semibold text-sm mb-2">
            Send each of these to the person by name — nothing goes out
            automatically. Once they open their link and sign, they&rsquo;re done.
          </p>
          <ul className="space-y-2">
            {signers.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {s.name}{" "}
                  <span className="text-afa-ink/50">
                    ({s.role === "coach" ? "coach" : "player"})
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => copyLink(s.signLink, i)}
                  className="text-afa-navy underline font-semibold shrink-0"
                >
                  {copiedIndex === i ? "Copied" : "Copy link"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "px-2 py-1 rounded " +
              (i === step
                ? "bg-afa-navy text-white"
                : i < step
                ? "bg-afa-navy/20 text-afa-navy"
                : "bg-afa-navy/5 text-afa-ink/50")
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="form-panel p-4 space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-sm flex-wrap">
              {filterOptions.map((opt, i) => (
                <div key={opt.value} className="flex items-center gap-3">
                  {i > 0 && <span className="text-afa-ink/30">|</span>}
                  <button
                    type="button"
                    onClick={() => chooseFilter(opt.value)}
                    className={`font-semibold ${
                      seriesFilter === opt.value ? "text-afa-navy underline" : "text-afa-ink/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                </div>
              ))}
            </div>
            <Field label="Tournament">
              <select
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={tournamentId}
                onChange={(e) => {
                  setTournamentId(e.target.value);
                  setDivisionId("");
                }}
              >
                {filteredTournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {formatStartDate(t.start_date)}
                    {seriesFilter === "all" ? ` · ${regionLabel[t.region]}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Team Name">
              <input
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </Field>
            {registerableDivisions.length === 1 && (
              <p className="text-sm">
                Division: {registerableDivisions[0].display_name ?? registerableDivisions[0].name}
              </p>
            )}
            {registerableDivisions.length > 1 && (
              <Field label="Division">
                <select
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={divisionId}
                  onChange={(e) => setDivisionId(e.target.value)}
                >
                  <option value="">Select a division&hellip;</option>
                  {registerableDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.display_name ?? d.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Class">
              <input
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              />
            </Field>
            <Field label="AFA Membership #">
              <input
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={afaMembershipNumber}
                onChange={(e) => setAfaMembershipNumber(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Manager's Name">
              <input
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={manager.name}
                onChange={(e) => setManager({ ...manager, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={manager.email}
                onChange={(e) => setManager({ ...manager, email: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone #">
                <input
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={manager.phone}
                  onChange={(e) => setManager({ ...manager, phone: e.target.value })}
                />
              </Field>
              <Field label="Cell #">
                <input
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={manager.cell}
                  onChange={(e) => setManager({ ...manager, cell: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Address">
              <input
                className="w-full border border-afa-navy/30 rounded px-3 py-2"
                value={manager.address}
                onChange={(e) => setManager({ ...manager, address: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City">
                <input
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={manager.city}
                  onChange={(e) => setManager({ ...manager, city: e.target.value })}
                />
              </Field>
              <Field label="State">
                <input
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={manager.state}
                  onChange={(e) => setManager({ ...manager, state: e.target.value })}
                />
              </Field>
              <Field label="Zip">
                <input
                  className="w-full border border-afa-navy/30 rounded px-3 py-2"
                  value={manager.zip}
                  onChange={(e) => setManager({ ...manager, zip: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-afa-ink/70">
              Add each player on the roster. At least one is required. Each
              player signs their own copy later, on their own link — you&rsquo;re
              just listing them here.
            </p>
            {players.map((p, i) => (
              <div key={i} className="border border-afa-navy/10 rounded p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm">Player {i + 1}</p>
                  {players.length > MIN_PLAYERS && (
                    <button
                      type="button"
                      className="text-xs text-afa-navy underline font-semibold"
                      onClick={() =>
                        setPlayers((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <Field label="Name">
                  <input
                    className="w-full border border-afa-navy/30 rounded px-3 py-2"
                    value={p.name}
                    onChange={(e) => updatePlayer(i, "name", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Birth Date">
                    <input
                      type="date"
                      className="w-full border border-afa-navy/30 rounded px-3 py-2"
                      value={p.birthDate}
                      onChange={(e) => updatePlayer(i, "birthDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Address">
                    <input
                      className="w-full border border-afa-navy/30 rounded px-3 py-2"
                      value={p.address}
                      onChange={(e) => updatePlayer(i, "address", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            {players.length < MAX_PLAYERS && (
              <button
                type="button"
                className="w-full py-3 text-afa-navy underline font-semibold"
                onClick={() => setPlayers((prev) => [...prev, emptyPlayer()])}
              >
                + Add Player
              </button>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-afa-ink/70">Coaches (optional).</p>
            {coaches.map((c, i) => (
              <div key={i} className="border border-afa-navy/10 rounded p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm">Coach {i + 1}</p>
                  <button
                    type="button"
                    className="text-xs text-afa-navy underline font-semibold"
                    onClick={() => setCoaches((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </div>
                <Field label="Name">
                  <input
                    className="w-full border border-afa-navy/30 rounded px-3 py-2"
                    value={c.name}
                    onChange={(e) => updateCoach(i, "name", e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <input
                      className="w-full border border-afa-navy/30 rounded px-3 py-2"
                      value={c.email}
                      onChange={(e) => updateCoach(i, "email", e.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      className="w-full border border-afa-navy/30 rounded px-3 py-2"
                      value={c.phone}
                      onChange={(e) => updateCoach(i, "phone", e.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            {coaches.length < MAX_COACHES && (
              <button
                type="button"
                className="w-full py-3 text-afa-navy underline font-semibold"
                onClick={() => setCoaches((prev) => [...prev, emptyCoach()])}
              >
                + Add Coach
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto border border-afa-navy/20 rounded p-3 text-sm bg-afa-cream">
              {RELEASE_TEXT}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 w-5 h-5"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              I have read this release and waiver of liability and I agree to
              it as the team&rsquo;s manager.
            </label>
            <p className="text-xs text-afa-ink/60">
              This is your own signature as manager. Every player and coach
              signs their own copy separately, on their own link, after you
              submit.
            </p>
            <div>
              <p className="font-semibold text-sm mb-1">Manager&rsquo;s Signature</p>
              <SignaturePad onChange={setSignature} />
            </div>
            {submitState === "error" && (
              <p className="text-afa-ink text-sm font-bold underline">{submitError}</p>
            )}
            <button
              type="button"
              disabled={!agreed || !signature || submitState === "submitting"}
              onClick={submit}
              className="w-full bg-afa-red text-white font-bold py-3 rounded-lg disabled:opacity-40"
            >
              {submitState === "submitting" ? "Submitting…" : "Submit Registration"}
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="px-4 py-2 font-semibold text-afa-navy underline disabled:opacity-30"
        >
          Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canProceed()}
            className="px-4 py-2 text-afa-navy underline font-semibold disabled:opacity-30"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1">{label}</span>
      {children}
    </label>
  );
}
