import Link from "next/link";
import { getPublicClient, isSupabaseConfigured } from "@/lib/supabase";
import { REGION_LABEL } from "@/lib/data";
import { isRegistrationOpen } from "@/lib/tournament-state";
import RegistrationForm from "@/components/RegistrationForm";

export const revalidate = 30;

export const metadata = { title: "Register a Team — AFA Southern Utah" };

async function getRegisterableTournaments() {
  if (!isSupabaseConfigured()) return [];
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, slug, name, start_date, end_date, registration_closes, region, is_placeholder, status, divisions(id, name, display_name, sort_order, parent_division_id)"
    )
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default async function RegisterPage() {
  const tournaments = await getRegisterableTournaments();
  // Derived from dates, never from `tournaments.status` — nothing writes that
  // column, so it said "upcoming" for the Heat Stroker three days after it
  // ended and this page offered it. See isRegistrationOpen.
  // Wrapped, not passed by reference — Array.filter hands the index as the
  // second argument, which would land in `now` and reset the clock to 1970.
  const registerable = tournaments.filter((t) => isRegistrationOpen(t));

  return (
    <div className="space-y-4">
      <h1 className="t-title">Register a Team</h1>
      {registerable.length === 0 ? (
        <div className="form-surface p-6 text-center space-y-3">
          <p className="t-strong">Nothing on the calendar yet — check back.</p>
          <p className="t-meta">
            Registration opens once the next tournament is posted.
          </p>
          <Link href="/tournaments" className="btn-transient">
            Tournaments
          </Link>
        </div>
      ) : (
        <RegistrationForm tournaments={registerable} regionLabel={REGION_LABEL} />
      )}
    </div>
  );
}
