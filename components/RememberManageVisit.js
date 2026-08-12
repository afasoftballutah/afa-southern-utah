"use client";

import { useEffect } from "react";
import { rememberRegistration } from "@/lib/my-registrations";
import { writeMe } from "@/lib/me";

/** When a manager opens /register/manage/[token], remember it on this device. */
export default function RememberManageVisit({
  teamName,
  tournamentName,
  tournamentSlug,
  manageToken,
  rosterToken,
  genderKey,
  genderLabel,
  levelLabel,
  seatLabel,
}) {
  useEffect(() => {
    if (!manageToken || !teamName) return;
    rememberRegistration({
      teamName,
      tournamentName,
      tournamentSlug,
      manageToken,
      rosterToken,
      genderKey,
      genderLabel,
      levelLabel,
      seatLabel,
    });
    writeMe({ teamName, source: "picked" });
  }, [
    teamName,
    tournamentName,
    tournamentSlug,
    manageToken,
    rosterToken,
    genderKey,
    genderLabel,
    levelLabel,
    seatLabel,
  ]);

  return null;
}
