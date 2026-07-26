"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

const links = [
  { href: "#features", label: "Features" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "/demo", label: "Demo" },
];

export function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
          <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-ink-secondary sm:flex" aria-label="Primary">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 sm:flex">
          <Link href="/login" className="text-sm font-medium text-ink-secondary transition-colors hover:text-ink">
            Log in
          </Link>
          <Link href="/signup">
            <Button variant="primary">Get started</Button>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink sm:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {menuOpen ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>

      <div
        id="mobile-nav"
        className={`grid overflow-hidden border-t border-line transition-[grid-template-rows] duration-300 ease-out sm:hidden ${
          menuOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <nav className="min-h-0" aria-label="Mobile">
          <div className="flex flex-col gap-1 px-6 py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-2 flex items-center gap-3 border-t border-line pt-4">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Log in
              </Link>
              <Link href="/signup" onClick={() => setMenuOpen(false)} className="flex-1">
                <Button variant="primary" className="w-full">
                  Get started
                </Button>
              </Link>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
