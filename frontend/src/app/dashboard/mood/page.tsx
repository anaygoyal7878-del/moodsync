import { MoodCheckInSection } from "@/components/companion/MoodCheckInSection";

/**
 * The label collection screen — see docs/AFFECT_MODEL_ARCHITECTURE.md.
 *
 * Everything MoodSync has ever claimed about biometrics and mood before
 * this screen existed came from hand-written rules, never checked
 * against how anyone actually felt. This page is where that check
 * starts: a five-second self-report, and (once there are enough of
 * them) what MoodSync has actually learned from comparing them to your
 * own readings.
 */
export default function MoodPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
      <h1 className="text-2xl font-medium" style={{ color: "var(--lux-ink)" }}>
        Mood check-ins
      </h1>
      <p className="mb-8 mt-1 text-sm" style={{ color: "var(--lux-muted)" }}>
        MoodSync doesn’t know how you feel — only what your body is doing. Check in and it can start
        learning whether those two things actually line up for you.
      </p>
      <MoodCheckInSection />
    </div>
  );
}
