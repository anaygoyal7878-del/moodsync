/** A user-facing override that lets anyone force the dashboard shell to
 * render as "mobile" or "web" regardless of their real viewport width —
 * for showing both layouts from a single link without resizing the
 * window (useful for a reviewer/demo audience on desktop who wants to
 * see the phone experience too). `null` means "no override, use the
 * real CSS `sm:` breakpoint" — still the default for everyone who
 * hasn't touched the switcher.
 *
 * Originally a dev-only debug affordance (hence the previous name,
 * platformPreview.ts) gated off in production; promoted to a real,
 * permanent, always-on feature so it's visible on the published
 * deployment. See components/shell/ViewModeSwitcher.tsx for the control
 * and components/shell/ViewModeContext.tsx for where the override is
 * read by Sidebar/LuxuryTopNavBar/LuxuryBottomNav. */
export type ViewMode = "mobile" | "web" | null;

export const VIEW_MODE_STORAGE_KEY = "moodsync-view-mode";
