// The control center is wider than the public site.
//
// JD, 2026-07-27: "we need to get this to one line. should we use a slightly
// wider page?" Yes — the public pages are read on a phone at a ballpark and
// stay narrow; these are eight-column tables and one-line forms read at a
// desk, and 56rem was forcing both to wrap.
//
// Width is set via .scorekeeper-scope on the stylesheet (no page-local CSS).
export default function DirectorLayout({ children }) {
  return <div className="scorekeeper-scope">{children}</div>;
}
