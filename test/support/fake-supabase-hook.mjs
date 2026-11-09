// Test-only: point "@/lib/supabase" at an in-memory fake so the real
// propagate.js runs end to end without a database.
import { pathToFileURL } from "node:url";
import path from "node:path";
const FAKE = pathToFileURL(path.join(import.meta.dirname, "fake-supabase.mjs")).href;
export function resolve(specifier, context, next) {
  if (specifier === "@/lib/supabase") return { url: FAKE, shortCircuit: true };
  return next(specifier, context);
}
