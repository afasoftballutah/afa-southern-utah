// When an open page fetches fresh data (JD, 2026-11-09: "it should only
// update when open or refreshed", "when opened").
//
// Opening or reloading the page renders it on the server with current
// data; nothing polls, nothing subscribes, no timers. The one extra
// fetch: coming back to a tab that sat hidden for more than a minute
// (a phone app switch) counts as opening it again, so the page refreshes
// once, the same router.refresh() the director screens use after an edit.
export const RETURN_REFRESH_AFTER_MS = 60_000;

/** Refresh on becoming visible again? Only after more than a minute away. */
export function shouldRefreshOnReturn(hiddenAt, now, afterMs = RETURN_REFRESH_AFTER_MS) {
  if (hiddenAt == null || !Number.isFinite(hiddenAt) || !Number.isFinite(now)) return false;
  return now - hiddenAt > afterMs;
}
