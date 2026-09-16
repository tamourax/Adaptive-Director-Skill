import type { AgentInfo } from '../types/index.js';
export declare function discoverAgents(): AgentInfo[];
/**
 * Get info for a single agent by ID.
 * Returns null if not in the known agents list.
 */
export declare function getAgentInfo(id: string): AgentInfo | null;
//# sourceMappingURL=agents.d.ts.map