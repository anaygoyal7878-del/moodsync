"use client";

import { useState } from "react";
import { MoodCheckInGrid } from "./MoodCheckInGrid";
import { AffectInsights } from "./AffectInsights";
import { RecentMoodCheckIns } from "./RecentMoodCheckIns";

/**
 * Owns the reload key that ties the three mood pieces together: logging
 * a check-in should immediately show up in the recent list and (once
 * enough exist) shift the learned model, without the grid needing to
 * know either of those components exist.
 */
export function MoodCheckInSection() {
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="space-y-4">
      <MoodCheckInGrid onSaved={() => setReloadKey((k) => k + 1)} />
      <AffectInsights reloadKey={reloadKey} />
      <RecentMoodCheckIns reloadKey={reloadKey} />
    </div>
  );
}
