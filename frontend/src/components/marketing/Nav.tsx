import Link from "next/link";
import { Button } from "@/components/ui/Button";

export function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-ink-secondary sm:flex" aria-label="Primary">
          <Link href="#features" className="hover:text-ink">
            Features
          </Link>
          <Link href="#integrations" className="hover:text-ink">
            Integrations
          </Link>
          <Link href="#pricing" className="hover:text-ink">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-ink-secondary hover:text-ink">
            Log in
          </Link>
          <Link href="/signup">
            <Button variant="primary">Get started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
