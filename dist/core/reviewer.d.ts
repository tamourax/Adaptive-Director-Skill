import type { PhaseResult, Finding } from '../types/index.js';
export interface ReviewAnalysis {
    hasCritical: boolean;
    hasWarning: boolean;
    findings: Finding[];
    criticals: Finding[];
    warnings: Finding[];
    suggestions: Finding[];
    summary: string;
}
/**
 * Analyse a completed review phase result.
 * The findings may come from:
 *   a) The structured JSON (review.json) — preferred
 *   b) Parsed from the text summary — fallback
 */
export declare function analyseReview(result: PhaseResult): ReviewAnalysis;
//# sourceMappingURL=reviewer.d.ts.map