"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  getRegionPrefSnapshot,
  getRegionPrefServerSnapshot,
  regionPrefLabel,
  subscribeRegionPref,
} from "@/lib/region-pref";

/** Compact header chip when a region filter is active. */
export default function RegionPrefBadge() {
  const selected = useSyncExternalStore(
    subscribeRegionPref,
    getRegionPrefSnapshot,
    getRegionPrefServerSnapshot
  );
  if (!selected) return null;
  return (
    <Link
      href="/#region-map"
      className="site-nav__region"
      title="Change region filter"
    >
      {regionPrefLabel(selected)}
    </Link>
  );
}
