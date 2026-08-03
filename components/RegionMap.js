"use client";

import { useSyncExternalStore } from "react";
import {
  REGION_MAP_HOTSPOTS,
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  setRegionPref,
  subscribeRegionPref,
} from "@/lib/region-pref";

/**
 * Brand map over the home hero (compact + transparent).
 * Tap a star to set the site-wide region filter. Tap again / All to clear.
 */
export default function RegionMap({ className = "", compact = false }) {
  const selected = useSyncExternalStore(
    subscribeRegionPref,
    getRegionPrefSnapshot,
    getRegionPrefServerSnapshot
  );

  function choose(region, disabled) {
    if (disabled) return;
    // Second tap on the same region clears the filter
    if (region && selected === region) setRegionPref(null);
    else setRegionPref(region);
  }

  return (
    <section
      className={
        "region-map" +
        (compact ? " region-map--compact" : "") +
        (className ? ` ${className}` : "")
      }
      aria-label="Choose your region"
    >
      <div className="region-map__stage">
        <img
          className="region-map__art"
          src="/brand/region-map-overlay.png"
          alt="AFA region map: Idaho, Nevada, Utah, Colorado, and Arizona"
          width={640}
          height={640}
          draggable={false}
        />
        {REGION_MAP_HOTSPOTS.map((h) => {
          const isOn = h.region && selected === h.region;
          return (
            <button
              key={h.id}
              type="button"
              className={
                "region-map__hot" +
                (isOn ? " is-selected" : "") +
                (h.disabled ? " is-disabled" : "")
              }
              style={{ left: h.left, top: h.top }}
              disabled={h.disabled}
              aria-pressed={isOn || undefined}
              aria-label={
                h.disabled
                  ? `${h.label} — ${h.note || "not available yet"}`
                  : isOn
                    ? `${h.label}, selected — tap again for all regions`
                    : `Filter by ${h.label}`
              }
              title={h.disabled ? h.note || h.label : h.label}
              onClick={() => choose(h.region, h.disabled)}
            >
              {/* Yellow 5-point star, centered on the red star in the art */}
              <svg
                className="region-map__star"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path
                  d="M12 1.8l2.95 7.1 7.65.7-5.8 4.95 1.8 7.45L12 17.7l-6.6 4.3 1.8-7.45-5.8-4.95 7.65-.7L12 1.8z"
                  fill="currentColor"
                />
              </svg>
              <span className="region-map__hot-label">{h.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
