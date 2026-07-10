import { useMemo, useState } from 'react';
import { PawPrint, Search } from 'lucide-react';
import { scentLibrary } from '../data/scentLibrary';
import { ScentCard } from '../components/library/ScentCard';
import { ScentDetailDrawer } from '../components/library/ScentDetailDrawer';
import type { ScentProfile } from '../types/domain';

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ScentProfile | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scentLibrary;
    return scentLibrary.filter(
      (scent) =>
        scent.name.toLowerCase().includes(q) ||
        scent.family.toLowerCase().includes(q) ||
        scent.primaryEffects.some((effect) => effect.toLowerCase().includes(q)),
    );
  }, [query]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scent library</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Every entry links back to the specific research it's based on — including where that research is thin.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl2 border border-state-focus/30 bg-state-focus/10 p-3.5">
        <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-state-focus" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-ink-secondary">
          Some essential oils are unsafe for pets, especially cats, even from diffuser vapor alone. Check the safety
          notes on each scent before diffusing around animals.
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or effect"
          aria-label="Search scent library"
          className="w-full rounded-full border border-line bg-surface py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-line-strong"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((scent) => (
          <ScentCard key={scent.id} scent={scent} onSelect={() => setSelected(scent)} />
        ))}
      </div>

      {filtered.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">No scents match “{query}”</p>}

      <ScentDetailDrawer scent={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
