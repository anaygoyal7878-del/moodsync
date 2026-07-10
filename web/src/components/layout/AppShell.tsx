import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FlaskConical, Bluetooth } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/devices', label: 'Devices', icon: Bluetooth },
  { to: '/library', label: 'Scent Library', icon: FlaskConical },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
            <span className="text-[15px] font-semibold tracking-tight">MoodSync</span>
          </div>
          <nav className="hidden gap-1 sm:flex" aria-label="Primary">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-surface-raised text-ink' : 'text-ink-secondary hover:text-ink',
                  )
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-28 pt-6 sm:pb-10">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-canvas/95 py-2 backdrop-blur-md sm:hidden"
        aria-label="Primary"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                isActive ? 'text-brand' : 'text-ink-muted',
              )
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
