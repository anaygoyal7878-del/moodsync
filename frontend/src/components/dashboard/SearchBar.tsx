"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Mic } from "lucide-react";
import { DASHBOARD_SECTIONS } from "@/lib/dashboardSections";

interface SearchableRule {
  id: string;
  name: string;
}

interface SearchableDevice {
  id: string;
  name: string;
}

/** A real, working search across the three things a dashboard user
 * would actually look for — pages, their own automation rules, and
 * their own connected devices — not a decorative input. Voice search is
 * shown as a disabled affordance rather than a functional feature: no
 * speech-to-text exists anywhere in this codebase, and a mic icon that
 * silently does nothing on tap would be worse than one that's honestly
 * labeled "coming soon." */
export function SearchBar({ rules, devices }: { rules: SearchableRule[]; devices: SearchableDevice[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const pages = DASHBOARD_SECTIONS.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 5);
    const matchedRules = rules.filter((r) => r.name.toLowerCase().includes(q)).slice(0, 5);
    const matchedDevices = devices.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 5);

    return { pages, rules: matchedRules, devices: matchedDevices };
  }, [query, rules, devices]);

  const hasResults = results && (results.pages.length > 0 || results.rules.length > 0 || results.devices.length > 0);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5">
        <Search size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results) {
              const first = results.pages[0] ?? results.rules[0] ?? results.devices[0];
              if (first) go("href" in first ? first.href : `/dashboard/automation`);
            }
          }}
          placeholder="Search devices, scenes, automations…"
          className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
        />
        <button
          type="button"
          disabled
          title="Voice control — coming soon"
          aria-label="Voice search (coming soon)"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted opacity-50"
        >
          <Mic size={15} aria-hidden="true" />
        </button>
      </div>

      {open && query.trim() && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-80 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-2 shadow-[var(--shadow-lg)]">
          {!hasResults ? (
            <p className="px-2 py-3 text-sm text-ink-muted">No matches for &quot;{query}&quot;.</p>
          ) : (
            <>
              {results.pages.length > 0 && (
                <ResultGroup label="Pages">
                  {results.pages.map((p) => (
                    <ResultRow key={p.href} label={p.label} onClick={() => go(p.href)} />
                  ))}
                </ResultGroup>
              )}
              {results.rules.length > 0 && (
                <ResultGroup label="Automations">
                  {results.rules.map((r) => (
                    <ResultRow key={r.id} label={r.name} onClick={() => go("/dashboard/automation")} />
                  ))}
                </ResultGroup>
              )}
              {results.devices.length > 0 && (
                <ResultGroup label="Devices">
                  {results.devices.map((d) => (
                    <ResultRow key={d.id} label={d.name} onClick={() => go("/dashboard/devices")} />
                  ))}
                </ResultGroup>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      {children}
    </div>
  );
}

function ResultRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="block w-full rounded-lg px-2 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-hover"
    >
      {label}
    </button>
  );
}
