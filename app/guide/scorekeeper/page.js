import Link from "next/link";

export const metadata = {
  title: "Site guide — AFA Southern Utah",
  description:
    "Simple picture guide: public site tour, team manager registration, and Scorekeeper for directors.",
};

const SITE = "https://afa-southern-utah.vercel.app";
const SK = `${SITE}/scorekeeper`;
const REGISTER = `${SITE}/register`;
const TOURNAMENTS = `${SITE}/tournaments`;
const RULES = `${SITE}/rules`;

const TOC = [
  { id: "public", label: "Public site tour" },
  { id: "register", label: "Register a team (managers)" },
  { id: "after-register", label: "After you register" },
  { id: "path", label: "Director game-day path" },
  { id: "pin", label: "Unlock Scorekeeper" },
  { id: "control", label: "Control Center" },
  { id: "tournament", label: "Tournament & scores" },
  { id: "scores", label: "Enter a score" },
  { id: "brackets", label: "Make a bracket" },
  { id: "checklist", label: "Checklists" },
];

function Step({ n, title, children }) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-afa-red text-base font-bold text-white"
        aria-hidden
      >
        {n}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 pb-1">
        <h3 className="text-lg font-bold text-afa-navy leading-snug">{title}</h3>
        <div className="text-[15px] sm:text-base text-afa-ink/80 leading-relaxed space-y-1.5">
          {children}
        </div>
      </div>
    </div>
  );
}

function Figure({ src, alt, caption }) {
  return (
    <figure className="mt-4 overflow-hidden rounded-xl border border-afa-navy/15 bg-afa-navy/[0.03]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="mx-auto w-full max-w-md object-contain bg-white"
        loading="lazy"
      />
      {caption ? (
        <figcaption className="border-t border-afa-navy/10 px-3 py-2 text-center text-sm text-afa-ink/60">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

function Callout({ tone = "info", title, children }) {
  const styles =
    tone === "warn"
      ? "border-amber-500/50 bg-amber-50 text-amber-950"
      : tone === "ok"
        ? "border-emerald-600/40 bg-emerald-50 text-emerald-950"
        : "border-afa-navy/25 bg-afa-navy/[0.04] text-afa-navy";
  return (
    <div className={`mt-4 rounded-xl border-2 px-4 py-3 ${styles}`}>
      <p className="font-bold text-[15px]">{title}</p>
      <div className="mt-1 text-[15px] leading-relaxed opacity-90">{children}</div>
    </div>
  );
}

function Section({ id, eyebrow, title, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-afa-navy/12 bg-white p-5 sm:p-7 shadow-sm"
    >
      {eyebrow ? (
        <p className="text-xs font-bold uppercase tracking-wider text-afa-red mb-1">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="t-heading text-afa-navy mb-4">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function ExtLink({ href, children }) {
  return (
    <a href={href} className="font-semibold text-afa-red break-all underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

export default function ScorekeeperGuidePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16 pt-2">
      <header className="rounded-2xl bg-afa-navy px-5 py-7 sm:px-8 sm:py-9 text-white">
        <p className="text-sm font-semibold text-white/70 uppercase tracking-wide">
          AFA Southern Utah
        </p>
        <h1 className="mt-1 text-3xl sm:text-4xl font-bold leading-tight">
          Site guide
        </h1>
        <p className="mt-3 text-base sm:text-lg text-white/85 leading-relaxed max-w-prose">
          Public pages for everyone, registration for team managers, and
          Scorekeeper for directors. Picture steps. Nothing to install.
        </p>
        <div className="mt-5 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
          <a
            href={SITE}
            className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 font-bold text-afa-navy text-center"
          >
            Public home
          </a>
          <a
            href={REGISTER}
            className="inline-flex items-center justify-center rounded-full bg-afa-red px-5 py-2.5 font-bold text-white text-center"
          >
            Register a team
          </a>
          <a
            href={SK}
            className="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2.5 font-semibold text-white text-center"
          >
            Scorekeeper
          </a>
        </div>
        <p className="mt-4 text-sm text-white/60">
          Scorekeeper PIN is not on this page — directors get it separately.
        </p>
      </header>

      <nav
        aria-label="Guide sections"
        className="rounded-2xl border border-afa-navy/12 bg-white p-4 sm:p-5"
      >
        <p className="text-sm font-bold text-afa-navy mb-2">Jump to a section</p>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[15px]">
          {TOC.map((item, i) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-afa-navy underline-offset-2 hover:underline font-medium"
              >
                <span className="text-afa-red font-bold mr-1.5">{i + 1}.</span>
                {item.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ========== PUBLIC TOUR ========== */}
      <Section id="public" eyebrow="Everyone" title="Public site tour">
        <p className="text-[15px] text-afa-ink/75 leading-relaxed">
          This is what coaches, players, and families see. No login. Use Safari
          or Chrome on a phone or computer.
        </p>

        <Step n={1} title="Home page">
          <p>
            Open <ExtLink href={SITE}>{SITE}/</ExtLink>
          </p>
          <p>
            You get the eagle hero, poster carousel, upcoming events, and recent
            results. Big red buttons: <strong>Tournaments</strong> and{" "}
            <strong>Register</strong>.
          </p>
          <p className="text-sm text-afa-ink/60">
            Top bar also has Tournaments, News, and Rules.
          </p>
        </Step>
        <Figure
          src="/guide/assets/01-home-phone.png"
          alt="AFA home page"
          caption="Home — public face of AFA Southern Utah"
        />

        <Step n={2} title="Tournaments list">
          <p>
            Open <ExtLink href={TOURNAMENTS}>{TOURNAMENTS}</ExtLink> or tap
            Tournaments on the home page.
          </p>
          <p>
            Full list of events with dates and venues. Tap an event for details.
          </p>
        </Step>
        <Figure
          src="/guide/assets/pub-tournaments.png"
          alt="Tournaments list"
          caption="Tournaments — pick an event"
        />

        <Step n={3} title="One tournament page">
          <p>
            Poster, dates, fees, venue, divisions, and results when available.
            Look for <strong>Register</strong> when sign-up is open.
          </p>
          <p className="text-sm text-afa-ink/60">
            Some events use an outside registration link (city rec, etc.). The
            page will send you there.
          </p>
        </Step>
        <Figure
          src="/guide/assets/pub-tournament-detail.png"
          alt="Tournament detail page"
          caption="Tournament detail — info, register, results"
        />

        <Step n={4} title="Rules">
          <p>
            Open <ExtLink href={RULES}>{RULES}</ExtLink> from the top nav.
          </p>
          <p>AFA slow-pitch rules browser. Tournament-specific notes live on each tournament page.</p>
        </Step>
        <Figure
          src="/guide/assets/pub-rules.png"
          alt="Rules page"
          caption="Rules — official AFA slow-pitch text"
        />

        <Callout tone="info" title="What is not public">
          Scores entry, brackets setup, and player directories are behind{" "}
          <strong>Scorekeeper</strong> (PIN). Families never need that.
        </Callout>
      </Section>

      {/* ========== MANAGER REGISTRATION ========== */}
      <Section id="register" eyebrow="Team managers" title="Register a team">
        <p className="text-[15px] text-afa-ink/75 leading-relaxed">
          The manager (or person entering the team) walks a short wizard. You
          do <strong>not</strong> need a Scorekeeper PIN.
        </p>

        <Step n={1} title="Start registration">
          <p>
            Open <ExtLink href={REGISTER}>{REGISTER}</ExtLink>
          </p>
          <p>
            Or from a tournament page, tap <strong>Register</strong> (that can
            pre-select the event).
          </p>
          <p className="text-sm text-afa-ink/60">
            Only tournaments with an open window and a posted flyer appear here.
            If the list is empty, nothing is open yet.
          </p>
        </Step>
        <Figure
          src="/guide/assets/reg-start.png"
          alt="Register a team — pick tournament"
          caption="Step 1 of 6 — pick the tournament"
        />

        <div className="rounded-xl border border-afa-navy/12 bg-afa-navy/[0.03] px-4 py-3">
          <p className="font-bold text-afa-navy text-[15px] mb-2">
            The six steps (chips at the top)
          </p>
          <ol className="space-y-2 text-[15px] text-afa-ink/85">
            <li>
              <strong className="text-afa-navy">1. Tournament</strong> — pick
              the event (filter by region if you like). Tap <strong>Next</strong>.
            </li>
            <li>
              <strong className="text-afa-navy">2. Team</strong> — team name and
              division (when the tournament has more than one).
            </li>
            <li>
              <strong className="text-afa-navy">3. Manager</strong> — your name
              and email (required). Phone and address if asked.
            </li>
            <li>
              <strong className="text-afa-navy">4. Players</strong> — at least
              one player name. Birth date / address when the form asks.
            </li>
            <li>
              <strong className="text-afa-navy">5. Coaches</strong> — optional.
              Skip with Next if you have none yet.
            </li>
            <li>
              <strong className="text-afa-navy">6. Sign &amp; Submit</strong> —
              read the release, check agree, sign on the pad if offered, then{" "}
              <strong>Submit Registration</strong>.
            </li>
          </ol>
        </div>

        <Callout tone="ok" title="Tip">
          Use <strong>Back</strong> / <strong>Next</strong> at the bottom of
          each step. The chips at the top show where you are (1–6).
        </Callout>

        <Callout tone="warn" title="Outside registration">
          A few events register on another site (city rec, etc.). If you pick
          one of those, the form will point you to their link instead of our
          six steps.
        </Callout>
      </Section>

      <Section id="after-register" eyebrow="Team managers" title="After you register">
        <p className="text-[15px] text-afa-ink/75 leading-relaxed">
          When submit works, you see <strong>Registration saved</strong>. Two
          important links appear — treat them differently.
        </p>

        <article className="rounded-xl border-2 border-afa-navy/15 p-4 sm:p-5 space-y-2">
          <p className="font-bold text-afa-navy text-lg">1. Team link (share this)</p>
          <p className="text-[15px] text-afa-ink/80 leading-relaxed">
            <strong>Copy team link</strong> and paste it in your team chat.
            Everyone taps their own name and signs the waiver. You do not need
            to send a separate message to each person.
          </p>
          <p className="text-sm text-afa-ink/60">
            That page is the shared roster. Players use personal sign links from
            there.
          </p>
        </article>

        <article className="rounded-xl border-2 border-amber-500/40 bg-amber-50/50 p-4 sm:p-5 space-y-2">
          <p className="font-bold text-afa-navy text-lg">2. Your manage link (keep private)</p>
          <p className="text-[15px] text-afa-ink/80 leading-relaxed">
            <strong>Copy my roster link</strong> is for the manager only. Add a
            late player, remove someone, or claim free agents.{" "}
            <strong>Do not put this in the team chat</strong> — anyone with it
            can change the roster.
          </p>
        </article>

        <Step n={1} title="Players sign">
          <p>
            Each person opens the team link, finds their name, and signs. When
            they finish, they are done — nothing emails out automatically.
          </p>
        </Step>
        <Step n={2} title="You manage the roster later">
          <p>
            Bookmark your private manage link. Use it the week of the
            tournament if the lineup changes.
          </p>
        </Step>

        <Callout tone="info" title="Optional: one-at-a-time links">
          Under “Or send people their links one at a time” you can copy a
          personal sign link for each name. The shared team link is usually
          enough.
        </Callout>
      </Section>

      {/* ========== DIRECTORS ========== */}
      <Section id="path" eyebrow="Directors" title="Game-day path (Scorekeeper)">
        <p className="text-[15px] text-afa-ink/75">
          Five stops for directors. Always the same order.
        </p>
        <ol className="space-y-2">
          {[
            ["Home", "What teams and families see"],
            ["Scorekeeper", "PIN pad — directors only"],
            ["Control Center", "Tournaments · Teams · Players"],
            ["Your tournament", "Open the event in the list"],
            ["Division → Scores", "Enter results and run brackets"],
          ].map(([name, detail], i) => (
            <li
              key={name}
              className="flex gap-3 rounded-xl border border-afa-navy/10 px-3 py-2.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-afa-red text-sm font-bold text-white">
                {i + 1}
              </span>
              <span>
                <span className="font-bold text-afa-navy">{name}</span>
                <span className="block text-sm text-afa-ink/65">{detail}</span>
              </span>
            </li>
          ))}
        </ol>
        <Callout tone="ok" title="Remember">
          Game day scores and brackets live under <strong>Tournaments</strong>.
          Teams and Players are for rosters and people.
        </Callout>
      </Section>

      <Section id="pin" eyebrow="Directors" title="Unlock Scorekeeper">
        <p className="text-[15px] text-afa-ink/75">
          Private control room. Only directors. PIN is not printed here.
        </p>
        <Step n={1} title="Go to Scorekeeper">
          <p>
            <ExtLink href={SK}>{SK}</ExtLink>
          </p>
          <p>
            Or type <code className="text-sm bg-afa-navy/10 px-1 rounded">/scorekeeper</code> after
            the main site address.
          </p>
        </Step>
        <Step n={2} title="Tap the digits of the PIN">
          <p>Dots appear as you type. Use Del if you miss a digit.</p>
        </Step>
        <Step n={3} title="Tap Go">
          <p>If the PIN is right, you land on Control Center.</p>
        </Step>
        <Figure
          src="/guide/assets/pin-go.png"
          alt="Scorekeeper PIN pad"
          caption="Enter PIN, then tap Go"
        />
        <Callout tone="warn" title="Keep the PIN private">
          Do not post it on Facebook or paper posters. Text it only to directors.
        </Callout>
      </Section>

      <Section id="control" eyebrow="Directors" title="Control Center">
        <p className="text-[15px] text-afa-ink/75">
          After the PIN, you always start here.
        </p>
        <Step n={1} title="Tournaments (game day home base)">
          <p>Dates, fees, divisions, scores, who signed up. Start here to score games.</p>
        </Step>
        <Step n={2} title="Teams">
          <p>Every team and which events they entered.</p>
        </Step>
        <Step n={3} title="Players">
          <p>Players and managers. Signatures and directory.</p>
        </Step>
        <Figure
          src="/guide/assets/05-control-phone.png"
          alt="Control Center"
          caption="Almost always open Tournaments first"
        />
      </Section>

      <Section id="tournament" eyebrow="Directors" title="Open a tournament & division">
        <Step n={1} title="Tap Tournaments on Control Center">
          <p>Opens the list of events.</p>
        </Step>
        <Step n={2} title="Find your event">
          <p>Names and dates are in the table.</p>
        </Step>
        <Step n={3} title="Tap the row to open it">
          <p>Use the triangle on the left of the tournament name.</p>
        </Step>
        <Step n={4} title="Find the division">
          <p>Example: All — Pool Play, Gold, Coed D.</p>
        </Step>
        <Step n={5} title="Tap Scores">
          <p>Main game-day button for results and brackets.</p>
        </Step>
        <div className="rounded-xl border border-afa-navy/10 bg-afa-navy/[0.04] px-4 py-3 text-[15px]">
          <p className="font-bold text-afa-navy mb-2">What the buttons mean</p>
          <ul className="space-y-1.5 text-afa-ink/80">
            <li>
              <strong className="text-afa-navy">Teams</strong> — who is entered
            </li>
            <li>
              <strong className="text-afa-navy">Matchups</strong> — build pools / brackets
            </li>
            <li>
              <strong className="text-afa-red">Scores</strong> — enter results
            </li>
          </ul>
        </div>
        <Figure
          src="/guide/assets/heat-scores.png"
          alt="Division Scores buttons"
          caption="Use Scores on the right of each division row"
        />
      </Section>

      <Section id="scores" eyebrow="Directors" title="Enter a score">
        <p className="text-[15px] text-afa-ink/75">
          Same idea for pool games and bracket games.
        </p>
        <Step n={1} title="Open Scores">
          <p>From the division row, or you may already be on the division page.</p>
        </Step>
        <Step n={2} title="Find the game">
          <p>Team names on left and right. Field and time help match the diamond.</p>
        </Step>
        <Step n={3} title="Type the two scores">
          <p>Boxes sit between the teams — like a scoreboard.</p>
        </Step>
        <Step n={4} title="Tap Save">
          <p>Only when both numbers are correct. Later games update after you save.</p>
        </Step>
        <Figure
          src="/guide/assets/gold-scores.png"
          alt="Score list"
          caption="Type both sides, then Save"
        />
        <Callout tone="warn" title="Mistake?">
          Use <strong>Clear</strong> on that game, then enter the correct score.
          Wrong scores can move later games — fix ASAP.
        </Callout>
      </Section>

      <Section id="brackets" eyebrow="Directors" title="Make & run a bracket">
        <p className="text-[15px] text-afa-ink/75 leading-relaxed">
          When a division builds its own bracket. Do the steps{" "}
          <strong>in order</strong>.
        </p>
        <div className="rounded-xl border-2 border-afa-navy/15 bg-afa-navy/[0.03] px-4 py-3">
          <p className="font-bold text-afa-navy text-[15px]">The order</p>
          <p className="mt-1 text-[15px] text-afa-ink/80">
            Seeds → Format → Generate → Drawing → Scores
          </p>
        </div>

        <div className="space-y-4">
          <article className="rounded-xl border border-afa-navy/12 p-4 sm:p-5">
            <Step n={1} title="Set the seeds">
              <p>
                Put teams in order <strong>#1, #2, #3…</strong> (#1 is strongest).
              </p>
            </Step>
          </article>
          <article className="rounded-xl border border-afa-navy/12 p-4 sm:p-5">
            <Step n={2} title="Pick the format">
              <p>Choose one:</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                <li className="rounded-lg bg-afa-navy px-3 py-1.5 text-sm font-bold text-white">
                  3GG
                </li>
                <li className="rounded-lg bg-afa-navy/70 px-3 py-1.5 text-sm font-bold text-white">
                  Double elim
                </li>
                <li className="rounded-lg bg-afa-navy/70 px-3 py-1.5 text-sm font-bold text-white">
                  Double elim + consol
                </li>
              </ul>
            </Step>
          </article>
          <article className="rounded-xl border border-afa-navy/12 p-4 sm:p-5">
            <Step n={3} title="Generate the bracket">
              <p>
                Tap <strong>Generate</strong>. If one exists:{" "}
                <strong>Clear &amp; generate</strong> rebuilds from scratch.
              </p>
            </Step>
            <Callout tone="warn" title="Careful">
              Clear &amp; generate wipes the current bracket. Only before live
              games — or when you mean to start over.
            </Callout>
          </article>
          <article className="rounded-xl border border-afa-navy/12 p-4 sm:p-5">
            <Step n={4} title="Check the drawing">
              <p>Full bracket picture. Confirm first-round matchups before scoring.</p>
            </Step>
          </article>
          <article className="rounded-xl border border-afa-navy/12 p-4 sm:p-5">
            <Step n={5} title="Score the games">
              <p>Scroll to the list under the drawing. Save after each final score.</p>
            </Step>
          </article>
        </div>

        <div className="rounded-xl border border-afa-navy/10 p-4">
          <p className="font-bold text-afa-navy text-[15px] mb-1">
            Pool play vs Bracket tabs
          </p>
          <p className="text-[15px] text-afa-ink/80 leading-relaxed">
            Some divisions show <strong>Pool play</strong> and{" "}
            <strong>Bracket</strong>. Score pool games on Pool play. Open Bracket
            when you are ready for the elimination chart.
          </p>
        </div>
        <Figure
          src="/guide/assets/07-division-desk.png"
          alt="Division with Pool play and Bracket"
          caption="Pool play and Bracket are stages on the same division page"
        />
      </Section>

      <Section id="checklist" eyebrow="Keep this" title="Checklists">
        <div className="space-y-6">
          <div>
            <h3 className="font-bold text-afa-navy text-lg mb-2">Managers — registration day</h3>
            <ul className="space-y-2 text-[15px] text-afa-ink/90">
              {[
                "Open Register (or Register on the tournament page)",
                "Tournament → Team → Manager → Players → Coaches → Sign & Submit",
                "Copy team link → paste in team chat for waivers",
                "Copy manage link → save privately (do not share in chat)",
                "Confirm players open the team link and sign",
              ].map((item) => (
                <li key={item} className="flex gap-3 items-start">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-afa-navy/40" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-afa-navy text-lg mb-2">Directors — game day</h3>
            <ul className="space-y-2 text-[15px] text-afa-ink/90">
              {[
                "Open Scorekeeper and enter PIN",
                "Control Center → Tournaments",
                "Open today's event (tap the triangle)",
                "Open the right division → Scores",
                "Enter each final score → Save",
                "If needed: seeds → format → Generate",
                "Fix mistakes with Clear + re-enter",
              ].map((item) => (
                <li key={item} className="flex gap-3 items-start">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded border-2 border-afa-navy/40" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl bg-afa-navy px-5 py-6 text-white">
          <h3 className="text-xl font-bold">Stuck?</h3>
          <p className="mt-2 text-[15px] text-white/90 leading-relaxed">
            Call or text the person who sent you this guide.
          </p>
          <p className="mt-2 text-[15px] text-white/80 leading-relaxed">
            Have ready: which tournament, who you are (manager or director), and
            what you were trying to do.
          </p>
          <div className="mt-5 border-t border-white/20 pt-4 space-y-1.5 text-sm">
            <p className="text-white/60 font-bold uppercase tracking-wide text-xs">
              Links
            </p>
            <p>
              Home:{" "}
              <a href={SITE} className="text-red-200 break-all font-semibold">
                {SITE}/
              </a>
            </p>
            <p>
              Register:{" "}
              <a href={REGISTER} className="text-red-200 break-all font-semibold">
                {REGISTER}
              </a>
            </p>
            <p>
              Scorekeeper:{" "}
              <a href={SK} className="text-red-200 break-all font-semibold">
                {SK}
              </a>
            </p>
            <p className="text-white/55 pt-1">
              PIN is not on this page. Directors keep it in a private text.
            </p>
          </div>
        </div>
      </Section>

      <p className="text-center text-sm text-afa-ink/50 pt-2">
        AFA Southern Utah · Site guide
      </p>
    </div>
  );
}
