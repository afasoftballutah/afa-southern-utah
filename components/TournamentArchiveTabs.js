import Link from "next/link";

/**
 * Compact Current / Archive switch for director and scorekeeper lists.
 * No counts, no explainer text.
 */
export default function TournamentArchiveTabs({
  archive = false,
  currentHref,
  archiveHref,
}) {
  return (
    <div className="seg-view" role="tablist" aria-label="Tournament list">
      <Link
        href={currentHref}
        role="tab"
        aria-selected={!archive}
        className={archive ? "btn-transient" : "btn-info"}
      >
        Current
      </Link>
      <Link
        href={archiveHref}
        role="tab"
        aria-selected={!!archive}
        className={archive ? "btn-info" : "btn-transient"}
      >
        Archive
      </Link>
    </div>
  );
}
