import { test } from "node:test";
import assert from "node:assert/strict";
import { json } from "./load.mjs";
import { deriveChampionLines, capChampionLines } from "@/lib/archive";
import { isTournamentFinished } from "@/lib/tournament-state";

function tournamentFromFixtures(gold, silver, bronze) {
  return {
    id: "heat",
    divisions: [
      {
        id: "coed",
        name: "Coed",
        display_name: "Coed",
        sort_order: 10,
        parent_division_id: null,
        games: [],
        pool_games: [],
      },
      {
        id: "gold",
        name: "Gold",
        display_name: "Gold",
        sort_order: 25,
        parent_division_id: "coed",
        games: gold.map((g) => ({ ...g, division_id: "gold" })),
        pool_games: [],
      },
      {
        id: "silver",
        name: "Silver",
        display_name: "Silver",
        sort_order: 35,
        parent_division_id: "coed",
        games: silver.map((g) => ({ ...g, division_id: "silver" })),
        pool_games: [],
      },
      {
        id: "bronze",
        name: "Bronze",
        display_name: "Bronze",
        sort_order: 45,
        parent_division_id: "coed",
        games: bronze.map((g) => ({ ...g, division_id: "bronze" })),
        pool_games: [],
      },
    ],
  };
}

const gold = await json("games-gold.json");
const silver = await json("games-silver.json");
const bronze = await json("games-bronze.json");
const heat = tournamentFromFixtures(gold, silver, bronze);

test("Heat Stroker is finished and produces three champion lines in sort_order", () => {
  assert.equal(isTournamentFinished(heat), true);
  const lines = deriveChampionLines(heat);
  assert.deepEqual(
    lines.map((l) => [l.team, l.divisionName]),
    [
      ["Backwards K", "Gold"],
      ["GWZ", "Silver"],
      ["Ball Busters", "Bronze"],
    ]
  );
});

test("champion lines cap at three with a leftover count", () => {
  const many = [
    { team: "A", divisionName: "One", sortOrder: 1 },
    { team: "B", divisionName: "Two", sortOrder: 2 },
    { team: "C", divisionName: "Three", sortOrder: 3 },
    { team: "D", divisionName: "Four", sortOrder: 4 },
  ];
  const { lines, more } = capChampionLines(many, 3);
  assert.equal(lines.length, 3);
  assert.equal(more, 1);
  assert.equal(lines[0].team, "A");
});

test("unfinished tournament yields no champion lines", () => {
  const pending = {
    ...heat,
    divisions: heat.divisions.map((d) =>
      d.id !== "gold"
        ? d
        : {
            ...d,
            games: d.games.map((g) =>
              g.round === 16
                ? { ...g, status: "pending", team1_score: null, team2_score: null }
                : g
            ),
          }
    ),
  };
  assert.equal(isTournamentFinished(pending), false);
  assert.deepEqual(deriveChampionLines(pending), []);
});

test("group division with no games is skipped — only brackets that crown a champion", () => {
  const lines = deriveChampionLines(heat);
  assert.equal(lines.some((l) => l.divisionName === "Coed"), false);
});
