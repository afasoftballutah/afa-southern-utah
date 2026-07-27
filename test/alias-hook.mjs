// Teach node's ESM loader the "@/" alias that Next resolves via jsconfig.
//
// Without this, a test can rewrite the file it imports directly but not that
// file's own imports — lib/elimination.js pulls in lib/tournament-state.js,
// which pulls in lib/bracket/if-game.js, and the rewrite stops at the first
// hop. A resolve hook applies the whole way down, and lets a test import
// "@/lib/elimination" exactly as the app does.
import { pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const withExt = /\.[cm]?jsx?$/.test(rel) ? rel : `${rel}.js`;
    return next(pathToFileURL(path.join(ROOT, withExt)).href, context);
  }
  return next(specifier, context);
}
