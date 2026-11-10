import { getRecentScores } from "@/lib/data";
import ScoreTicker from "@/components/ScoreTicker";

/** Server half of the ticker: this tournament's latest finals, newest first. */
export default async function TournamentTicker({ divisionIds }) {
  let scores = [];
  try {
    scores = await getRecentScores(12, divisionIds ?? []);
  } catch {
    scores = [];
  }
  return <ScoreTicker scores={scores} />;
}
