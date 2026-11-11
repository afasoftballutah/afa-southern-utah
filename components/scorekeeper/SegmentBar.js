"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/**
 * iOS-style segmented slider: one rounded track, a sliding highlight
 * behind the selected option. The track scrolls sideways when the
 * options don't fit.
 */
export default function SegmentBar({ value, options = [], onChange, "aria-label": ariaLabel }) {
  const trackRef = useRef(null);
  const btnRefs = useRef([]);
  const [thumb, setThumb] = useState(null);

  const measure = useCallback(() => {
    const track = trackRef.current;
    const i = options.findIndex((o) => o.key === value);
    const btn = btnRefs.current[i];
    if (!track || !btn) return;
    setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;
    if (left < viewLeft) track.scrollTo({ left, behavior: "smooth" });
    else if (right > viewRight) track.scrollTo({ left: right - track.clientWidth, behavior: "smooth" });
  }, [options, value]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(measure);
    ro.observe(track);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  if (options.length === 0) return null;

  return (
    <div className="sk-segment" role="listbox" aria-label={ariaLabel} ref={trackRef}>
      <div className="sk-segment__inner">
        {thumb ? (
          <span
            className="sk-segment__thumb"
            style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width }}
            aria-hidden="true"
          />
        ) : null}
        {options.map((opt, i) => {
          const on = opt.key === value;
          return (
            <button
              key={opt.key}
              type="button"
              role="option"
              aria-selected={on}
              ref={(el) => {
                btnRefs.current[i] = el;
              }}
              className={"sk-segment__opt" + (on ? " is-on" : "")}
              onClick={() => onChange?.(opt.key)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
