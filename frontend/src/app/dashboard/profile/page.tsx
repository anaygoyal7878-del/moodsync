import { backendFetch } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/marketing/LogoutButton";

interface MeResponse {
  email: string;
  displayName: string | null;
  timezone: string;
  createdAt: string;
}

/** Real account details (the same /api/me the dashboard layout's auth
 * gate already calls) — kept minimal since MoodSync doesn't have a
 * profile-editing feature (name/avatar/etc.) built yet. Exists mainly
 * so BottomTabBar.tsx's "Profile" tab (a real destination mobile users
 * expect) points at something real rather than nothing. */
export default async function ProfilePage() {
  const meResult = await backendFetch<MeResponse>("/api/me");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold tracking-tight">Profile</h1>

      {!meResult.ok ? (
        <Card>
          <p className="text-sm text-ink-secondary">Couldn&apos;t load your account details.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 py-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Name</p>
            <p className="mt-0.5 text-sm">{meResult.data.displayName ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Email</p>
            <p className="mt-0.5 text-sm">{meResult.data.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Timezone</p>
            <p className="mt-0.5 text-sm">{meResult.data.timezone}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Member since</p>
            <p className="mt-0.5 text-sm">
              {new Date(meResult.data.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
        </Card>
      )}

      <LogoutButton />
    </div>
  );
}
