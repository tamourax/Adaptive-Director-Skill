import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import yaml from 'js-yaml';
// ─── Delegate-skills config paths ─────────────────────────────────────────────
// delegate-skills stores its fleet config in:
//   global: ~/.delegate/fleet.yaml  (or delegate-fleet.v1 key inside)
//   project: <cwd>/.delegate/fleet.yaml
const GLOBAL_DELEGATE_PATH = join(homedir(), '.delegate', 'fleet.yaml');
const PROJECT_DELEGATE_PATH = join(process.cwd(), '.delegate', 'fleet.yaml');
// ─── Loader ───────────────────────────────────────────────────────────────────
function readFleet(path) {
    if (!existsSync(path))
        return [];
    try {
        const raw = readFileSync(path, 'utf8');
        const fleet = yaml.load(raw);
        const lanes = fleet?.lanes ?? {};
        return Object.entries(lanes).map(([name, cfg]) => ({
            name,
            agent: cfg.implementer,
            model: cfg.model,
            effort: cfg.effort,
        }));
    }
    catch {
        return [];
    }
}
/**
 * Load fleet lanes from delegate-skills config.
 * Project config overlays global config (same-name lanes override).
 */
export function loadDelegateFleet() {
    const global = readFleet(GLOBAL_DELEGATE_PATH);
    const project = readFleet(PROJECT_DELEGATE_PATH);
    // Project lanes override global lanes with the same name
    const map = new Map();
    for (const lane of global)
        map.set(lane.name, lane);
    for (const lane of project)
        map.set(lane.name, lane);
    return [...map.values()];
}
/**
 * Check if delegate-skills is installed and configured.
 */
export function isDelegateAvailable() {
    return existsSync(GLOBAL_DELEGATE_PATH) || existsSync(PROJECT_DELEGATE_PATH);
}
/**
 * Find a fleet lane by name.
 */
export function findLane(name) {
    return loadDelegateFleet().find((l) => l.name === name) ?? null;
}
/**
 * Find the best lane for a given role (e.g. 'feature' for implement, 'tests' etc.)
 * Simple heuristic: prefers lanes whose name contains the role keyword.
 */
export function findLaneForRole(role) {
    const lanes = loadDelegateFleet();
    return (lanes.find((l) => l.name.toLowerCase().includes(role.toLowerCase())) ??
        lanes[0] ??
        null);
}
//# sourceMappingURL=delegate.js.map