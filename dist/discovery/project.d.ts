import type { ProjectType } from '../types/index.js';
/**
 * Detect the project type by looking for well-known marker files.
 * Checks from `cwd` upward (one level) to handle monorepos where the
 * root may be slightly above the workspace.
 */
export declare function detectProjectType(cwd?: string): ProjectType;
/**
 * Commands to run during the Verify phase, keyed by project type.
 * Each command is run sequentially; the first failure stops verification.
 */
export declare const VERIFY_COMMANDS: Record<ProjectType, string[]>;
/**
 * Return the verification commands for a given project type,
 * filtering out commands whose executable doesn't exist on PATH
 * (best-effort — avoids crashing when e.g. flutter isn't installed globally).
 */
export declare function getVerifyCommands(type: ProjectType): string[];
//# sourceMappingURL=project.d.ts.map