import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The frontend workspace previously had no test setup at all — no config
 * and no `test` script — so `npm test` (which runs each workspace's own
 * script `--if-present`) silently skipped it entirely. Any test file
 * written here would never have run.
 *
 * Two things are needed that the other workspaces don't need, which is
 * why they get by with a bare `vitest run` and no config:
 *
 * - **The `@/` alias.** Next resolves it from tsconfig `paths`; Vitest
 *   does not read those, so without this every `@/lib/...` import fails
 *   to resolve at test time.
 * - **A DOM.** These are React components; `jsdom` is what lets them
 *   render and receive events at all.
 */
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // Stubs the handful of DOM APIs jsdom doesn't implement — see the
    // setup file for why these belong there and not in the components.
    setupFiles: ["./vitest.setup.ts"],
    // Scoped to this workspace's own sources so a root-level run can't
    // pull in another package's tests through the shared node_modules.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
