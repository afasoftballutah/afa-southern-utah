// Poster — the poster component with the default-eagle law (component
// grammar, phase 1). A poster-less tournament shows the ripped eagle and
// looks intentional, never broken (afa-product-plan.md).

export default function Poster({ posterUrl, name, className = "" }) {
  if (posterUrl) {
    return (
      <div className={["poster-frame", className].filter(Boolean).join(" ")}>
        <img src={posterUrl} alt={`${name} poster`} />
      </div>
    );
  }

  return (
    <div
      className={[
        "overflow-hidden rounded-lg border border-afa-navy/15",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <img
        src="/afa-mascot.jpg"
        alt=""
        aria-hidden="true"
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}
