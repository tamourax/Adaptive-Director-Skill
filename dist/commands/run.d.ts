import type { BudgetMode } from '../types/index.js';
export interface RunOptions {
    task: string;
    budget: BudgetMode;
    useDelegate: boolean;
    allowMax: boolean;
    dryRun: boolean;
}
export declare function run(opts: RunOptions): Promise<void>;
//# sourceMappingURL=run.d.ts.map