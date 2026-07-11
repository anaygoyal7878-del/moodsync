import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/marketing/LogoutButton";

interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

async function fetchCurrentUser(): Promise<MeResponse | null> {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  const response = await fetch(`${BACKEND_API_URL}/api/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.json();
}

/**
 * Placeholder proving the auth wiring works end to end — the real
 * dashboard (connected devices, biometrics, automation history,
 * recommendations) is Milestone 6, built against this same session
 * pattern once there's real data to show.
 */
export default async function DashboardPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <LogoutButton />
      </div>

      <Card raised>
        <p className="text-xs uppercase tracking-wide text-ink-muted">Signed in as</p>
        <p className="mt-1 text-lg font-semibold">{user.email}</p>
        <p className="mt-4 text-sm leading-relaxed text-ink-secondary">
          This confirms the signup/login/session flow is wired end to end against the real backend. The
          full dashboard — connected devices, today&apos;s biometrics, automation history, recommendations
          — lands in Milestone 6, built against real WHOOP and Hue data rather than sample data.
        </p>
      </Card>
    </div>
  );
}
