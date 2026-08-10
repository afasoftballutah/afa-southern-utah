import { redirect } from "next/navigation";

// Everything a tournament has lives inside its row on the list now (JD,
// 2026-07-28: "once it is added, it should be selectable from a list with all
// the divisions etc inside that list"). Old links still work; they just land
// on the one page that has it.
export default async function TournamentRedirect({ params }) {
  await params;
  redirect("/director/tournaments");
}
