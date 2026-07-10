/**
 * Background job processes (wearable data sync, decision-engine runs)
 * live here as independently deployable/scalable entrypoints, once the
 * first real wearable integration (WHOOP) exists to sync from — see
 * docs/MILESTONES.md. Deliberately empty in the foundation milestone: a
 * worker with nothing to sync yet is dead code, not infrastructure.
 */
export {};
