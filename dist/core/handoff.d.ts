import type { Phase, RunMetadata, PhaseResult, PhaseRoute, TaskSize, BudgetMode } from '../types/index.js';
export declare function generateRunId(): string;
export interface InitRunOptions {
    runId: string;
    task: string;
    size: TaskSize;
    budget: BudgetMode;
    routing: PhaseRoute[];
    allowMax: boolean;
    useDelegate: boolean;
}
export declare function initRun(opts: InitRunOptions): void;
export declare function readMetadata(runId: string): RunMetadata | null;
export declare function updateMetadata(runId: string, patch: Partial<Pick<RunMetadata, 'status' | 'currentPhase'>>): void;
export declare function writePhaseResult(runId: string, result: PhaseResult): void;
export declare function readPhaseResult(runId: string, phase: Phase): PhaseResult | null;
/**
 * Build a self-contained brief for the given phase.
 * Each agent receives only the context it needs — not the full chat history.
 */
export declare function buildBrief(runId: string, phase: Phase): string;
export declare function listRuns(): RunMetadata[];
//# sourceMappingURL=handoff.d.ts.map