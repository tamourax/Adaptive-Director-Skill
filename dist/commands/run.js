import chalk from 'chalk';
import { classify, applyReclassification } from '../core/classifier.js';
import { buildRoutingTable, detectCurrentModel, getAgentRole } from '../core/router.js';
import { generateRunId, initRun, buildBrief, writePhaseResult, updateMetadata, } from '../core/handoff.js';
import { createExecutor } from '../execution/executor.js';
import { analyseReview } from '../core/reviewer.js';
import { verify } from '../core/verifier.js';
import { detectProjectType } from '../discovery/project.js';
// ─── Entry point ──────────────────────────────────────────────────────────────
export async function run(opts) {
    const { task, budget, useDelegate, allowMax, dryRun } = opts;
    console.log(chalk.bold('\n  Adaptive Orchestrator\n'));
    console.log(chalk.dim(`  Task: ${task}\n`));
    // ── Step 1: Classify task ──────────────────────────────────────────────────
    const initial = classify(task);
    let size = initial.size;
    console.log(`  Classification   ${chalk.cyan(size)} (${initial.source})`);
    // ── Step 2: Current agent capability ──────────────────────────────────────
    const currentModel = detectCurrentModel();
    const agentRole = getAgentRole(currentModel);
    console.log(`  Current model    ${chalk.dim(currentModel)}`);
    console.log(`  Orchestrator role  ${chalk.yellow(agentRole)}`);
    // ── Step 3: Build routing table ────────────────────────────────────────────
    let routing = buildRoutingTable({ size, budget, useDelegate, allowMax });
    // ── Step 4: Dry run ────────────────────────────────────────────────────────
    if (dryRun) {
        printDryRun({ task, size, budget, allowMax, useDelegate, routing });
        return;
    }
    // ── Step 5: Init run workspace ─────────────────────────────────────────────
    const runId = generateRunId();
    const projectType = detectProjectType();
    initRun({ runId, task, size, budget, routing, allowMax, useDelegate });
    updateMetadata(runId, { status: 'running', currentPhase: null });
    console.log(chalk.dim(`\n  Run ID: ${runId}`));
    console.log(chalk.dim(`  Project: ${projectType}\n`));
    console.log('  ─────────────────────────────────────\n');
    // ── Step 6: Execute phases ─────────────────────────────────────────────────
    const phases = routing.map((r) => r.phase);
    for (const route of routing) {
        const { phase } = route;
        // Skip 'fix' — it runs conditionally after review
        if (phase === 'fix')
            continue;
        updateMetadata(runId, { currentPhase: phase });
        process.stdout.write(`  ${phaseLabel(phase)}`);
        const brief = buildBrief(runId, phase);
        const executor = await createExecutor(route.execution);
        const result = await executor.run(route, brief, runId);
        writePhaseResult(runId, result);
        if (result.status === 'failed') {
            console.log(chalk.red(' FAILED'));
            console.log(chalk.red(`\n  ${result.summary.slice(0, 300)}\n`));
            updateMetadata(runId, { status: 'failed', currentPhase: phase });
            printFinalReport(runId, 'failed');
            return;
        }
        // ── Reclassification after plan ────────────────────────────────────────
        if (phase === 'plan') {
            const reclass = applyReclassification(size, result.summary);
            if (reclass.reclassified) {
                console.log(chalk.green(' ✓'));
                console.log(chalk.yellow(`  ⟳ Reclassified: ${size} → ${reclass.size} (${reclass.reason})`));
                size = reclass.size;
                routing = buildRoutingTable({ size, budget, useDelegate, allowMax });
                // Re-init metadata with updated routing
                updateMetadata(runId, { status: 'running' });
            }
            else {
                console.log(chalk.green(' ✓'));
            }
            continue;
        }
        // ── Review handling ────────────────────────────────────────────────────
        if (phase === 'review') {
            const analysis = analyseReview(result);
            if (analysis.hasCritical) {
                console.log(chalk.yellow(` ⚠ ${analysis.criticals.length} CRITICAL`));
                // Fix loop (max 1 cycle)
                const fixRoute = routing.find((r) => r.phase === 'fix') ?? {
                    ...route,
                    phase: 'fix',
                };
                updateMetadata(runId, { currentPhase: 'fix' });
                process.stdout.write(`  ${phaseLabel('fix')}`);
                const fixBrief = buildBrief(runId, 'fix');
                const fixExec = await createExecutor(fixRoute.execution);
                const fixResult = await fixExec.run(fixRoute, fixBrief, runId);
                writePhaseResult(runId, { ...fixResult, phase: 'fix' });
                if (fixResult.status === 'failed') {
                    console.log(chalk.red(' FAILED'));
                    updateMetadata(runId, { status: 'failed', currentPhase: 'fix' });
                    printFinalReport(runId, 'failed');
                    return;
                }
                console.log(chalk.green(' ✓'));
                // Re-review
                updateMetadata(runId, { currentPhase: 'review' });
                process.stdout.write(`  ${phaseLabel('review')} (re-review)`);
                const reReviewBrief = buildBrief(runId, 'review');
                const reReviewExec = await createExecutor(route.execution);
                const reReviewResult = await reReviewExec.run(route, reReviewBrief, runId);
                writePhaseResult(runId, { ...reReviewResult, phase: 'review' });
                const reAnalysis = analyseReview(reReviewResult);
                if (reAnalysis.hasCritical) {
                    console.log(chalk.red(' STILL FAILING'));
                    updateMetadata(runId, { status: 'blocked', currentPhase: 'review' });
                    printFinalReport(runId, 'blocked', reAnalysis.summary);
                    return;
                }
                console.log(chalk.green(' ✓'));
            }
            else {
                console.log(chalk.green(` ✓${analysis.hasWarning ? ' (warnings)' : ''}`));
            }
            continue;
        }
        // ── Verify phase ───────────────────────────────────────────────────────
        if (phase === 'verify') {
            const verifyResult = verify(projectType);
            console.log(verifyResult.passed ? chalk.green(' ✓') : chalk.red(' FAILED'));
            writePhaseResult(runId, {
                phase: 'verify',
                status: verifyResult.passed ? 'completed' : 'failed',
                summary: verifyResult.summary,
            });
            if (!verifyResult.passed) {
                updateMetadata(runId, { status: 'blocked', currentPhase: 'verify' });
                printFinalReport(runId, 'blocked', verifyResult.summary);
                return;
            }
            updateMetadata(runId, { status: 'verified', currentPhase: 'verify' });
            printFinalReport(runId, 'verified');
            return;
        }
        // ── Default: completed ─────────────────────────────────────────────────
        console.log(chalk.green(' ✓'));
    }
    // If no verify phase (small tasks), mark verified
    updateMetadata(runId, { status: 'verified' });
    printFinalReport(runId, 'verified');
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function phaseLabel(phase) {
    const labels = {
        plan: '↳ Plan         ',
        implement: '↳ Implement    ',
        review: '↳ Review       ',
        fix: '↳ Fix          ',
        verify: '↳ Verify       ',
    };
    return labels[phase];
}
function printDryRun(opts) {
    console.log('  ─────────────────────────────────────');
    console.log('');
    console.log(`  ${chalk.bold('Assessment')}`);
    console.log(`  Size:      ${chalk.cyan(opts.size)}`);
    console.log(`  Budget:    ${opts.budget}`);
    console.log(`  Delegate:  ${opts.useDelegate ? chalk.yellow('enabled') : 'disabled'}`);
    console.log(`  Max:       ${opts.allowMax ? chalk.yellow('enabled') : 'disabled'}`);
    console.log('');
    console.log(`  ${chalk.bold('Routing')}`);
    for (const r of opts.routing) {
        const exec = r.execution === 'delegate' ? chalk.yellow(' [delegate]') : '';
        console.log(`  ${r.phase.padEnd(12)} → ${r.agent} / ${r.effort}${exec}`);
    }
    console.log('');
    console.log(chalk.dim('  No execution performed.'));
    console.log('');
}
function printFinalReport(runId, status, details) {
    console.log('\n  ─────────────────────────────────────');
    const icon = status === 'verified' ? chalk.green('✓ Verified') :
        status === 'blocked' ? chalk.yellow('⚠ Blocked') :
            chalk.red('✗ Failed');
    console.log(`\n  Status: ${icon}`);
    console.log(`  Run:    ${runId}`);
    if (details) {
        console.log(`\n${details.split('\n').map((l) => '  ' + l).join('\n')}`);
    }
    console.log('');
}
//# sourceMappingURL=run.js.map