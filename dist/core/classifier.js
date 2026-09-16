// ─── Heuristics ───────────────────────────────────────────────────────────────
const LARGE_PATTERNS = [
    /architect/i,
    /refactor/i,
    /migration/i,
    /auth(entication|orization)?\s+system/i,
    /payment\s+(system|architecture)/i,
    /multi.?module/i,
    /cross.?platform/i,
    /full.?stack/i,
    /rewrite/i,
];
const SMALL_PATTERNS = [
    /rename/i,
    /fix\s+typo/i,
    /update\s+text/i,
    /minor\s+(fix|change|update)/i,
    /change\s+(color|label|button)/i,
    /correct\s+spelling/i,
];
/**
 * Fast heuristic classification — no agent call required.
 * Returns an initial estimate based on keyword matching.
 */
export function initialClassify(task) {
    if (LARGE_PATTERNS.some((p) => p.test(task)))
        return 'large';
    if (SMALL_PATTERNS.some((p) => p.test(task)))
        return 'small';
    return 'medium';
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
export function extractPlannerRecommendation(planOutput) {
    // Match a JSON block inside ```json ... ``` or a bare JSON object on a line
    const jsonBlockMatch = planOutput.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    const raw = jsonBlockMatch
        ? jsonBlockMatch[1]
        : planOutput.match(/\{"recommended_size"[\s\S]*?\}/)?.[0];
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        if ((parsed.recommended_size === 'small' ||
            parsed.recommended_size === 'medium' ||
            parsed.recommended_size === 'large') &&
            typeof parsed.reason === 'string') {
            return { recommended_size: parsed.recommended_size, reason: parsed.reason };
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Apply planner recommendation to produce a final ClassificationResult.
 */
export function applyReclassification(initial, plannerOutput) {
    const recommendation = extractPlannerRecommendation(plannerOutput);
    if (recommendation && recommendation.recommended_size !== initial) {
        return {
            size: recommendation.recommended_size,
            source: 'planner',
            reclassified: true,
            reason: recommendation.reason,
        };
    }
    return {
        size: initial,
        source: recommendation ? 'planner' : 'heuristic',
        reclassified: false,
    };
}
/**
 * Full classification pipeline:
 * 1. Initial heuristic
 * 2. (optional) apply planner reclassification after plan is available
 */
export function classify(task) {
    const size = initialClassify(task);
    return { size, source: 'heuristic', reclassified: false };
}
//# sourceMappingURL=classifier.js.map