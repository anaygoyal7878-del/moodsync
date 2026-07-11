import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/marketing/AuthForm";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
        <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
      </Link>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
