import { getSeasonListByRegion, withArchiveSummaries } from "@/lib/data";
import TournamentBrowser from "@/components/TournamentBrowser";

export const revalidate = 30;

export const metadata = { title: "Tournaments — AFA Southern Utah" };

export default async function TournamentsPage() {
  const groups = await withArchiveSummaries(await getSeasonListByRegion());

  return (
    <div className="space-y-8">
      <h1 className="t-title">Tournaments</h1>
      <TournamentBrowser groups={groups} />
    </div>
  );
}
