import type { PhaseRoute, TaskSize, BudgetMode, UserConfig } from '../types/index.js';
/**
 * Try to detect the current agent's model from common environment variables.
 * Falls back to 'unknown'.
 */
export declare function detectCurrentModel(): string;
export interface RouterOptions {
    size: TaskSize;
    budget: BudgetMode;
    useDelegate: boolean;
    allowMax: boolean;
    userConfig?: UserConfig;
}
export declare function buildRoutingTable(opts: RouterOptions): PhaseRoute[];
export declare function getAgentRole(currentModel: string): "full-orchestrator" | "partial-orchestrator" | "coordinator-only";
//# sourceMappingURL=router.d.ts.map