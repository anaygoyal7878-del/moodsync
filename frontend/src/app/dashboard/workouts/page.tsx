import { backendFetch } from "@/lib/api";
import { Dumbbell, Bell } from "lucide-react";
import { PageHeader, Section, EmptyState } from "@/components/companion/CompanionPrimitives";
import { WorkoutPlanner } from "@/components/dashboard/workouts/WorkoutPlanner";
import type { WorkoutListResponse } from "@/lib/types";

/**
 * Workouts — what you plan to do, and the reminder that knows what your
 * body is doing.
 *
 * The planner is the whole page rather than one card among several,
 * because an unentered workout produces no reminder: everything else
 * here depends on someone actually filling this in, so nothing competes
 * with it for attention.
 *
 * The note about reminders is deliberately concrete about *what makes
 * them different from a calendar alert* — that a morning with low
 * recovery changes what the reminder says. Someone who thinks this is a
 * to-do list will not bother; someone who knows it argues with the plan
 * might.
 */
export default async function WorkoutsPage() {
  const result = await backendFetch<WorkoutListResponse>("/api/workouts");
  const data = result.ok ? result.data : null;

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Workouts" subtitle="Plan it, and MoodSync reminds you." />
        <EmptyState icon={Dumbbell} title="Couldn't load your workouts" body="Try again in a moment." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Workouts" subtitle="Plan it, and MoodSync reminds you." />

      <div className="lux-stagger-1">
        <Section title="Your plan" subtitle="What's coming up." icon={Dumbbell}>
          <WorkoutPlanner today={data.today} workouts={data.workouts} />
        </Section>
      </div>

      <div className="lux-stagger-2">
        <Section title="How reminders work" icon={Bell}>
          <ul className="flex flex-col gap-2 text-[13px] leading-snug" style={{ color: "var(--lux-muted)" }}>
            <li>
              · Untimed sessions arrive together in one morning note, so a day you described in one sentence doesn&apos;t
              become three notifications.
            </li>
            <li>· A session with a time gets its own reminder 90 minutes ahead — room to eat, change, or move it.</li>
            <li>
              · When your recovery signals are down, the reminder says so and offers the easier version. It never tells
              you to skip: MoodSync reads heart rate and sleep, not injury.
            </li>
            <li>· Reminders land in your notification inbox. Each workout is reminded once, even if the plan changes.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
