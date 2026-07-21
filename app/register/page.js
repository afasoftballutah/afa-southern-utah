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
      <h1 className="text-2xl font-black text-afa-navy">Register a Team</h1>
      {registerable.length === 0 ? (
        <div className="bg-white rounded-lg shadow border border-afa-navy/10 p-6 text-center space-y-2">
          <p className="font-semibold text-afa-navy">
            Registration opens once the next tournament is posted.
          </p>
          <p className="text-sm text-afa-ink/70">
            Check back soon, or contact a tournament director from the{" "}
            <Link href="/tournaments" className="underline">
              Tournaments
            </Link>{" "}
            page.
          </p>
        </div>
      ) : (
        <RegistrationForm tournaments={registerable} />
      )}
    </div>
  );
}
