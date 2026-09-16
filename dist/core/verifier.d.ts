import type { ProjectType } from '../types/index.js';
export interface VerificationResult {
    passed: boolean;
    results: CommandResult[];
    summary: string;
}
interface CommandResult {
    command: string;
    exitCode: number;
    output: string;
    passed: boolean;
}
/**
 * Run the project's verification commands (analyze, test, build).
 * Stops at the first failure.
 */
export declare function verify(projectType: ProjectType, cwd?: string): VerificationResult;
export {};
//# sourceMappingURL=verifier.d.ts.map