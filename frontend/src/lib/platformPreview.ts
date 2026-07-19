/** Dev-only override that lets a developer force the dashboard shell to
 * render as "mobile" or "web" regardless of the real viewport width —
 * for comparing the two layouts side by side without resizing the
 * window. `null` means "no override, use the real CSS `sm:` breakpoint"
 * — the only behavior that ever ships to production. Gated by
 * `DEV_PLATFORM_PREVIEW_ENABLED` (see below) so the switcher UI itself
 * never renders outside development, even if this module is imported.
 *
 * Deliberately temporary: everything this feature touches is additive
 * (a new context, a new floating switcher, a few `mode &&` branches in
 * existing nav components) — removing it is deleting
 * components/dev/PlatformPreview* and reverting those branches, not
 * unwinding a redesign.
 */
export type PlatformPreviewMode = "mobile" | "web" | null;

export const PLATFORM_PREVIEW_STORAGE_KEY = "moodsync-dev-platform-preview";

/** `NODE_ENV` is set by the Next.js build itself (not a `.env` value a
 * deployment could accidentally leave on) — `next build`/`next start`
 * always run as "production", so this is off by construction outside
 * `next dev`. */
export const DEV_PLATFORM_PREVIEW_ENABLED = process.env.NODE_ENV !== "production";
