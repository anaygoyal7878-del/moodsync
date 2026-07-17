import { redirect } from "next/navigation";
import { getAccessToken } from "@/lib/session";
import { OnboardingComplete } from "@/components/onboarding/OnboardingComplete";

export default async function OnboardingPage() {
  const accessToken = await getAccessToken();
  if (!accessToken) redirect("/login");

  return <OnboardingComplete />;
}
