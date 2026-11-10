import { slotLabel, NO_SOURCE } from "@/lib/slot-label";

/**
 * Team slot in a list: the team, or "Winner G9" / "Loser G3" while it
 * waits on that game (from a "Winner of Game 9" name or the slot's source
 * link, passed as `from`), or the fallback ("TBD") only when nothing feeds
 * it. One short form on phone and desktop (JD, 2026-11-09) — lib/slot-label.js.
 */
export default function FeedAwareName({ name, from, fallback = NO_SOURCE }) {
  return slotLabel(name, from, fallback);
}
