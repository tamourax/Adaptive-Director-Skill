import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
const LAUNCHERS = {
    claude: (briefPath, route) => ({
        cmd: 'claude',
        args: [
            '--print',
            '-p', `@${briefPath}`,
            '--effort', route.effort,
        ],
    }),
    codex: (briefPath, route) => ({
        cmd: 'codex',
        args: [
            '-p', `@${briefPath}`,
            '--effort', route.effort,
        ],
    }),
    agy: (briefPath, route) => ({
        cmd: 'agy',
        args: [
            '--print',
            '-p', `@${briefPath}`,
            '--effort', route.effort,
        ],
    }),
    gemini: (briefPath, _route) => ({
        cmd: 'gemini',
        args: ['-p', `@${briefPath}`],
    }),
};
function getDefaultLauncher(agentId) {
    return (briefPath, route) => ({
        cmd: agentId,
        args: ['-p', `@${briefPath}`, '--effort', route.effort],
    });
}
// ─── Finding parser ───────────────────────────────────────────────────────────
const SEVERITY_PATTERN = /\b(CRITICAL|WARNING|SUGGESTION)\b[:\s]+(.+)/gi;
function parseFindings(output) {
    const findings = [];
    let match;
    while ((match = SEVERITY_PATTERN.exec(output)) !== null) {
        findings.push({
            severity: match[1].toLowerCase(),
            title: match[2].trim().slice(0, 120),
            description: match[2].trim(),
        });
    }
    return findings;
}
// ─── Class ────────────────────────────────────────────────────────────────────
export class NativeExecutor {
    async run(route, brief, _runDir) {
        // Write brief to temp file
        const tmp = join(tmpdir(), `ao-brief-${randomBytes(4).toString('hex')}.md`);
        writeFileSync(tmp, brief, 'utf8');
        try {
            const launcher = LAUNCHERS[route.agent] ?? getDefaultLauncher(route.agent);
            const { cmd, args } = launcher(tmp, route);
            const result = spawnSync(cmd, args, {
                encoding: 'utf8',
                timeout: 10 * 60 * 1000, // 10 minutes
                maxBuffer: 10 * 1024 * 1024, // 10 MB
            });
            if (result.error) {
                return {
                    phase: route.phase,
                    status: 'failed',
                    summary: `Agent launch failed: ${result.error.message}`,
                };
            }
            const output = (result.stdout ?? '') + (result.stderr ?? '');
            if (result.status !== 0) {
                return {
                    phase: route.phase,
                    status: 'failed',
                    summary: `Agent exited with code ${result.status ?? 'unknown'}.\n\n${output.slice(0, 2000)}`,
                };
            }
            const findings = route.phase === 'review' || route.phase === 'fix'
                ? parseFindings(output)
                : undefined;
            return {
                phase: route.phase,
                status: 'completed',
                summary: output.trim(),
                findings,
            };
        }
        finally {
            // Clean up temp file
            try {
                const { unlinkSync } = await import('node:fs');
                unlinkSync(tmp);
            }
            catch { /* ignore */ }
        }
    }
}
//# sourceMappingURL=native-executor.js.map