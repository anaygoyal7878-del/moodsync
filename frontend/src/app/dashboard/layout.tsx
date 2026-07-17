import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { LogoutButton } from "@/components/marketing/LogoutButton";
import { TimezoneSync } from "@/components/dashboard/TimezoneSync";
import { DashboardDock } from "@/components/dashboard/DashboardDock";

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

/** Shared across every /dashboard/* route: auth gate, header, and the
 * bottom dock nav — each page below only fetches and renders its own
 * feature's data (see dashboard/page.tsx for the index of pages). */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-8 px-6 py-12 pb-28 sm:py-16 sm:pb-28">
      <TimezoneSync serverTimezone={user.timezone} />
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-ink-secondary sm:inline">{user.email}</span>
          <LogoutButton />
        </div>
      </header>

      {children}

      <DashboardDock />
    </div>
  );
}
