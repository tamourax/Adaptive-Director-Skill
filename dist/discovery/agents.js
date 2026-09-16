import { execFileSync, execSync } from 'node:child_process';
const KNOWN_AGENTS = [
    {
        id: 'claude',
        binaries: ['claude'],
        authCheck: ['claude', '--version'],
        supportsSubagents: true,
        supportsDelegate: false,
    },
    {
        id: 'codex',
        binaries: ['codex'],
        authCheck: ['codex', '--version'],
        supportsSubagents: false,
        supportsDelegate: true,
    },
    {
        id: 'agy',
        binaries: ['agy'],
        authCheck: ['agy', '--version'],
        supportsSubagents: true,
        supportsDelegate: false,
    },
    {
        id: 'gemini',
        binaries: ['gemini'],
        authCheck: ['gemini', '--version'],
        supportsSubagents: false,
        supportsDelegate: false,
    },
    {
        id: 'opencode',
        binaries: ['opencode'],
        authCheck: ['opencode', '--version'],
        supportsSubagents: false,
        supportsDelegate: true,
    },
    {
        id: 'aider',
        binaries: ['aider'],
        authCheck: ['aider', '--version'],
        supportsSubagents: false,
        supportsDelegate: true,
    },
    {
        id: 'cursor',
        binaries: ['cursor-agent'],
        authCheck: ['cursor-agent', '--version'],
        supportsSubagents: false,
        supportsDelegate: true,
    },
];
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isOnPath(bin) {
    try {
        execSync(`where ${bin}`, { stdio: 'ignore' });
        return true;
    }
    catch {
        try {
            execSync(`which ${bin}`, { stdio: 'ignore' });
            return true;
        }
        catch {
            return false;
        }
    }
}
function findBinary(binaries) {
    for (const bin of binaries) {
        if (isOnPath(bin))
            return bin;
    }
    return null;
}
function checkAuth(args) {
    try {
        execFileSync(args[0], args.slice(1), { stdio: 'ignore', timeout: 5000 });
        return true;
    }
    catch {
        return false;
    }
}
// ─── Discovery ────────────────────────────────────────────────────────────────
export function discoverAgents() {
    return KNOWN_AGENTS.map((desc) => {
        const bin = findBinary(desc.binaries);
        const available = bin !== null;
        let authenticated = false;
        let executable = false;
        if (available && desc.authCheck) {
            try {
                authenticated = checkAuth(desc.authCheck);
                executable = authenticated;
            }
            catch {
                authenticated = false;
                executable = false;
            }
        }
        else if (available) {
            executable = true;
        }
        return {
            id: desc.id,
            available,
            authenticated,
            executable,
            models: [], // populated by delegate discovery if available
            supportsSubagents: desc.supportsSubagents,
            supportsDelegate: desc.supportsDelegate,
        };
    });
}
/**
 * Get info for a single agent by ID.
 * Returns null if not in the known agents list.
 */
export function getAgentInfo(id) {
    return discoverAgents().find((a) => a.id === id) ?? null;
}
//# sourceMappingURL=agents.js.map