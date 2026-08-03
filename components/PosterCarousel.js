"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

/**
 * Perspective poster deck for the home page.
 * Always shows up to 5 slots: … | -2 | -1 | center | +1 | +2 | …
 * Infinite wrap. Center full color; sides desaturated.
 * Click side poster → rotate to center. Click center → lightbox; backdrop/Esc closes.
 * Finished posters: black Completed tag + champion stamps (G/S/B, O/D/E/R, U/L).
 * Upcoming: neon lime tag.
 * Multi-gender: W / M / Coed tabs, gold (champ) per division only.
 */

function wrapDelta(i, center, n) {
  let d = i - center;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

export default function PosterCarousel({ slides = [], /** Force remount center when region changes */ resetKey = "" }) {
  const n = slides.length;
  // Slides are ordered next-first; first non-finished is the next tournament.
  const initial = useMemo(() => {
    const i = slides.findIndex((s) => !s.finished);
    return i >= 0 ? i : 0;
  }, [slides]);

  const [center, setCenter] = useState(initial);
  // Gender tab selection per slide id (so rotating away doesn't reset all)
  const [tabBySlide, setTabBySlide] = useState({});
  const [lightboxId, setLightboxId] = useState(null);

  // Region switch / new slide list → snap to that region’s next tournament
  useEffect(() => {
    setCenter(initial);
    setLightboxId(null);
  }, [initial, resetKey]);

  // Advance carousel; when lightbox is open, keep it on the new center poster.
  const step = useCallback(
    (dir) => {
      if (n < 1) return;
      setCenter((c) => {
        const next = (c + dir + n) % n;
        setLightboxId((open) => (open != null ? slides[next]?.id ?? null : open));
        return next;
      });
    },
    [n, slides]
  );

  const closeLightbox = useCallback(() => setLightboxId(null), []);

  // Side (gray) posters only rotate into center; only the featured center can open.
  const onSlotClick = useCallback(
    (i, isCenter) => {
      if (!isCenter) {
        setCenter(i);
        return;
      }
      setLightboxId(slides[i]?.id ?? null);
    },
    [slides]
  );

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape" && lightboxId != null) {
        e.preventDefault();
        closeLightbox();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, lightboxId, closeLightbox]);

  // Lock page scroll while lightbox is open
  useEffect(() => {
    if (lightboxId == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightboxId]);

  if (n === 0) return null;

  const lightboxSlide =
    lightboxId != null ? slides.find((s) => s.id === lightboxId) : null;

  return (
    <section className="poster-deck" aria-label="Season flyers">
      <div className="poster-deck__frame">
        <div className="poster-deck__stage">
          <button
            type="button"
            className="poster-deck__edge poster-deck__edge--prev"
            onClick={() => step(-1)}
            aria-label="Previous flyer"
          >
            ‹
          </button>
          <button
            type="button"
            className="poster-deck__edge poster-deck__edge--next"
            onClick={() => step(1)}
            aria-label="Next flyer"
          >
            ›
          </button>
          {slides.map((slide, i) => {
            const delta = wrapDelta(i, center, n);
            const pos = delta < -2 || delta > 2 ? "hide" : String(delta);
            const isCenter = delta === 0;
            return (
              <div
                key={slide.id}
                className={"poster-deck__slot" + (isCenter ? " is-center" : "")}
                data-pos={pos}
                onClick={() => onSlotClick(i, isCenter)}
                role="button"
                tabIndex={pos === "hide" ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSlotClick(i, isCenter);
                  }
                }}
                aria-label={
                  isCenter ? `${slide.name} — open poster` : `Show ${slide.name}`
                }
                aria-current={isCenter ? "true" : undefined}
              >
                <PosterCard
                  slide={slide}
                  active={isCenter}
                  activeTab={tabBySlide[slide.id]}
                  onTab={(g) =>
                    setTabBySlide((prev) => ({ ...prev, [slide.id]: g }))
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {lightboxSlide && (
        <div
          className="poster-deck__lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxSlide.name}
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="poster-deck__edge poster-deck__edge--prev poster-deck__edge--lightbox"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            aria-label="Previous flyer"
          >
            ‹
          </button>
          <button
            type="button"
            className="poster-deck__edge poster-deck__edge--next poster-deck__edge--lightbox"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            aria-label="Next flyer"
          >
            ›
          </button>
          <div
            className="poster-deck__lightbox-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="poster-deck__lightbox-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxSlide.posterUrl}
                alt={lightboxSlide.name}
                className="poster-deck__lightbox-img"
              />
              {lightboxSlide.finished ? (
                <span className="poster-deck__done">Completed</span>
              ) : (
                <span className="poster-deck__done poster-deck__done--upcoming">
                  Upcoming
                </span>
              )}
            </div>
            <div className="poster-deck__lightbox-meta">
              <p className="poster-deck__lightbox-name">{lightboxSlide.name}</p>
              <p className="poster-deck__lightbox-sub">
                {[lightboxSlide.when, lightboxSlide.where].filter(Boolean).join(" · ")}
              </p>
              <div className="poster-deck__lightbox-actions">
                {lightboxSlide.registerHref ? (
                  lightboxSlide.externalRegister ? (
                    <a
                      href={lightboxSlide.registerHref}
                      className="poster-deck__lightbox-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Register
                    </a>
                  ) : (
                    <Link
                      href={lightboxSlide.registerHref}
                      className="poster-deck__lightbox-btn"
                    >
                      Register
                    </Link>
                  )
                ) : null}
                {lightboxSlide.slug && (
                  <Link
                    href={`/tournaments/${lightboxSlide.slug}`}
                    className="poster-deck__lightbox-btn poster-deck__lightbox-btn--ghost"
                  >
                    Tournament
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PosterCard({ slide, active, activeTab, onTab }) {
  const groups = slide.championGroups ?? null;
  const genders = groups
    ? ["w", "m", "c"].filter((g) => (groups[g] ?? []).length > 0)
    : [];
  const multi = genders.length > 1;
  const tab = multi
    ? genders.includes(activeTab)
      ? activeTab
      : genders[0]
    : genders[0] ?? null;
  const rows = multi
    ? groups?.[tab] ?? []
    : genders.length === 1
      ? groups[genders[0]]
      : slide.champions ?? [];
  // Side cards: name + date only. Featured: name + date · venue.
  const sub = active
    ? [slide.when, slide.where].filter(Boolean).join(" · ")
    : slide.when || "";

  return (
    <div className={"poster-deck__card" + (active ? " is-active" : "")}>
      <div className="poster-deck__poster">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.posterUrl} alt="" />
        {slide.finished ? (
          <span className="poster-deck__done">Completed</span>
        ) : (
          <span className="poster-deck__done poster-deck__done--upcoming">Upcoming</span>
        )}

        {slide.finished && rows.length > 0 && (
          <div
            className={"poster-deck__champ" + (multi ? " poster-deck__champ--tabs" : "")}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="poster-deck__champ-title">Champions</div>
            {multi && (
              <div className="poster-deck__tabs" role="tablist">
                {genders.map((g) => (
                  <button
                    key={g}
                    type="button"
                    role="tab"
                    aria-selected={tab === g}
                    className={tab === g ? "on" : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTab?.(g);
                    }}
                  >
                    {g === "w" ? "W" : g === "m" ? "M" : "Coed"}
                  </button>
                ))}
              </div>
            )}
            <div className="poster-deck__champ-list">
              {rows.map((r, idx) => (
                <div key={`${r.code}-${r.team}-${idx}`} className="poster-deck__champ-row">
                  <span
                    className={
                      "poster-deck__code" +
                      (r.tint ? ` poster-deck__code--${r.tint}` : "")
                    }
                  >
                    {r.code}
                  </span>
                  <span className="poster-deck__team">{r.team}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!slide.finished && (
          <div className="poster-deck__cta" onClick={(e) => e.stopPropagation()}>
            <span className="poster-deck__cta-when">{slide.when}</span>
            {slide.registerHref ? (
              slide.externalRegister ? (
                <a
                  href={slide.registerHref}
                  className="poster-deck__cta-btn"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Register
                </a>
              ) : (
                <Link href={slide.registerHref} className="poster-deck__cta-btn">
                  Register
                </Link>
              )
            ) : slide.slug ? (
              <Link href={`/tournaments/${slide.slug}`} className="poster-deck__cta-btn">
                Details
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {/* Caption under this card — travels with the slot transform */}
      <div className="poster-deck__caption">
        <span className="poster-deck__caption-name">{slide.name}</span>
        {sub ? <span className="poster-deck__caption-sub">{sub}</span> : null}
      </div>
    </div>
  );
}
