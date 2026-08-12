import Link from "next/link";
import {
  getPublicClient,
  getServiceClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { REGION_LABEL, isRealPoster } from "@/lib/data";
import { isRegistrationOpen } from "@/lib/tournament-state";
import { loadKnownPlayers } from "@/lib/known-players";
import RegistrationForm from "@/components/RegistrationForm";
import RegisterBack from "@/components/RegisterBack";
import MyRegistrations from "@/components/MyRegistrations";
import { getActiveWaiver } from "@/lib/site-docs";

export const dynamic = "force-dynamic";

export const metadata = { title: "Register a Team — AFA Southern Utah" };

async function getRegisterableTournaments() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, slug, name, start_date, end_date, registration_closes, registration_url, registration_note, region, is_placeholder, status, poster_url, divisions(id, name, display_name, sort_order, parent_division_id, gender, class_id)"
    )
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default async function RegisterPage({ searchParams }) {
  const tournaments = await getRegisterableTournaments();
  // Open by date AND has a real event poster. Events without flyers stay
  // in the DB but are not offered for public registration yet.
  // Wrapped, not passed by reference — Array.filter hands the index as the
  // second argument, which would land in `now` and reset the clock to 1970.
  const registerable = tournaments.filter(
    (t) => isRegistrationOpen(t) && isRealPoster(t)
  );

  // Directory for manager pick-lists (service role — not public).
  let knownPlayers = [];
  if (isSupabaseConfigured() && registerable.length > 0) {
    try {
      knownPlayers = await loadKnownPlayers(getServiceClient());
    } catch (err) {
      console.error("register knownPlayers", err);
      knownPlayers = [];
    }
  }

  const params = await searchParams;
  const initialTournamentSlug =
    typeof params?.tournament === "string" ? params.tournament : null;
  const initialDivisionId =
    typeof params?.division === "string" ? params.division : null;

  const waiver = await getActiveWaiver();

  const backHref = initialTournamentSlug
    ? `/tournaments/${encodeURIComponent(initialTournamentSlug)}`
    : "/tournaments";
  const backLabel = initialTournamentSlug ? "Tournament" : "Tournaments";

  return (
    <div className="space-y-4">
      <RegisterBack href={backHref} label={backLabel} />
      <h1 className="t-title">Register a Team</h1>
      {registerable.length === 0 ? (
        <>
          <MyRegistrations />
          <div className="form-surface p-6 text-center space-y-3">
            <p className="t-strong">Nothing open for registration yet — check back.</p>
            <p className="t-meta">
              Registration opens once a tournament flyer is posted. If you already
              registered, look up your team above.
            </p>
            <Link href="/tournaments" className="btn-transient">
              Tournaments
            </Link>
          </div>
        </>
      ) : (
        <RegistrationForm
          tournaments={registerable}
          regionLabel={REGION_LABEL}
          initialTournamentSlug={initialTournamentSlug}
          initialDivisionId={initialDivisionId}
          knownPlayers={knownPlayers}
          releaseText={waiver.text}
        />
      )}
    </div>
  );
}
