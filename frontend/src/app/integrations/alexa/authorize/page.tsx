import { redirect } from "next/navigation";
import Link from "next/link";
import { getAccessToken } from "@/lib/session";
import { Card } from "@/components/ui/Card";
import { AlexaConsentForm } from "@/components/dashboard/AlexaConsentForm";

/**
 * The page Amazon's Alexa app opens (in an in-app browser) when a user
 * taps "Link account" for the MoodSync skill — the `authorizationUrl` in
 * integrations/alexa/src/skillManifest.template.json points here, not at
 * the backend directly. It has to be a frontend page, not a backend
 * route: MoodSync's session lives in this app's own httpOnly cookie
 * (see lib/session.ts), which only exists on this origin — see
 * docs/ALEXA_ARCHITECTURE.md §4 for why every other integration's OAuth
 * flow is the reverse of this one.
 */
export default async function AlexaAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const clientId = firstValue(params.client_id);
  const redirectUri = firstValue(params.redirect_uri);
  const scope = firstValue(params.scope) ?? "profile";
  const amazonState = firstValue(params.state);
  const responseType = firstValue(params.response_type);

  if (!clientId || !redirectUri || !amazonState || responseType !== "code") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <Card raised className="w-full max-w-sm text-center">
          <h1 className="text-lg font-semibold">Missing information</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            This page is meant to be opened by the Alexa app during account linking, not visited directly.
          </p>
        </Card>
      </div>
    );
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    const currentUrl = new URL("/integrations/alexa/authorize", "https://placeholder.local");
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") currentUrl.searchParams.set(key, value);
    }
    redirect(`/login?returnTo=${encodeURIComponent(currentUrl.pathname + currentUrl.search)}`);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
      </Link>
      <Card raised className="w-full max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight">Allow Alexa to access MoodSync?</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Amazon Alexa wants to link to your MoodSync account so you can check your status, get your sleep
          summary, and trigger your automation rules by voice. MoodSync only shares enough to identify you here
          — nothing else about your account is sent to Amazon.
        </p>
        <AlexaConsentForm clientId={clientId} redirectUri={redirectUri} scope={scope} amazonState={amazonState} />
      </Card>
    </div>
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
