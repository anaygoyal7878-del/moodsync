import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { TimezoneSync } from "@/components/dashboard/TimezoneSync";
import { Sidebar } from "@/components/dashboard/Sidebar";

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
 * app shell (a fixed left sidebar on desktop, a horizontal strip on
 * narrow viewports — see Sidebar.tsx) — each page below only fetches and
 * renders its own feature's data. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-1 flex-col sm:flex-row">
      <TimezoneSync serverTimezone={user.timezone} />
      <Sidebar email={user.email} />
      <main className="flex-1 overflow-x-hidden px-4 py-8 sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">{children}</div>
      </main>
    </div>
  );
}
