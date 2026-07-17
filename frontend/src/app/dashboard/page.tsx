import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Link2, Activity, Sparkles, TrendingUp, Cpu, Zap, Bell, Wand2, CalendarClock } from "lucide-react";

const SECTIONS = [
  { href: "/dashboard/connections", label: "Connections", description: "Wearables and smart home providers.", icon: Link2 },
  { href: "/dashboard/biometrics", label: "Biometrics", description: "Today's readings and trend charts.", icon: Activity },
  { href: "/dashboard/wellness", label: "Wellness", description: "Computed stress, recovery, sleep scores.", icon: Sparkles },
  { href: "/dashboard/recommendations", label: "Recommendations", description: "Automations MoodSync suggests for you.", icon: Wand2 },
  { href: "/dashboard/insights", label: "Insights", description: "Trends and automation effectiveness.", icon: TrendingUp },
  { href: "/dashboard/devices", label: "Devices", description: "Synced smart home devices.", icon: Cpu },
  { href: "/dashboard/weekly-report", label: "Weekly report", description: "Your automatic weekly summary.", icon: CalendarClock },
  { href: "/dashboard/automation", label: "Automations", description: "Rules and their firing history.", icon: Zap },
  { href: "/dashboard/notifications", label: "Notifications", description: "History and delivery preferences.", icon: Bell },
];

export default function DashboardIndexPage() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SECTIONS.map((section) => (
        <Link key={section.href} href={section.href}>
          <Card
            raised
            className="flex h-full items-start gap-3 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-brand">
              <section.icon size={16} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium">{section.label}</p>
              <p className="mt-0.5 text-xs text-ink-secondary">{section.description}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
