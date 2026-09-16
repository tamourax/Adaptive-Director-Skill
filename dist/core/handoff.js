import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
// ─── Workspace root ───────────────────────────────────────────────────────────
const RUNS_ROOT = join(process.cwd(), '.adaptive-orchestrator', 'runs');
function runDir(runId) {
    return join(RUNS_ROOT, runId);
}
// ─── Run init ─────────────────────────────────────────────────────────────────
export function generateRunId() {
    return 'run-' + randomBytes(4).toString('hex');
}
export function initRun(opts) {
    const dir = runDir(opts.runId);
    mkdirSync(dir, { recursive: true });
    // Write task.md (human-readable brief)
    const taskMd = `# Task\n\n${opts.task}\n\n## Constraints\n\n- Stay in scope\n- Document all decisions\n`;
    writeFileSync(join(dir, 'task.md'), taskMd, 'utf8');
    // Write initial metadata
    const meta = {
        runId: opts.runId,
        task: opts.task,
        status: 'pending',
        currentPhase: null,
        size: opts.size,
        budget: opts.budget,
        routing: opts.routing,
        allowMax: opts.allowMax,
        useDelegate: opts.useDelegate,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    writeMetadata(opts.runId, meta);
}
// ─── Metadata ─────────────────────────────────────────────────────────────────
function metaPath(runId) {
    return join(runDir(runId), 'metadata.json');
}
function writeMetadata(runId, meta) {
    writeFileSync(metaPath(runId), JSON.stringify(meta, null, 2), 'utf8');
}
export function readMetadata(runId) {
    const path = metaPath(runId);
    if (!existsSync(path))
        return null;
    return JSON.parse(readFileSync(path, 'utf8'));
}
export function updateMetadata(runId, patch) {
    const meta = readMetadata(runId);
    if (!meta)
        throw new Error(`Run not found: ${runId}`);
    const updated = {
        ...meta,
        ...patch,
        updatedAt: new Date().toISOString(),
    };
    writeMetadata(runId, updated);
}
// ─── Phase read / write ───────────────────────────────────────────────────────
export function writePhaseResult(runId, result) {
    const dir = runDir(runId);
    // Write .json (machine contract)
    writeFileSync(join(dir, `${result.phase}.json`), JSON.stringify(result, null, 2), 'utf8');
    // Write .md (human readable)
    const lines = [
        `# ${result.phase.charAt(0).toUpperCase() + result.phase.slice(1)} Result`,
        '',
        `**Status:** ${result.status}`,
        '',
        `## Summary`,
        '',
        result.summary,
    ];
    if (result.findings && result.findings.length > 0) {
        lines.push('', '## Findings', '');
        for (const f of result.findings) {
            lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
            if (f.file)
                lines.push(`**File:** \`${f.file}\``);
            lines.push('', f.description, '');
        }
    }
    if (result.touchedFiles && result.touchedFiles.length > 0) {
        lines.push('', '## Touched Files', '');
        for (const f of result.touchedFiles)
            lines.push(`- ${f}`);
    }
    writeFileSync(join(dir, `${result.phase}.md`), lines.join('\n'), 'utf8');
}
export function readPhaseResult(runId, phase) {
    const path = join(runDir(runId), `${phase}.json`);
    if (!existsSync(path))
        return null;
    return JSON.parse(readFileSync(path, 'utf8'));
}
// ─── Brief builder ────────────────────────────────────────────────────────────
/**
 * Build a self-contained brief for the given phase.
 * Each agent receives only the context it needs — not the full chat history.
 */
export function buildBrief(runId, phase) {
    const dir = runDir(runId);
    const task = readFileSync(join(dir, 'task.md'), 'utf8');
    const plan = safeRead(join(dir, 'plan.md'));
    const impl = safeRead(join(dir, 'implementation.md'));
    const review = safeRead(join(dir, 'review.md'));
    switch (phase) {
        case 'plan':
            return [
                task,
                '---',
                '# Instructions',
                '',
                'Inspect the repository and produce a detailed step-by-step plan.',
                'If the initial task size estimate seems wrong after inspecting the codebase, say so.',
                '',
                '## Output format',
                'Return a structured plan with: steps, files/modules involved, acceptance criteria, constraints.',
                'End your response with a JSON block like:',
                '```json',
                '{"recommended_size": "medium", "reason": "..."}',
                '```',
            ].join('\n');
        case 'implement':
            return [
                task,
                '',
                '---',
                '',
                '# Approved Plan',
                '',
                plan ?? '(no plan available — use best judgment)',
                '',
                '---',
                '',
                '# Instructions',
                '',
                'Implement the approved plan. Stay in scope.',
                'Do NOT commit.',
                '',
                '## Output',
                'Report: changed files, completed work, test results, known issues.',
            ].join('\n');
        case 'review':
        case 'fix':
            return [
                task,
                '',
                '---',
                '',
                '# Plan',
                '',
                plan ?? '(no plan)',
                '',
                '---',
                '',
                '# Implementation Report',
                '',
                impl ?? '(no implementation report)',
                '',
                '---',
                '',
                '# Instructions',
                '',
                phase === 'fix'
                    ? 'Fix the CRITICAL issues found in the review below. Do not redesign.'
                    : 'Review the implementation against the plan.',
                '',
                phase === 'review'
                    ? 'Classify each finding as CRITICAL / WARNING / SUGGESTION.'
                    : '',
                '',
                phase === 'fix' ? '# Previous Review\n\n' + (review ?? '') : '',
            ].join('\n');
        case 'verify':
            return [
                task,
                '',
                '---',
                '',
                '# Plan',
                '',
                plan ?? '(no plan)',
                '',
                '---',
                '',
                '# Instructions',
                '',
                'Verify the implementation:',
                '- Requirements satisfied?',
                '- Tests passing?',
                '- Critical findings resolved?',
                '- Build successful?',
                '- Implementation matches plan?',
                '',
                'Return a clear VERIFIED or BLOCKED verdict with reasoning.',
            ].join('\n');
    }
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeRead(path) {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}
// ─── Resume support ───────────────────────────────────────────────────────────
export function listRuns() {
    if (!existsSync(RUNS_ROOT))
        return [];
    const dirs = readdirSync(RUNS_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    return dirs
        .map((id) => readMetadata(id))
        .filter((m) => m !== null)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
//# sourceMappingURL=handoff.js.map