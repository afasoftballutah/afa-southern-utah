"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Perspective poster deck for the home page.
 * Always shows up to 5 slots: … | -2 | -1 | center | +1 | +2 | …
 * Infinite wrap. Center full color; sides desaturated.
 * Click side poster → rotate to center. Click center → that tournament.
 * Finished posters: black Completed tag + champion stamps (G/S/B, O/D/E/R, U/L).
 * Upcoming: neon lime tag.
 * Multi-gender: W / M / Coed tabs, gold (champ) per division only.
 */

const SWIPE_MIN = 40;

/** Horizontal swipe / drag → step(-1 | 1). Vertical scroll stays the page's. */
function useSwipe(onStep) {
  const origin = useRef(null);
  const swiped = useRef(false);

  return useMemo(
    () => ({
      onPointerDown(e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (e.target?.closest?.("a, button, input, select, textarea, label")) return;
        origin.current = { x: e.clientX, y: e.clientY };
        swiped.current = false;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* capture is optional */
        }
      },
      onPointerUp(e) {
        const start = origin.current;
        origin.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
        swiped.current = true;
        onStep(dx < 0 ? 1 : -1);
      },
      onPointerCancel() {
        origin.current = null;
      },
      onClickCapture(e) {
        if (!swiped.current) return;
        e.preventDefault();
        e.stopPropagation();
        swiped.current = false;
      },
    }),
    [onStep]
  );
}

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

  const router = useRouter();
  const [center, setCenter] = useState(initial);
  // Gender tab selection per slide id (so rotating away doesn't reset all)
  const [tabBySlide, setTabBySlide] = useState({});

  // Region switch / new slide list → snap to that region’s next tournament
  useEffect(() => {
    setCenter(initial);
  }, [initial, resetKey]);

  const step = useCallback(
    (dir) => {
      if (n < 1) return;
      setCenter((c) => (c + dir + n) % n);
    },
    [n]
  );

  const swipe = useSwipe(step);

  // Side posters rotate in. The selected poster is the tournament.
  const onSlotClick = useCallback(
    (i, isCenter, e) => {
      const t = e?.target;
      if (t && typeof t.closest === "function") {
        if (t.closest("a, button, input, select, textarea, label")) return;
      }
      if (!isCenter) {
        setCenter(i);
        return;
      }
      const slug = slides[i]?.slug;
      if (slug) router.push(`/tournaments/${slug}`);
    },
    [slides, router]
  );

  useEffect(() => {
    function onKey(e) {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable) {
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
  }, [step]);

  if (n === 0) return null;

  return (
    <section className="poster-deck" aria-label="Season flyers">
      <div className="poster-deck__frame">
        <div className="poster-deck__stage" {...swipe}>
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
                onClick={(e) => onSlotClick(i, isCenter, e)}
                role="button"
                tabIndex={pos === "hide" ? -1 : 0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSlotClick(i, isCenter, e);
                  }
                }}
                aria-label={
                  isCenter ? `${slide.name} — open tournament` : `Show ${slide.name}`
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
        <img src={slide.posterUrl} alt="" draggable={false} />
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
