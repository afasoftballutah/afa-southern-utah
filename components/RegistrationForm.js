"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import SignaturePad from "./SignaturePad";
import RegisterBack from "./RegisterBack";
import { RELEASE_TEXT, MAX_PLAYERS, MAX_COACHES, MIN_PLAYERS } from "@/lib/waiver";
import { formatLeagueDateOnly } from "@/lib/league-time";
import { REGION_ORDER, canonicalRegion } from "@/lib/data";
import {
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  subscribeRegionPref,
} from "@/lib/region-pref";
import { rememberRegistration, tokensFromLinks } from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";
import PersonWizard from "@/components/forms/PersonWizard";
import ManagerPlayerFields, {
  managerPlayerDisplay,
  managerPlayerReady,
} from "@/components/ManagerPlayerFields";

const STEPS = ["Tournament", "Team", "Manager", "Players", "Coaches", "Sign & Submit"];

const sameName = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();

const emptyPlayer = () => ({
  firstName: "",
  lastName: "",
  gender: "",
});
const emptyCoach = () => ({
  legalFirstName: "",
  legalLastName: "",
  preferredName: "",
  email: "",
  phone: "",
});
const personDisplay = (p) => {
  // Manager/coach still use legal + preferred; players use first + last.
  if (p.firstName || p.lastName) return managerPlayerDisplay(p);
  const preferred = (p.preferredName || "").trim();
  if (preferred) return preferred;
  return [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ").trim() || (p.name || "").trim();
};

export default function RegistrationForm({
  tournaments,
  regionLabel,
  initialTournamentSlug = null,
}) {
  const [step, setStep] = useState(0);
  const [submitState, setSubmitState] = useState("idle"); // idle | submitting | done | error
  const [submitError, setSubmitError] = useState("");
  const [signers, setSigners] = useState([]);
  const [rosterLink, setRosterLink] = useState("");
  const [manageLink, setManageLink] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [posterOpen, setPosterOpen] = useState(false);

  // Prefer ?tournament=slug from the tournament page Register link.
  const initialTournament = useMemo(() => {
    if (!initialTournamentSlug) return null;
    return tournaments.find((t) => t.slug === initialTournamentSlug) ?? null;
  }, [tournaments, initialTournamentSlug]);

  // Site-wide map region — updates live when the home map select/deselects.
  const regionPref = useSyncExternalStore(
    subscribeRegionPref,
    getRegionPrefSnapshot,
    getRegionPrefServerSnapshot
  );

  // Series filter — "All" plus only the regions that have a registerable
  // tournament. Prefer the home map’s site-wide region when present.
  // Lists are always next-first (soonest start_date).
  const [seriesFilter, setSeriesFilter] = useState("all");
  useEffect(() => {
    // Don't override deep-link ?tournament=… region
    if (initialTournament) {
      const r = canonicalRegion(initialTournament);
      if (r) setSeriesFilter(r);
      return;
    }
    if (regionPref && REGION_ORDER.includes(regionPref)) {
      setSeriesFilter(regionPref);
    } else {
      setSeriesFilter("all");
    }
  }, [initialTournament, regionPref]);
  const filterOptions = useMemo(() => {
    const present = REGION_ORDER.filter((r) =>
      tournaments.some((t) => canonicalRegion(t) === r)
    );
    return [
      { value: "all", label: "All" },
      ...present.map((r) => ({ value: r, label: regionLabel[r] })),
    ];
  }, [tournaments, regionLabel]);
  const filteredTournaments = useMemo(() => {
    const list =
      seriesFilter === "all"
        ? tournaments
        : tournaments.filter((t) => canonicalRegion(t) === seriesFilter);
    return list
      .slice()
      .sort((a, b) =>
        a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0
      );
  }, [tournaments, seriesFilter]);

  // Default selection = next open tournament (first after date sort)
  const [tournamentId, setTournamentId] = useState(
    () => initialTournament?.id ?? tournaments[0]?.id ?? ""
  );
  // When region filter changes (map pref or chips), snap to next in that set
  useEffect(() => {
    if (initialTournament && seriesFilter !== "all") {
      // Deep-link already set the team’s event
      if (tournamentId === initialTournament.id) return;
    }
    if (filteredTournaments.length === 0) {
      setTournamentId("");
      return;
    }
    const stillIn = filteredTournaments.some((t) => t.id === tournamentId);
    if (!stillIn) {
      setTournamentId(filteredTournaments[0].id);
    }
  }, [filteredTournaments, seriesFilter, initialTournament, tournamentId]);
  const tournament = useMemo(
    () => tournaments.find((t) => t.id === tournamentId),
    [tournaments, tournamentId]
  );
  // Close expanded poster when the selected tournament changes
  useEffect(() => {
    setPosterOpen(false);
  }, [tournamentId]);
  // Escape closes the poster lightbox
  useEffect(() => {
    if (!posterOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPosterOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [posterOpen]);
  const [divisionId, setDivisionId] = useState("");

  // Registerable divisions for the selected tournament — bracket-stage
  // children (Gold/Silver/Bronze) have a parent_division_id and must never
  // be offered here; a team registers into the parent (e.g. Coed), never
  // the stage (dispatch-brief-17 regression check).
  const registerableDivisions = useMemo(() => {
    return (tournament?.divisions ?? [])
      .filter((d) => d.parent_division_id == null)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [tournament]);
  const effectiveDivisionId = useMemo(() => {
    if (registerableDivisions.length === 1) return registerableDivisions[0].id;
    if (registerableDivisions.length === 0) return "";
    return divisionId;
  }, [registerableDivisions, divisionId]);

  function chooseFilter(next) {
    setSeriesFilter(next);
    const stillVisible =
      next === "all" || (tournament && canonicalRegion(tournament) === next);
    if (!stillVisible) {
      setTournamentId("");
      setDivisionId("");
    }
  }

  const [teamName, setTeamName] = useState("");
  const [afaMembershipNumber, setAfaMembershipNumber] = useState("");

  const [manager, setManager] = useState({
    legalFirstName: "",
    legalLastName: "",
    preferredName: "",
    name: "", // legacy / display helper
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

  // External host for off-site registration (Halloween → St George Rec, etc.)
  const externalRegisterUrl = tournament?.registration_url
    ? String(tournament.registration_url).trim()
    : "";
  const externalRegisterHost = useMemo(() => {
    if (!externalRegisterUrl) return null;
    try {
      return new URL(externalRegisterUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }, [externalRegisterUrl]);

  function canProceed() {
    // Off-site registration never advances into our multi-step form
    if (step === 0) return Boolean(tournamentId) && !externalRegisterUrl;
    if (step === 1) {
      return (
        teamName.trim().length > 0 &&
        (registerableDivisions.length === 0 || Boolean(effectiveDivisionId))
      );
    }
    if (step === 2) {
      // Match PersonWizard manager page 1: legal name, phone, email.
      const legalOk =
        manager.legalFirstName.trim().length > 0 &&
        manager.legalLastName.trim().length > 0;
      return (
        legalOk &&
        manager.email.trim().length > 0 &&
        manager.phone.trim().length > 0
      );
    }
    if (step === 3) {
      return players.some((p) => managerPlayerReady(p));
    }
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
        // Division label already carries class (e.g. "Men's D") — no separate field.
        class:
          registerableDivisions.find((d) => d.id === effectiveDivisionId)
            ?.display_name ??
          registerableDivisions.find((d) => d.id === effectiveDivisionId)?.name ??
          null,
        afaMembershipNumber: afaMembershipNumber.trim(),
        manager: {
          legalFirstName: manager.legalFirstName.trim(),
          legalLastName: manager.legalLastName.trim(),
          preferredName: manager.preferredName.trim() || null,
          email: manager.email.trim(),
          phone: manager.phone.trim() || null,
          cell: manager.cell?.trim() || null,
          address: manager.address,
          city: manager.city,
          state: manager.state,
          zip: manager.zip,
        },
        players: players
          .filter((p) => managerPlayerReady(p))
          .map((p) => ({
            firstName: p.firstName.trim(),
            lastName: p.lastName.trim(),
            gender: p.gender,
          })),
        coaches: coaches
          .filter(
            (c) =>
              c.legalFirstName.trim().length > 0 &&
              c.legalLastName.trim().length > 0
          )
          .map((c) => ({
            legalFirstName: c.legalFirstName.trim(),
            legalLastName: c.legalLastName.trim(),
            preferredName: c.preferredName.trim() || null,
            email: c.email.trim() || null,
            phone: c.phone.trim() || null,
          })),
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
      setRosterLink(json.rosterLink ?? "");
      setManageLink(json.manageLink ?? "");
      // Remember on this device so "Already registered?" works next visit
      try {
        const { manageToken, rosterToken } = tokensFromLinks({
          manageLink: json.manageLink,
          rosterLink: json.rosterLink,
        });
        if (manageToken) {
          rememberRegistration({
            teamName: teamName.trim(),
            tournamentName: tournament?.name || "",
            tournamentSlug: tournament?.slug || "",
            manageToken,
            rosterToken,
            manageLink: json.manageLink,
            rosterLink: json.rosterLink,
            managerEmail: manager.email,
          });
        }
        if (teamName.trim()) {
          writeMe({ teamName: teamName.trim(), source: "picked" });
        }
      } catch {
        /* localStorage optional */
      }
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
      <div className="space-y-4">
        <RegisterBack
          href={
            tournament?.slug
              ? `/tournaments/${tournament.slug}`
              : "/tournaments"
          }
          label={tournament?.name || "Tournaments"}
        />
      <div className="rounded-xl bg-white p-6 space-y-4 card">
        <h2 className="t-title">Registration saved</h2>
        <p className="text-afa-ink/80">
          {teamName} is on the books for {tournament?.name}. This phone will
          remember the team under <strong>Already registered?</strong> on the
          Register page.
        </p>
        {manageLink && (
          <div className="form-surface p-4 space-y-2">
            <p className="t-strong">Your private manage link</p>
            <p className="text-sm text-afa-ink/80">
              Bookmark this or copy it. Later: open Register → your team is
              listed, or look up with this same manager email. Do not put this
              in the team chat &mdash; anyone who has it can change the roster.
            </p>
            <a href={manageLink} className="btn-action w-full text-center block">
              Open my roster manager
            </a>
            <button type="button" onClick={() => copyLink(manageLink, "manage")} className="btn-transient w-full">
              {copiedIndex === "manage" ? "Copied" : "Copy manage link"}
            </button>
          </div>
        )}
        {rosterLink && (
          <div className="form-surface p-4 space-y-2">
            <p className="t-heading">Send one link to your team</p>
            <p className="text-sm text-afa-ink/80">
              Paste this into your team chat. Everyone taps their own name and
              signs. You do not have to send {signers.length} separate messages.
            </p>
            <button
              type="button"
              onClick={() => copyLink(rosterLink, "roster")}
              className="btn-action w-full"
            >
              {copiedIndex === "roster" ? "Copied" : "Copy team link"}
            </button>
          </div>
        )}
        <details>
          <summary className="font-semibold text-sm cursor-pointer">
            Or send people their links one at a time
          </summary>
          <p className="text-sm text-afa-ink/70 mt-2 mb-2">
            Nothing goes out automatically. Once someone opens their link and
            signs, they&rsquo;re done.
          </p>
          <ul className="space-y-2">
            {signers.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {s.name} <span className="text-afa-ink/50">({s.role})</span>
                </span>
                <button
                  type="button"
                  onClick={() => copyLink(s.signLink, i)}
                  className="btn-transient shrink-0"
                >
                  {copiedIndex === i ? "Copied" : "Copy link"}
                </button>
              </li>
            ))}
          </ul>
        </details>
        {rosterLink && (
          <p className="t-meta">
            <a href={rosterLink} className="underline font-semibold text-afa-navy">
              Open team roster →
            </a>
          </p>
        )}
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={
              "step-chip " +
              (i === step
                ? "step-chip--current"
                : i < step
                ? "step-chip--done"
                : "step-chip--todo")
            }
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div className="form-surface p-4 space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <div className="seg-view" role="group" aria-label="Filter by region">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => chooseFilter(opt.value)}
                  className={seriesFilter === opt.value ? "btn-info" : "btn-transient"}
                  aria-pressed={seriesFilter === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="register-tournament-row">
              <label className="register-tournament-row__field">
                <span className="form-label">Tournament</span>
                <select
                  className="form-field"
                  value={tournamentId}
                  onChange={(e) => {
                    setTournamentId(e.target.value);
                    setDivisionId("");
                  }}
                >
                  {filteredTournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {formatLeagueDateOnly(t.start_date)}
                      {seriesFilter === "all"
                        ? ` · ${regionLabel[canonicalRegion(t)] ?? t.region}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              {externalRegisterUrl ? (
                <a
                  href={externalRegisterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-action register-tournament-row__next"
                >
                  Register
                  {externalRegisterHost ? ` · ${externalRegisterHost}` : ""}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  disabled={!canProceed()}
                  className="btn-action register-tournament-row__next disabled:opacity-30"
                >
                  Next
                </button>
              )}
            </div>

            {externalRegisterUrl && (
              <p className="register-external-note">
                Registration for {tournament?.name} is on an external site
                {externalRegisterHost ? ` (${externalRegisterHost})` : ""}.
                Use the button above — this form is only for AFA-hosted signups.
                {tournament?.registration_note ? (
                  <>
                    {" "}
                    <span className="register-external-note__extra">
                      {tournament.registration_note}
                    </span>
                  </>
                ) : null}
              </p>
            )}

            {/* Poster for every tournament in the current dropdown list */}
            {filteredTournaments.length > 0 && (
              <div
                className="register-poster-grid"
                role="listbox"
                aria-label="Tournament posters"
              >
                {filteredTournaments.map((t) => {
                  const selected = t.id === tournamentId;
                  const hasPoster = Boolean(t.poster_url);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={
                        "register-poster-pick" +
                        (selected ? " is-selected" : "") +
                        (!hasPoster ? " is-empty" : "")
                      }
                      onClick={() => {
                        if (selected && hasPoster) {
                          setPosterOpen(true);
                        } else {
                          setTournamentId(t.id);
                          setDivisionId("");
                        }
                      }}
                      aria-label={
                        selected && hasPoster
                          ? `View full ${t.name} poster`
                          : `Select ${t.name}`
                      }
                    >
                      {hasPoster ? (
                        <img
                          src={t.poster_url}
                          alt=""
                          className="register-poster-pick__img"
                        />
                      ) : (
                        <span className="register-poster-pick__fallback">
                          No flyer
                        </span>
                      )}
                      <span className="register-poster-pick__name">{t.name}</span>
                      <span className="register-poster-pick__when">
                        {formatLeagueDateOnly(t.start_date)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {tournament?.poster_url && (
              <p className="register-poster-hint-line">
                Selected flyer — tap again to enlarge
              </p>
            )}

            {posterOpen && tournament?.poster_url && (
              <div
                className="register-poster-lightbox"
                role="dialog"
                aria-modal="true"
                aria-label={`${tournament.name} poster`}
                onClick={() => setPosterOpen(false)}
              >
                <img
                  src={tournament.poster_url}
                  alt={`${tournament.name} poster`}
                  className="register-poster-lightbox__img"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Field label="Team Name">
              <input
                className="form-field"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Fallen"
                autoComplete="organization"
              />
            </Field>
            {registerableDivisions.length > 0 && (
              <div>
                <span className="form-label">Division</span>
                <div
                  className="register-division-picks"
                  role="group"
                  aria-label="Division"
                >
                  {registerableDivisions.map((d) => {
                    const id = d.id;
                    const label = d.display_name ?? d.name;
                    const selected =
                      registerableDivisions.length === 1 ||
                      divisionId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={
                          selected ? "btn-info" : "btn-transient"
                        }
                        aria-pressed={selected}
                        onClick={() => setDivisionId(id)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {registerableDivisions.length > 1 && !divisionId && (
                  <p className="t-meta text-[12px] mt-1.5">
                    Pick the division this team is entering.
                  </p>
                )}
              </div>
            )}
            <Field label="AFA Membership # (optional)">
              <input
                className="form-field"
                value={afaMembershipNumber}
                onChange={(e) => setAfaMembershipNumber(e.target.value)}
              />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <PersonWizard
              embedded
              variant="manager"
              value={manager}
              onChange={setManager}
              completeLabel="Looks good — use Next below"
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-afa-ink/70">
              For each player enter <strong>first name</strong>,{" "}
              <strong>last name</strong>, and <strong>gender</strong> only.
              They complete legal name, preferred name, birth date, email, and
              address when they sign their own waiver. At least one player is
              required.
            </p>
            {/* Managers play. If she has not listed herself, offer it rather
                than adding it behind her back — the route adds her either way. */}
            {personDisplay(manager) &&
              !players.some((p) =>
                sameName(personDisplay(p), personDisplay(manager))
              ) && (
              <button
                type="button"
                onClick={() =>
                  setPlayers((prev) => [
                    {
                      firstName: manager.legalFirstName,
                      lastName: manager.legalLastName,
                      gender: "",
                    },
                    ...prev,
                  ])
                }
                className="form-field text-left"
              >
                <span className="font-semibold text-afa-navy">
                  Add {personDisplay(manager)} to the roster
                </span>
                <span className="block text-afa-ink/70">
                  Managers are normally on their own team. You sign one waiver
                  either way — pick M/F for yourself after adding.
                </span>
              </button>
            )}
            {players.map((p, i) => (
              <div key={i} className="form-surface p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm">
                    Player {i + 1}
                    {personDisplay(p) ? (
                      <span className="font-normal text-afa-ink/60">
                        {" "}
                        · {personDisplay(p)}
                        {p.gender ? ` · ${p.gender}` : ""}
                      </span>
                    ) : null}
                  </p>
                  {players.length > MIN_PLAYERS && (
                    <button
                      type="button"
                      className="btn-transient"
                      onClick={() =>
                        setPlayers((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <ManagerPlayerFields
                  value={p}
                  onChange={(next) => {
                    setPlayers((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    });
                  }}
                  idPrefix={`reg-player-${i}`}
                />
              </div>
            ))}
            {players.length < MAX_PLAYERS && (
              <button
                type="button"
                className="btn-transient w-full"
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
              <div key={i} className="form-surface p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-sm">Coach {i + 1}</p>
                  <button
                    type="button"
                    className="btn-transient"
                    onClick={() =>
                      setCoaches((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
                <PersonWizard
                  embedded
                  variant="coach"
                  value={c}
                  onChange={(next) => {
                    setCoaches((prev) => {
                      const copy = [...prev];
                      copy[i] = next;
                      return copy;
                    });
                  }}
                  completeLabel="Coach ready"
                />
              </div>
            ))}
            {coaches.length < MAX_COACHES && (
              <button
                type="button"
                className="btn-transient w-full"
                onClick={() => setCoaches((prev) => [...prev, emptyCoach()])}
              >
                + Add Coach
              </button>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto form-surface p-3 text-sm">
              {RELEASE_TEXT}
            </div>
            <label className="register-agree">
              <input
                type="checkbox"
                className="register-agree__box"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="register-agree__text">
                I have read this release and waiver of liability and I agree to
                it as the team&rsquo;s manager.
              </span>
            </label>
            <p className="text-xs text-afa-ink/60">
              You sign once, as a member of this roster. That signature covers
              the manager line on the form too. Everyone else signs their own
              copy on their own link.
            </p>
            <div>
              <p className="font-semibold text-sm mb-1">
                Manager&rsquo;s Signature{" "}
                <span className="font-normal text-afa-ink/60">— or sign later</span>
              </p>
              <SignaturePad onChange={setSignature} />
              <p className="text-xs text-afa-ink/60 mt-1">
                You can submit without signing and come back to it. Submitting
                gets your team on the list; signing is what makes it official.
              </p>
            </div>
            {submitState === "error" && (
              <p className="text-afa-ink text-sm font-bold underline">{submitError}</p>
            )}
            <button
              type="button"
              // The signature is no longer a gate — only agreement is. JD,
              // 2026-07-27: "should be able to sign it whenever, even after
              // submitting. Signing makes it official."
              disabled={!agreed || submitState === "submitting"}
              onClick={submit}
              className="btn-action-block disabled:opacity-40"
            >
              {submitState === "submitting" ? "Submitting…" : "Submit Registration"}
            </button>
          </div>
        )}
      </div>

      {/* Step 0 keeps Next beside the tournament dropdown so it stays on-screen. */}
      {step > 0 && (
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="btn-transient"
          >
            Back
          </button>
          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canProceed()}
              className="btn-action disabled:opacity-30"
            >
              Next
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="form-label">{label}</span>
      {children}
    </label>
  );
}
