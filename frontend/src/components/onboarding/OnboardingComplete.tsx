"use client";

import { useRouter } from "next/navigation";
import { OnboardingFlow } from "./OnboardingFlow";

export function OnboardingComplete() {
  const router = useRouter();
  return (
    <OnboardingFlow
      onComplete={() => {
        router.push("/dashboard");
        router.refresh();
      }}
    />
  );
}
