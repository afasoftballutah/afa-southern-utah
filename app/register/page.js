import Link from "next/link";
import { getPublicClient } from "@/lib/supabase";
import RegistrationForm from "@/components/RegistrationForm";

export const revalidate = 30;

export const metadata = { title: "Register a Team — AFA Southern Utah" };

async function getRegisterableTournaments() {
  const supabase = getPublicClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, slug, name, start_date, is_placeholder, divisions(id, name, sort_order)")
    .order("start_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export default async function RegisterPage() {
  const tournaments = await getRegisterableTournaments();
  const registerable = tournaments.filter((t) => !t.is_placeholder);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-afa-navy">Register a Team</h1>
      {registerable.length === 0 ? (
        <div className="chalk-panel text-center space-y-2 py-6">
          <p className="font-semibold text-afa-navy">
            Nothing on the calendar yet — check back.
          </p>
          <p className="text-sm text-afa-ink/70">
            Registration opens once the next tournament is posted. See{" "}
            <Link href="/tournaments" className="underline text-afa-navy">
              Tournaments
            </Link>{" "}
            for last year&rsquo;s lineup as a reference.
          </p>
        </div>
      ) : (
        <RegistrationForm tournaments={registerable} />
      )}
    </div>
  );
}
