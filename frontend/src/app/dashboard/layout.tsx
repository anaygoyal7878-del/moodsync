import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { TimezoneSync } from "@/components/dashboard/TimezoneSync";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { BottomTabBar } from "@/components/dashboard/BottomTabBar";

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

/** Shared across every /dashboard/* route: auth gate + the persistent
 * app shell. Two navigation components, each hidden by CSS on the
 * viewport it doesn't own — Sidebar.tsx (`hidden sm:flex`, a fixed left
 * rail) on desktop, BottomTabBar.tsx (`sm:hidden`, a fixed iOS-style tab
 * bar) on mobile — rather than one component trying to be both shapes.
 * Each page below only fetches and renders its own feature's data. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-1 flex-col sm:flex-row">
      <TimezoneSync serverTimezone={user.timezone} />
      <Sidebar email={user.email} />
      <main className="flex-1 overflow-x-hidden px-4 py-8 pb-24 sm:px-8 sm:py-10 sm:pb-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">{children}</div>
      </main>
      <BottomTabBar />
    </div>
  );
}
