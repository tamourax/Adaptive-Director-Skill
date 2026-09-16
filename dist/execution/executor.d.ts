import type { PhaseRoute, PhaseResult } from '../types/index.js';
export interface IExecutor {
    /**
     * Execute a single phase.
     * @param route   - routing decision (agent, model, effort, execution mode)
     * @param brief   - self-contained task brief for the agent
     * @param runDir  - path to the run workspace (for storing results)
     */
    run(route: PhaseRoute, brief: string, runDir: string): Promise<PhaseResult>;
}
export declare function createExecutor(mode: 'native' | 'delegate'): Promise<IExecutor>;
//# sourceMappingURL=executor.d.ts.map