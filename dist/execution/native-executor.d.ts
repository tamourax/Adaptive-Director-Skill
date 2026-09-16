import type { PhaseRoute, PhaseResult } from '../types/index.js';
import type { IExecutor } from './executor.js';
export declare class NativeExecutor implements IExecutor {
    run(route: PhaseRoute, brief: string, _runDir: string): Promise<PhaseResult>;
}
//# sourceMappingURL=native-executor.d.ts.map