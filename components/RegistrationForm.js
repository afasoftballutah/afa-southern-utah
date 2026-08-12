"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import SignaturePad from "./SignaturePad";
import RegisterBack from "./RegisterBack";
import { RELEASE_TEXT, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/waiver";
import { formatLeagueDateOnly } from "@/lib/league-time";
import { REGION_ORDER, canonicalRegion } from "@/lib/data";
import {
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  subscribeRegionPref,
} from "@/lib/region-pref";
import {
  rememberRegistration,
  tokensFromLinks,
  deviceTeamName,
  localRegistrationForCombo,
  localPrefillSource,
  forgetTeamOnDevice,
} from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";
import Link from "next/link";
import PersonWizard from "@/components/forms/PersonWizard";
import {
  managerPlayerDisplay,
  managerPlayerReady,
} from "@/components/ManagerPlayerFields";
import CompactPlayerAdd from "@/components/CompactPlayerAdd";
import MyRegistrations from "@/components/MyRegistrations";
import DivisionSeatMark from "@/components/DivisionSeatMark";
import { PageDots } from "@/components/forms/SoftField";
import {
  divisionLevelLabel,
  groupDivisionsByGender,
  seatFromDivision,
} from "@/lib/division-layout";

// No coaches on public signup (JD). Coaches stay out of the form; manager + players only.
// Room flow: door (tournament) → rooms → exit (confirmation).
const STEPS = ["Tournament", "Team", "Manager", "Players", "Sign & Submit"];

function doorAlreadyOpen(tournaments, slug, divisionId) {
  if (!slug || !divisionId) return false;
  const t = tournaments.find((x) => x.slug === slug);
  if (!t) return false;
  return (t.divisions ?? []).some(
    (d) => d.id === divisionId && d.parent_division_id == null
  );
}

const sameName = (a, b) => a?.trim().toLowerCase() === b?.trim().toLowerCase();

const emptyPlayer = () => ({
  firstName: "",
  lastName: "",
  gender: "",
  playerId: null,
});
const personDisplay = (p) => {
  // Manager uses legal + preferred; players use first + last.
  if (p.firstName || p.lastName) return managerPlayerDisplay(p);
  const preferred = (p.preferredName || "").trim();
  if (preferred) return preferred;
  return [p.legalFirstName, p.legalLastName].filter(Boolean).join(" ").trim() || (p.name || "").trim();
};

export default function RegistrationForm({
  tournaments,
  regionLabel,
  initialTournamentSlug = null,
  initialDivisionId = null,
  /** Directory for pick-existing-player on the Players step. */
  knownPlayers = [],
  /** Liability release text (from Director → Documents when set). */
  releaseText = RELEASE_TEXT,
}) {
  const skippedDoor = doorAlreadyOpen(
    tournaments,
    initialTournamentSlug,
    initialDivisionId
  );
  const [step, setStep] = useState(() => (skippedDoor ? 1 : 0));
  const [changingDivision, setChangingDivision] = useState(false);
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
  const [divisionId, setDivisionId] = useState(initialDivisionId || "");

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
  const selectedDivision = useMemo(
    () => registerableDivisions.find((d) => d.id === effectiveDivisionId) ?? null,
    [registerableDivisions, effectiveDivisionId]
  );
  const selectedSeat = seatFromDivision(selectedDivision);
  const showDivisionGrid =
    registerableDivisions.length > 0 &&
    (changingDivision || !effectiveDivisionId);

  function chooseFilter(next) {
    setSeriesFilter(next);
    const stillVisible =
      next === "all" || (tournament && canonicalRegion(tournament) === next);
    if (!stillVisible) {
      setTournamentId("");
      setDivisionId("");
    }
  }

  const [deviceTick, setDeviceTick] = useState(0);
  const [lockedTeam, setLockedTeam] = useState("");
  const [blocked, setBlocked] = useState(null);
  const [nameTaken, setNameTaken] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [afaMembershipNumber, setAfaMembershipNumber] = useState("");
  const prefilledFor = useRef("");

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

  // Start empty — managers add one at a time (compact list).
  const [players, setPlayers] = useState([]);

  const [agreed, setAgreed] = useState(false);
  const [signature, setSignature] = useState(null);

  useEffect(() => {
    const name = deviceTeamName();
    setLockedTeam(name || "");
    if (name) setTeamName(name);
  }, [deviceTick]);

  function bumpDevice() {
    setDeviceTick((n) => n + 1);
  }

  function forgetLockedTeam() {
    const name = lockedTeam || teamName;
    if (name) forgetTeamOnDevice(name);
    prefilledFor.current = "";
    setLockedTeam("");
    setTeamName("");
    setBlocked(null);
    setNameTaken(false);
    setAfaMembershipNumber("");
    setManager({
      legalFirstName: "",
      legalLastName: "",
      preferredName: "",
      name: "",
      email: "",
      phone: "",
      cell: "",
      address: "",
      city: "",
      state: "",
      zip: "",
    });
    setPlayers([]);
    bumpDevice();
  }

  useEffect(() => {
    if (!tournament?.slug || !effectiveDivisionId) {
      setBlocked(null);
      setNameTaken(false);
      return;
    }
    const name = (lockedTeam || teamName).trim();
    if (!name) {
      setBlocked(null);
      setNameTaken(false);
      return;
    }
    const existing = localRegistrationForCombo({
      tournamentSlug: tournament.slug,
      divisionId: effectiveDivisionId,
      genderKey: selectedSeat?.genderKey,
      levelLabel: selectedSeat?.levelLabel,
      teamName: name,
    });
    if (existing) {
      setBlocked(existing);
      setNameTaken(false);
      return;
    }
    setBlocked(null);

    const source = lockedTeam
      ? localPrefillSource({
          tournamentSlug: tournament.slug,
          teamName: lockedTeam,
        })
      : null;
    if (source?.manageToken && prefilledFor.current !== source.manageToken) {
      const token = source.manageToken;
      fetch("/api/register/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manageToken: token }),
      })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (!ok || !json) return;
          prefilledFor.current = token;
          if (json.afaMembershipNumber) {
            setAfaMembershipNumber(json.afaMembershipNumber);
          }
          if (json.manager) {
            setManager((cur) => ({ ...cur, ...json.manager }));
          }
          if (Array.isArray(json.players) && json.players.length > 0) {
            setPlayers(json.players);
          }
        })
        .catch(() => {});
    }

    if (lockedTeam) {
      setNameTaken(false);
      return;
    }

    const ac = new AbortController();
    const t = setTimeout(() => {
      fetch("/api/register/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          divisionId: effectiveDivisionId,
          teamName: name,
        }),
        signal: ac.signal,
      })
        .then((res) => res.json())
        .then((json) => setNameTaken(Boolean(json.taken)))
        .catch(() => {});
    }, 350);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [
    tournament?.slug,
    tournamentId,
    effectiveDivisionId,
    lockedTeam,
    teamName,
    selectedSeat?.genderKey,
    selectedSeat?.levelLabel,
  ]);

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
      if (blocked || nameTaken) return false;
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
            playerId: p.playerId || null,
          })),
        coaches: [],
        signaturePng: signature,
      };
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === "duplicate_key") {
          setNameTaken(true);
          if (step > 1) setStep(1);
        }
        throw new Error(json.error || "Registration failed");
      }
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
          const div = (tournament?.divisions ?? []).find(
            (d) => d.id === effectiveDivisionId
          );
          const seat = seatFromDivision(div);
          rememberRegistration({
            teamName: teamName.trim(),
            tournamentName: tournament?.name || "",
            tournamentSlug: tournament?.slug || "",
            manageToken,
            rosterToken,
            manageLink: json.manageLink,
            rosterLink: json.rosterLink,
            managerEmail: manager.email,
            divisionId: effectiveDivisionId,
            genderKey: seat?.genderKey,
            genderLabel: seat?.genderLabel,
            levelLabel: seat?.levelLabel,
            seatLabel: seat?.seatLabel,
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

  const stepTotal = skippedDoor ? STEPS.length - 1 : STEPS.length;
  const stepNumber = skippedDoor ? step : step + 1;
  const showFormBack = step > 0 && !(skippedDoor && step === 1);
  const alreadyHere = Boolean(blocked);

  return (
    <div className="space-y-4">
      {step === 0 && <MyRegistrations onChange={bumpDevice} />}
      {skippedDoor && step === 1 && !alreadyHere && tournament?.slug ? (
        <MyRegistrations compactSlug={tournament.slug} onChange={bumpDevice} />
      ) : null}
      {!alreadyHere && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="t-strong">
              {STEPS[step]}
              <span className="t-meta font-normal">
                {" "}
                · {stepNumber} of {stepTotal}
              </span>
            </p>
          </div>
          <PageDots page={stepNumber} total={stepTotal} />
        </div>
      )}

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
                  Continue
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

        {step === 1 && alreadyHere && (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2">
              <span className="team-name font-semibold">{blocked.teamName}</span>
              <DivisionSeatMark
                genderKey={selectedSeat?.genderKey}
                seatLabel={selectedSeat?.seatLabel}
                genderLabel={selectedSeat?.genderLabel}
                levelLabel={selectedSeat?.levelLabel}
              />
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/register/manage/${encodeURIComponent(blocked.manageToken)}`}
                className="btn-action"
              >
                Manage roster
              </Link>
              {registerableDivisions.length > 1 && (
                <button
                  type="button"
                  className="btn-transient"
                  onClick={() => setChangingDivision(true)}
                >
                  Change
                </button>
              )}
              <button
                type="button"
                className="t-meta underline"
                onClick={forgetLockedTeam}
              >
                Forget
              </button>
            </div>
            {showDivisionGrid ? (
              <DivisionPicker
                divisions={registerableDivisions}
                divisionId={effectiveDivisionId}
                onPick={(id) => {
                  setDivisionId(id);
                  setChangingDivision(false);
                }}
              />
            ) : null}
          </div>
        )}

        {step === 1 && !alreadyHere && (
          <div className="space-y-4">
            <Field label="Team Name">
              <input
                className={
                  "form-field" + (lockedTeam ? " bg-afa-soft-gray/50" : "")
                }
                value={teamName}
                onChange={(e) => {
                  if (lockedTeam) return;
                  setTeamName(e.target.value);
                }}
                readOnly={Boolean(lockedTeam)}
                placeholder="e.g. Fallen"
                autoComplete="organization"
              />
              {lockedTeam ? (
                <p className="t-meta mt-1">
                  <button
                    type="button"
                    className="underline"
                    onClick={forgetLockedTeam}
                  >
                    Forget
                  </button>{" "}
                  to register a different team.
                </p>
              ) : null}
              {nameTaken ? (
                <p className="text-sm text-red-700 mt-1" role="alert">
                  {teamName.trim()} is already registered for this division.
                  Use a different name.
                </p>
              ) : null}
            </Field>
            {registerableDivisions.length > 0 && (
              <div>
                <span className="form-label">Division</span>
                {showDivisionGrid ? (
                  <DivisionPicker
                    divisions={registerableDivisions}
                    divisionId={effectiveDivisionId}
                    onPick={(id) => {
                      setDivisionId(id);
                      setChangingDivision(false);
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <DivisionSeatMark
                      genderKey={selectedSeat?.genderKey}
                      seatLabel={selectedSeat?.seatLabel}
                      genderLabel={selectedSeat?.genderLabel}
                      levelLabel={selectedSeat?.levelLabel}
                    />
                    {registerableDivisions.length > 1 && (
                      <button
                        type="button"
                        className="t-meta underline"
                        onClick={() => setChangingDivision(true)}
                      >
                        Change
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <Field label="AFA Membership #">
              <input
                className="form-field"
                value={afaMembershipNumber}
                onChange={(e) => setAfaMembershipNumber(e.target.value)}
                placeholder="optional"
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
              completeLabel="Looks good — use Continue below"
            />
          </div>
        )}

        {step === 3 && (
          <CompactPlayerAdd
            players={players}
            onChange={setPlayers}
            knownPlayers={knownPlayers}
            maxPlayers={MAX_PLAYERS}
            minPlayers={MIN_PLAYERS}
            managerOffer={
              personDisplay(manager)
                ? {
                    firstName: manager.legalFirstName,
                    lastName: manager.legalLastName,
                    display: personDisplay(manager),
                  }
                : null
            }
          />
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="max-h-48 overflow-y-auto form-surface p-3 text-sm">
              {releaseText}
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
        <div className={"flex " + (showFormBack ? "justify-between" : "justify-end")}>
          {showFormBack && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="btn-transient"
            >
              Back
            </button>
          )}
          {step < STEPS.length - 1 && !blocked && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canProceed()}
              className="btn-action disabled:opacity-30"
            >
              Continue
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

function DivisionPicker({ divisions, divisionId, onPick }) {
  return (
    <div
      className={
        "register-division-cols" + (divisionId ? " has-pick" : "")
      }
      role="group"
      aria-label="Division"
    >
      {groupDivisionsByGender(divisions).map((row) => {
        const inCol = row.items;
        const genderOnly = row.genderOnly;
        const colOn = inCol.some((d) => d.id === divisionId);
        return (
          <div
            key={row.key}
            className={"register-division-col register-division-col--" + row.key}
          >
            {genderOnly ? (
              <button
                type="button"
                className={
                  "register-division-col__card register-division-col__card--header " +
                  (colOn ? "is-on" : "")
                }
                aria-pressed={colOn}
                onClick={() => onPick(inCol[0].id)}
              >
                {row.label}
              </button>
            ) : (
              <>
                <span
                  className={
                    "register-division-col__card register-division-col__card--header " +
                    (colOn ? "is-on" : "")
                  }
                >
                  {row.label}
                </span>
                {inCol.map((d) => {
                  const selected = divisionId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={
                        "register-division-col__card " +
                        (selected ? "is-on" : "")
                      }
                      aria-pressed={selected}
                      onClick={() => onPick(d.id)}
                    >
                      {divisionLevelLabel(d)}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
