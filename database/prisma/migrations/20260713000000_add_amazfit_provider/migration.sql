-- Amazfit (via Zepp Health's "Data Cooperation" partner API at
-- dev.huami.com) — same as GARMIN, added preemptively so no future
-- migration is needed once/if a corporate partnership with Zepp Health
-- is approved. Not yet connectable — see docs/INTEGRATIONS_RESEARCH.md
-- and integrations/amazfit/src/index.ts for why.
ALTER TYPE "WearableProvider" ADD VALUE 'AMAZFIT';
