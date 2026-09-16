import type { TaskSize, ClassificationResult } from '../types/index.js';
/**
 * Fast heuristic classification — no agent call required.
 * Returns an initial estimate based on keyword matching.
 */
export declare function initialClassify(task: string): TaskSize;
interface PlannerRecommendation {
    recommended_size: TaskSize;
    reason: string;
}
/**
 * Extract the reclassification JSON block that the Planner is asked to include
 * at the end of its plan output.
 *
 * Expected format inside the planner output:
 * ```json
 * {"recommended_size": "large", "reason": "..."}
 * ```
 */
export declare function extractPlannerRecommendation(planOutput: string): PlannerRecommendation | null;
/**
 * Apply planner recommendation to produce a final ClassificationResult.
 */
export declare function applyReclassification(initial: TaskSize, plannerOutput: string): ClassificationResult;
/**
 * Full classification pipeline:
 * 1. Initial heuristic
 * 2. (optional) apply planner reclassification after plan is available
 */
export declare function classify(task: string): ClassificationResult;
export {};
//# sourceMappingURL=classifier.d.ts.map