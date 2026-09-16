import { existsSync } from 'node:fs';
import { join } from 'node:path';
// ─── Detection ────────────────────────────────────────────────────────────────
/**
 * Detect the project type by looking for well-known marker files.
 * Checks from `cwd` upward (one level) to handle monorepos where the
 * root may be slightly above the workspace.
 */
export function detectProjectType(cwd = process.cwd()) {
    if (has(cwd, 'pubspec.yaml'))
        return 'flutter';
    if (has(cwd, 'package.json'))
        return 'node';
    if (has(cwd, 'composer.json'))
        return 'laravel';
    if (has(cwd, 'pyproject.toml') || has(cwd, 'setup.py') || has(cwd, 'requirements.txt'))
        return 'python';
    return 'unknown';
}
function has(dir, filename) {
    return existsSync(join(dir, filename));
}
// ─── Verification commands ────────────────────────────────────────────────────
/**
 * Commands to run during the Verify phase, keyed by project type.
 * Each command is run sequentially; the first failure stops verification.
 */
export const VERIFY_COMMANDS = {
    flutter: ['flutter analyze', 'flutter test'],
    node: ['npm test', 'npm run build'],
    laravel: ['php artisan test'],
    python: ['pytest'],
    unknown: [],
};
/**
 * Return the verification commands for a given project type,
 * filtering out commands whose executable doesn't exist on PATH
 * (best-effort — avoids crashing when e.g. flutter isn't installed globally).
 */
export function getVerifyCommands(type) {
    return VERIFY_COMMANDS[type];
}
//# sourceMappingURL=project.js.map