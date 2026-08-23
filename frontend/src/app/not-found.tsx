import { Compass } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/LinkButton";

/**
 * Real branded 404 — Next.js renders this for any URL that matches no
 * route, at any depth. Before this file existed, a mistyped or stale
 * link fell through to Next's generic "404 | This page could not be
 * found" screen instead of something that gets a lost user back into
 * the product.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-1 flex-col items-center justify-center px-6 py-16">
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <Compass size={24} className="text-ink-secondary" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">This page doesn&apos;t exist</p>
        <p className="max-w-sm text-sm text-ink-secondary">
          The link might be old, or the address was mistyped. Let&apos;s get you back to somewhere real.
        </p>
        <LinkButton href="/" variant="secondary" className="mt-2">
          Go home
        </LinkButton>
      </Card>
    </div>
  );
}
