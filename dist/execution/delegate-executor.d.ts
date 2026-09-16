import type { PhaseRoute, PhaseResult } from '../types/index.js';
import type { IExecutor } from './executor.js';
export declare class DelegateExecutor implements IExecutor {
    run(route: PhaseRoute, brief: string, _runDir: string): Promise<PhaseResult>;
}
//# sourceMappingURL=delegate-executor.d.ts.map