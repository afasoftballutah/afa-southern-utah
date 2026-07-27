// Fixture helpers. Real data captured from the Heat Stroker and from
// QuickScores, so the tests assert against games that actually happened
// rather than against invented ones.
import { readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "fixtures");

export const fixture = (name) => readFile(path.join(DIR, name), "utf8");
export const json = async (name) => JSON.parse(await fixture(name));
