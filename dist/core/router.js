import { env } from 'node:process';
import { getModelScore, modelMeetsPhase, resolveAgentRole } from './registry.js';
import { findLaneForRole } from '../discovery/delegate.js';
import { discoverAgents } from '../discovery/agents.js';
// ─── Effort tables ────────────────────────────────────────────────────────────
const EFFORT_TABLE = {
    conservative: {
        plan: 'medium',
        implement: 'medium',
        review: 'high',
        fix: 'medium',
        verify: 'medium',
    },
    balanced: {
        plan: 'high',
        implement: 'medium',
        review: 'high',
        fix: 'medium',
        verify: 'medium',
    },
    quality: {
        plan: 'high',
        implement: 'medium',
        review: 'high',
        fix: 'medium',
        verify: 'high',
    },
};
// ─── Phase lists per task size ────────────────────────────────────────────────
const PHASE_MAP = {
    small: ['implement', 'review'],
    medium: ['plan', 'implement', 'review', 'verify'],
    large: ['plan', 'implement', 'review', 'fix', 'verify'],
};
// ─── Current model detection ──────────────────────────────────────────────────
/**
 * Try to detect the current agent's model from common environment variables.
 * Falls back to 'unknown'.
 */
export function detectCurrentModel() {
    return (env['ANTHROPIC_MODEL'] ??
        env['OPENAI_MODEL'] ??
        env['GEMINI_MODEL'] ??
        env['ADAPTIVE_CURRENT_MODEL'] ??
        'unknown');
}
function resolveAgent(opts) {
    const { phase, useDelegate, userConfig } = opts;
    // 1. User explicit override
    const override = userConfig?.agentOverrides?.[phase];
    if (override) {
        return { agent: override, execution: 'native' };
    }
    // 2. Delegate lane preference (only when --delegate is on)
    if (useDelegate) {
        const lane = findLaneForRole(phase);
        if (lane) {
            return { agent: lane.agent, execution: 'delegate' };
        }
    }
    // 3. Built-in registry: pick best available agent that meets phase requirements
    const agents = discoverAgents().filter((a) => a.available && a.executable);
    const current = detectCurrentModel();
    // Prefer agents that meet the phase requirement, ranked by phase-relevant score
    const capable = agents
        .map((a) => {
        // Map agent id to a representative model for scoring purposes
        const modelId = a.id === 'claude' ? (env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-5')
            : a.id === 'codex' ? 'codex-default'
                : a.id === 'agy' ? (env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-5')
                    : a.id === 'gemini' ? 'gemini-2-5-pro'
                        : 'unknown';
        return { agentId: a.id, modelId };
    })
        .filter(({ modelId }) => modelMeetsPhase(modelId, phase))
        .sort((a, b) => {
        const sa = getModelScore(a.modelId);
        const sb = getModelScore(b.modelId);
        const relevantScore = (s) => phase === 'plan' || phase === 'review' || phase === 'verify'
            ? s.planning + s.review
            : s.coding;
        return relevantScore(sb) - relevantScore(sa);
    });
    if (capable.length > 0) {
        return { agent: capable[0].agentId, execution: 'native' };
    }
    // 4. Fallback: current agent
    const currentAgent = env['ADAPTIVE_CURRENT_AGENT'] ?? 'claude';
    return { agent: currentAgent, execution: 'native' };
}
export function buildRoutingTable(opts) {
    const phases = PHASE_MAP[opts.size];
    return phases.map((phase) => {
        const { agent, execution } = resolveAgent({ ...opts, phase });
        let effort = EFFORT_TABLE[opts.budget][phase];
        // Cap at 'high' unless --allow-max is set
        if (effort === 'max' && !opts.allowMax) {
            effort = 'high';
        }
        return { phase, agent, effort, execution };
    });
}
export function getAgentRole(currentModel) {
    return resolveAgentRole(currentModel);
}
//# sourceMappingURL=router.js.map