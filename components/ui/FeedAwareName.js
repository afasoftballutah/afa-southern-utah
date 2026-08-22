import { compactFeedLabel } from "@/lib/quickscores";

/**
 * Team slot in a list. On a phone, "Winner of Game 1" is too long (and
 * team-name CSS uppercases it into WINNER OF GAME 1). Compact to W-G1 /
 * L-G1 below `sm`; keep the words on desktop.
 */
export default function FeedAwareName({ name, fallback = "TBD" }) {
  if (!name) return fallback;
  const compact = compactFeedLabel(name);
  if (compact === name) return name;
  return (
    <>
      <span className="sm:hidden">{compact}</span>
      <span className="hidden sm:inline">{name}</span>
    </>
  );
}
