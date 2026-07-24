"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/dashboard/music", label: "Home", exact: true },
  { href: "/dashboard/music/search", label: "Search", exact: false },
  { href: "/dashboard/music/library", label: "Library", exact: false },
] as const;

export function MusicNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 border-b border-line pb-2">
      {TABS.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-brand text-ink" : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
