export type TaskSize = 'small' | 'medium' | 'large';
export type BudgetMode = 'conservative' | 'balanced' | 'quality';
export type EffortLevel = 'low' | 'medium' | 'high' | 'max';
export type AgentRole = 'full-orchestrator' | 'partial-orchestrator' | 'coordinator-only';
export type ReviewSeverity = 'critical' | 'warning' | 'suggestion';
export type ExecutionMode = 'native' | 'delegate';
export type Phase = 'plan' | 'implement' | 'review' | 'fix' | 'verify';
export type ProjectType = 'flutter' | 'node' | 'laravel' | 'python' | 'unknown';
export type RunStatus = 'pending' | 'running' | 'verified' | 'blocked' | 'failed' | 'interrupted';
export interface CapabilityScore {
    planning: number;
    coding: number;
    review: number;
}
export interface PhaseRequirement {
    min_planning?: number;
    min_coding?: number;
    min_review?: number;
}
export interface CapabilityRegistry {
    models: Record<string, CapabilityScore>;
    phase_requirements: Record<Phase, PhaseRequirement>;
}
export interface PhaseRoute {
    phase: Phase;
    agent: string;
    model?: string;
    effort: EffortLevel;
    execution: ExecutionMode;
}
export interface AgentInfo {
    id: string;
    available: boolean;
    authenticated: boolean;
    executable: boolean;
    models: string[];
    supportsSubagents: boolean;
    supportsDelegate: boolean;
}
export interface FleetLane {
    name: string;
    agent: string;
    model?: string;
    effort?: EffortLevel;
}
export interface Finding {
    severity: ReviewSeverity;
    title: string;
    file?: string;
    description: string;
}
export interface PhaseResult {
    phase: Phase;
    status: 'completed' | 'failed';
    summary: string;
    findings?: Finding[];
    touchedFiles?: string[];
    sessionId?: string;
}
export interface RunMetadata {
    runId: string;
    task: string;
    status: RunStatus;
    currentPhase: Phase | null;
    size: TaskSize;
    budget: BudgetMode;
    routing: PhaseRoute[];
    allowMax: boolean;
    useDelegate: boolean;
    startedAt: string;
    updatedAt: string;
}
export interface RunContext {
    task: string;
    runId: string;
    size: TaskSize;
    budget: BudgetMode;
    allowMax: boolean;
    useDelegate: boolean;
    dryRun: boolean;
    routing: PhaseRoute[];
    workspacePath: string;
    projectType: ProjectType;
}
export interface ClassificationResult {
    size: TaskSize;
    source: 'heuristic' | 'planner';
    reclassified: boolean;
    reason?: string;
}
export interface UserConfig {
    defaultBudget?: BudgetMode;
    agentOverrides?: {
        plan?: string;
        implement?: string;
        review?: string;
        verify?: string;
    };
    registryOverrides?: Record<string, CapabilityScore>;
}
//# sourceMappingURL=index.d.ts.map