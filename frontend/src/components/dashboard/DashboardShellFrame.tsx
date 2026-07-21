"use client";

import type { ReactNode } from "react";
import clsx from "clsx";
import { ViewModeProvider, useViewMode } from "@/components/shell/ViewModeContext";
import { ViewModeSwitcher } from "@/components/shell/ViewModeSwitcher";

/** Client-side layout wrapper for DashboardShell.tsx — split out so the
 * `sm:` breakpoint classes on the outer flex row / content column /
 * `<main>` can be overridden by the view-mode switcher (see
 * lib/viewMode.ts), the same way Sidebar/LuxuryTopNavBar/
 * LuxuryBottomNav already are. `sidebar`/`topNav`/`bottomNav`/`children`
 * arrive pre-rendered from the server-component DashboardShell — a
 * Server Component's output can be passed as a Client Component's
 * `children`/props without becoming client itself, so this boundary
 * doesn't cost the rest of the dashboard its server rendering. */
export function DashboardShellFrame({
  sidebar,
  topNav,
  bottomNav,
  children,
}: {
  sidebar: ReactNode;
  topNav: ReactNode;
  bottomNav: ReactNode;
  children: ReactNode;
}) {
  return (
    <ViewModeProvider>
      <ShellLayout sidebar={sidebar} topNav={topNav} bottomNav={bottomNav}>
        {children}
      </ShellLayout>
    </ViewModeProvider>
  );
}

function ShellLayout({
  sidebar,
  topNav,
  bottomNav,
  children,
}: {
  sidebar: ReactNode;
  topNav: ReactNode;
  bottomNav: ReactNode;
  children: ReactNode;
}) {
  const { mode } = useViewMode();

  return (
    // ViewModeSwitcher sits in normal flow above the sidebar/content
    // row, not as a floating overlay — a fixed-position pill here
    // previously sat on top of LuxuryTopNavBar's greeting text on
    // narrow viewports. Being in-flow costs one row of height instead.
    <div className="ms-luxury flex min-h-screen w-full flex-1 flex-col">
      <ViewModeSwitcher />
      <div
        className={clsx(
          "flex w-full flex-1",
          mode === "web" && "flex-row",
          mode === "mobile" && "flex-col",
          mode === null && "sm:flex-row",
        )}
      >
        {sidebar}
        <div
          className={clsx(
            "flex min-h-screen flex-1 flex-col",
            mode === "web" && "h-screen overflow-y-auto",
            mode === null && "sm:h-screen sm:overflow-y-auto",
          )}
        >
          {topNav}
          <main
            className={clsx(
              "relative flex-1 overflow-x-hidden px-5 pt-5 pb-6",
              mode === "web" && "mx-auto w-full max-w-3xl px-8 pt-10 pb-10",
              mode === null && "sm:mx-auto sm:w-full sm:max-w-3xl sm:px-8 sm:pt-10 sm:pb-10",
            )}
          >
            {children}
          </main>
          {bottomNav}
        </div>
      </div>
    </div>
  );
}
