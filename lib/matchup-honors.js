// Medal and italic place for a matchup pill on a team page (and any other
// MatchupCard). Championship medals replace 1st/2nd text. 3rd gets bronze
// plus the place. Other determined finishes are the italic place only.

export function pillHonors({ championship, decided, won, place }) {
  if (championship && decided) {
    return { medal: won ? "gold" : "silver", place: null };
  }
  if (place === "3rd") return { medal: "bronze", place };
  return { medal: null, place: place ?? null };
}
