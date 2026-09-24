import { LuxuryFocusSession } from "@/components/luxury/LuxuryFocusSession";
import { HeartRateAnalytics } from "@/components/dashboard/focus/HeartRateAnalytics";

/** The timer leads; heart-rate analytics sit beneath it, so the page
 * opens on the thing you came to do and the context is one scroll away. */
export default function FocusSessionPage() {
  return (
    <div className="flex flex-col gap-5">
      <LuxuryFocusSession />
      <HeartRateAnalytics />
    </div>
  );
}
