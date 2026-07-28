// The control center is wider than the public site.
//
// JD, 2026-07-27: "we need to get this to one line. should we use a slightly
// wider page?" Yes — the public pages are read on a phone at a ballpark and
// stay narrow; these are eight-column tables and one-line forms read at a
// desk, and 56rem was forcing both to wrap.
//
// The width lives on <main> in the root layout, which is OUTSIDE this one, so
// it is set through a variable rather than a class. Scoped to /scorekeeper by
// virtue of this file existing only here.
export default function ScorekeeperLayout({ children }) {
  return (
    <>
      <style>{`:root { --page-width: 84rem; }`}</style>
      {children}
    </>
  );
}
