import type { CapabilityRegistry, CapabilityScore, Phase, PhaseRequirement } from '../types/index.js';
export declare function loadRegistry(): CapabilityRegistry;
/**
 * Get capability score for a model name.
 * Falls back to 'unknown' if the model isn't in the registry.
 */
export declare function getModelScore(modelId: string): CapabilityScore;
/**
 * Get minimum requirements for a phase.
 */
export declare function getPhaseRequirement(phase: Phase): PhaseRequirement;
/**
 * Check if a model meets the minimum requirements for a phase.
 */
export declare function modelMeetsPhase(modelId: string, phase: Phase): boolean;
/**
 * Given the current agent's model, determine its orchestrator role.
 */
export declare function resolveAgentRole(currentModel: string): 'full-orchestrator' | 'partial-orchestrator' | 'coordinator-only';
export declare function _resetRegistry(): void;
//# sourceMappingURL=registry.d.ts.map