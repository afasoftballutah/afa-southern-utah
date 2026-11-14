import { test } from "node:test";
import assert from "node:assert/strict";
import { attachTournamentsToGames } from "@/lib/team-page";

test("attachTournamentsToGames joins a tournament fetched once onto each game row", () => {
  const worlds = {
    id: "t1",
    name: "AFA World Series",
    slug: "2026-afa-world-series",
    start_date: "2026-11-13",
    end_date: "2026-11-15",
    status: "upcoming",
    timezone: "America/Los_Angeles",
  };
  const games = [
    {
      id: "g1",
      division_id: "d1",
      divisions: {
        id: "d1",
        name: "Men's D",
        tournament_id: "t1",
      },
    },
    {
      id: "g2",
      division_id: "d-missing",
      divisions: {
        id: "d-missing",
        name: "Ghost",
        tournament_id: "missing",
      },
    },
    { id: "g3", division_id: "d1" },
  ];
  attachTournamentsToGames(games, new Map([["t1", worlds]]));
  assert.equal(games[0].divisions.tournaments, worlds);
  assert.equal(games[0].divisions.id, "d1");
  assert.equal(games[1].divisions.tournaments, undefined);
  assert.equal(games[2].divisions, undefined);
});
