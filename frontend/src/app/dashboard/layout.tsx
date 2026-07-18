import { redirect } from "next/navigation";
import { BACKEND_API_URL } from "@/lib/env";
import { getAccessToken } from "@/lib/session";
import { TimezoneSync } from "@/components/dashboard/TimezoneSync";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

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
 * app shell. DashboardShell picks between two chrome systems by
 * pathname — see its own doc comment for why. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchCurrentUser();
  if (!user) redirect("/login");

  return (
    <>
      <TimezoneSync serverTimezone={user.timezone} />
      <DashboardShell email={user.email} displayName={user.displayName}>
        {children}
      </DashboardShell>
    </>
  );
}
