import type { PhaseRoute, PhaseResult } from '../types/index.js'

// ─── IExecutor interface ──────────────────────────────────────────────────────

export interface IExecutor {
  /**
   * Execute a single phase.
   * @param route   - routing decision (agent, model, effort, execution mode)
   * @param brief   - self-contained task brief for the agent
   * @param runDir  - path to the run workspace (for storing results)
   */
  run(route: PhaseRoute, brief: string, runDir: string): Promise<PhaseResult>
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function createExecutor(mode: 'native' | 'delegate'): Promise<IExecutor> {
  if (mode === 'delegate') {
    const { DelegateExecutor } = await import('./delegate-executor.js')
    return new DelegateExecutor()
  }
  const { NativeExecutor } = await import('./native-executor.js')
  return new NativeExecutor()
}
