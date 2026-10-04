/**
 * Route-change transition for every /dashboard/* page.
 *
 * A template (unlike a layout) remounts on each navigation, so the
 * entrance animation replays per page instead of once per session. The
 * animation is plain CSS rather than a motion component: it runs before
 * hydration, and `animation-fill-mode: backwards` means no transform is
 * left on this wrapper once it settles — a lingering transform would
 * make it the containing block for any `position: fixed` descendant and
 * quietly pin page modals to the wrapper instead of the viewport.
 */
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="lux-page-enter">{children}</div>;
}
