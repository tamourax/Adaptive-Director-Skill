import type { FleetLane } from '../types/index.js';
/**
 * Load fleet lanes from delegate-skills config.
 * Project config overlays global config (same-name lanes override).
 */
export declare function loadDelegateFleet(): FleetLane[];
/**
 * Check if delegate-skills is installed and configured.
 */
export declare function isDelegateAvailable(): boolean;
/**
 * Find a fleet lane by name.
 */
export declare function findLane(name: string): FleetLane | null;
/**
 * Find the best lane for a given role (e.g. 'feature' for implement, 'tests' etc.)
 * Simple heuristic: prefers lanes whose name contains the role keyword.
 */
export declare function findLaneForRole(role: string): FleetLane | null;
//# sourceMappingURL=delegate.d.ts.map