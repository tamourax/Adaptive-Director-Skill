# Adaptive Orchestrator — Skill-First MVP Plan

## Overview

**Adaptive Orchestrator** is a lightweight orchestration skill for coding agents.

It is not intended to start as a large standalone framework.

The MVP follows a **skill-first architecture** similar in spirit to `delegate-skills`:

```text
Skill instructions
+
Small deterministic scripts
+
External/native agents do the reasoning
```

The goal is simple:

> Give one coding task to Adaptive Orchestrator, and it decides which agent/model/effort should handle each phase: planning, implementation, review, fixing, and verification.

---

## 1. Core Problem

Most coding-agent workflows still rely on:

```text
One agent
+
One model
+
One effort level
+
One execution path
```

for the entire task.

But:

```text
Planning ≠ Implementation ≠ Review
```

A task may benefit from:

```text
Plan
→ stronger reasoning

Implement
→ coding-focused agent

Review
→ independent stronger reviewer

Verify
→ moderate reasoning
```

Without orchestration, the user manually manages all of this.

Adaptive Orchestrator automates those decisions.

---

## 2. MVP Philosophy

The MVP should remain small.

It should NOT begin as:

- a large Node.js framework,
- a distributed agent platform,
- a cloud service,
- a complex routing engine,
- or a self-learning system.

Instead:

```text
SKILL.md
→ defines orchestration behavior

Small scripts
→ handle deterministic work

Agents
→ handle reasoning and implementation
```

---

## 3. Final Architecture

```text
Adaptive Orchestrator
│
├── SKILL.md
│   └── orchestration behavior
│
├── scripts/
│   ├── setup.mjs
│   ├── discover.mjs
│   ├── route.mjs
│   ├── run-state.mjs
│   └── resume.mjs
│
├── references/
│   ├── capability-registry.md
│   ├── routing-rules.md
│   ├── handoff-schema.md
│   └── delegate-integration.md
│
└── data/
    └── registry.json
```

Optional later:

```text
tests/
examples/
docs/
```

---

## 4. Project Structure

```text
adaptive-orchestrator/
├── SKILL.md
├── README.md
├── package.json
│
├── scripts/
│   ├── setup.mjs
│   ├── discover.mjs
│   ├── route.mjs
│   ├── run-state.mjs
│   └── resume.mjs
│
├── references/
│   ├── capability-registry.md
│   ├── routing-rules.md
│   ├── handoff-schema.md
│   └── delegate-integration.md
│
├── data/
│   └── registry.json
│
└── runs/
    └── .gitkeep
```

---

## 5. SKILL.md Responsibilities

`SKILL.md` is the brain of the MVP.

It defines:

```text
1. Understand task
2. Read local capability data
3. Classify task
4. Determine required phases
5. Ask route.mjs for routing
6. Execute planning
7. Execute implementation
8. Execute independent review
9. Fix critical findings
10. Re-review once
11. Verify
12. Produce final report
```

It also defines the rules:

```text
Max reasoning is disabled by default
Delegate is disabled by default
Native agents/sub-agents are preferred
Review should be independent
Critical findings must be fixed
Warning findings are reported
Suggestion findings are informational
```

---

## 6. Setup

Setup command:

```bash
node scripts/setup.mjs
```

or, if exposed through install tooling:

```bash
adaptive-orchestrator setup
```

Setup performs:

```text
Detect installed agent CLIs
↓
Detect delegate-skills
↓
Read delegate fleet lanes if available
↓
Load built-in registry
↓
Ask user for optional overrides
↓
Save local config
```

---

## 7. Agent Discovery

`scripts/discover.mjs`

Purpose:

```text
Detect what exists.
Do not decide what is best.
```

Possible detections:

```text
Codex
Claude Code
Gemini CLI
OpenCode
delegate-skills
```

Output example:

```json
{
  "agents": {
    "codex": {
      "installed": true,
      "available": true
    },
    "claude": {
      "installed": true,
      "available": true
    },
    "gemini": {
      "installed": false,
      "available": false
    }
  },
  "delegateSkills": {
    "installed": true
  }
}
```

Important rule:

> Never guess unavailable capabilities.

---

## 8. Delegate Detection During Setup

If `delegate-skills` is not found:

```text
Delegate Skills not detected.

Install delegate support now?
[Y/N]
```

If user says no:

```text
Native execution remains available.
```

If user says yes:

```text
Install delegate-skills
↓
Run discovery again
↓
Read fleet lanes
```

Delegate remains optional at runtime.

---

## 9. Capability Registry

Built-in registry:

```text
data/registry.json
```

Purpose:

```text
Describe known model capability defaults.
```

Example:

```json
{
  "models": {
    "claude-opus": {
      "planning": 5,
      "coding": 4,
      "review": 5
    },
    "claude-sonnet": {
      "planning": 4,
      "coding": 4,
      "review": 4
    },
    "codex-default": {
      "planning": 2,
      "coding": 5,
      "review": 2
    },
    "unknown": {
      "planning": 1,
      "coding": 1,
      "review": 1
    }
  }
}
```

Scores are:

```text
1 = weak
2 = limited
3 = acceptable
4 = strong
5 = excellent
```

---

## 10. Registry Priority

Priority is fixed:

```text
User explicit override
↓
Delegate lane preference
↓
Built-in capability registry
↓
Fallback/default
```

This is one of the main product rules.

---

## 11. User Overrides

Setup can save overrides like:

```json
{
  "planner": {
    "agent": "claude"
  },
  "implementer": {
    "agent": "codex"
  },
  "reviewer": {
    "agent": "claude"
  }
}
```

These overrides always win.

---

## 12. Delegate Lanes

If `delegate-skills` is installed and has fleet lanes:

```text
Adaptive Orchestrator should respect them as routing preferences.
```

Example concept:

```text
planning lane
→ claude

coding lane
→ codex

review lane
→ claude
```

But:

```text
User explicit override
```

still has higher priority.

---

## 13. Routing Script

`scripts/route.mjs`

This script is deterministic.

Input:

```json
{
  "taskSize": "medium",
  "phase": "review",
  "budget": "balanced",
  "allowMax": false,
  "delegateEnabled": false
}
```

It reads:

```text
User config
Delegate lanes
Built-in registry
Routing rules
```

Then returns:

```json
{
  "agent": "claude",
  "model": "claude-sonnet",
  "effort": "high",
  "execution": "native"
}
```

The routing script does NOT perform reasoning.

It applies rules.

---

## 14. Task Classification

The MVP uses:

```text
small
medium
large
```

Initial classification can be simple.

Examples:

```text
Small
→ rename text
→ minor UI change
→ typo fix

Medium
→ Stripe integration
→ password reset
→ API integration

Large
→ architecture refactor
→ auth redesign
→ payment architecture
→ migration
```

The skill may use simple heuristics first.

---

## 15. Reclassification

Initial classification is not final.

Flow:

```text
Initial classification
↓
Planner inspects repository
↓
Planner reports discovered scope
↓
Adaptive Orchestrator may reclassify
```

Example:

```text
Initial:
Medium

Planner discovers:
- webhooks
- saved cards
- refunds
- Apple Pay

Final:
Large
```

---

## 16. Current Agent Capability

Do NOT ask the current agent:

```text
"Are you strong enough?"
```

Instead compare:

```text
Current model capability score
vs
Phase minimum requirement
```

Example:

```text
Planning requirement = 3
Current planning score = 1

1 < 3
↓
Current agent must not plan
```

Possible role:

```text
Coordinator only
```

---

## 17. Coordinator-Only Mode

If current agent is below the required capability:

```text
Current agent
↓
Coordinates only
```

Example:

```text
Weak Parent
│
├── Planner → stronger agent
├── Implementer → coding agent
├── Reviewer → stronger independent agent
└── Verifier → suitable agent
```

The weak parent only:

```text
Passes briefs
Receives results
Updates run state
Reports outcome
```

---

## 18. Native Execution

Default mode:

```text
native
```

Meaning:

```text
Use available native agent/sub-agent execution.
```

No delegate is required.

Example:

```text
Planner
→ native sub-agent

Implementer
→ native sub-agent

Reviewer
→ native independent sub-agent
```

---

## 19. Delegate Execution

Optional flag:

```text
--delegate
```

Meaning:

> External delegation is allowed.

Not:

> External delegation is mandatory.

Example:

```text
Plan
→ native

Implement
→ delegate-skills → Codex

Review
→ native
```

---

## 20. Delegate Rule

Adaptive Orchestrator remains the top-level controller.

```text
Adaptive Orchestrator
= decision maker

delegate-skills
= execution channel
```

Avoid uncontrolled orchestration inside orchestration.

For MVP:

```text
One delegated executor per phase.
```

---

## 21. Budget Modes

Do not depend on provider quota APIs.

User selects:

```text
conservative
balanced
quality
```

Default:

```text
balanced
```

Example:

```bash
adaptive-orchestrator --budget conservative "Implement Stripe"
```

---

## 22. Effort Rules

Default allowed:

```text
low
medium
high
```

`max` is disabled.

To permit Max:

```bash
adaptive-orchestrator --allow-max "..."
```

Important:

```text
--allow-max
```

means:

```text
Max may be used.
```

It does not force Max.

---

## 23. Effort Table

```text
Phase        Conservative   Balanced   Quality
------------------------------------------------
Plan         medium         high       high
Implement    medium         medium     medium
Review       high           high       high
Verify       medium         medium     high
```

For small tasks:

```text
Plan may be skipped.
Verify may be skipped.
```

---

## 24. Routing Rules

### Small

```text
Implement
↓
Review
```

### Medium

```text
Plan
↓
Implement
↓
Review
↓
Verify
```

### Large

```text
Plan
↓
Implement
↓
Review
↓
Fix if critical
↓
Re-review
↓
Verify
```

---

## 25. Handoff Protocol

Agents should not rely on the full chat context.

Each run gets a workspace.

```text
.adaptive-orchestrator/
└── runs/
    └── run-abc123/
        ├── metadata.json
        ├── task.md
        ├── plan.md
        ├── implementation.md
        ├── review.md
        └── final.md
```

---

## 26. metadata.json

Example:

```json
{
  "runId": "run-abc123",
  "task": "Implement Stripe in Flutter",
  "status": "running",
  "currentPhase": "review",
  "size": "medium",
  "budget": "balanced",
  "allowMax": false,
  "delegate": false,
  "startedAt": "2026-09-17T01:00:00Z",
  "updatedAt": "2026-09-17T01:12:00Z"
}
```

---

## 27. Handoff Files

### task.md

Contains:

```text
Original task
Goal
Known constraints
Project context
```

### plan.md

Contains:

```text
Scope
Steps
Decisions
Constraints
Acceptance criteria
```

### implementation.md

Contains:

```text
Changed files
Completed work
Tests
Known issues
```

### review.md

Contains:

```text
Critical findings
Warnings
Suggestions
Review summary
```

### final.md

Contains:

```text
Verification result
Tests
Build status
Remaining warnings
Final status
```

---

## 28. Review Severity

Findings are classified as:

```text
CRITICAL
WARNING
SUGGESTION
```

Behavior:

```text
CRITICAL
→ must fix

WARNING
→ report and continue

SUGGESTION
→ report only
```

---

## 29. Review Loop

MVP limit:

```text
1 automatic fix cycle
```

Flow:

```text
Review
↓
Critical?
├── No → Verify
└── Yes
    ↓
    Fix
    ↓
    Re-review
```

If critical finding remains:

```text
Status: Blocked
```

---

## 30. Verification

Verification is project-aware where possible.

Examples:

```text
Flutter
→ flutter analyze
→ flutter test

Node
→ npm test
→ npm run build if available

Laravel
→ php artisan test

Python
→ pytest
```

The orchestrator should check command/script availability first.

---

## 31. Dry Run

Command:

```bash
adaptive-orchestrator --dry-run "Implement Stripe in Flutter"
```

Output example:

```text
Adaptive Orchestrator

Task:
Implement Stripe in Flutter

Classification:
Medium

Budget:
Balanced

Routing:
Plan       → Claude / High / Native
Implement  → Codex / Medium / Native
Review     → Claude / High / Native
Verify     → Claude / Medium / Native

Delegate:
Disabled

Max:
Disabled

No execution performed.
```

---

## 32. Resume

Each run stores state.

Optional MVP command:

```bash
adaptive-orchestrator --resume run-abc123
```

Resume reads:

```text
metadata.json
```

and continues from the last incomplete phase.

---

## 33. What Is Code vs Skill Logic?

### SKILL.md handles

```text
Task understanding
Planning instructions
Review instructions
When to fix
When to verify
How agents should behave
How to interpret routing output
```

### Scripts handle

```text
Discovery
Configuration
Routing lookup
Run state
File creation
Delegate relay invocation
Resume
```

This separation is intentional.

---

## 34. What Is NOT in MVP

Not included:

```text
Self-learning
Automatic benchmarking
Automatic provider quota detection
Dynamic cost prediction
Multi-agent voting
Multiple delegates per phase
Cloud dashboard
Complex risk scoring
Automatic rollback
Unlimited review loops
Agent marketplace
```

---

## 35. MVP Build Order

```text
1. SKILL.md
2. data/registry.json
3. references/capability-registry.md
4. references/routing-rules.md
5. references/handoff-schema.md
6. scripts/discover.mjs
7. scripts/setup.mjs
8. scripts/route.mjs
9. scripts/run-state.mjs
10. scripts/resume.mjs
11. delegate integration
12. README.md
13. smoke tests
```

---

## 36. MVP Success Criteria

The MVP is successful if it can:

```text
1. Detect available agents
2. Read delegate lanes if present
3. Route planning/coding/review differently
4. Respect user overrides
5. Respect budget mode
6. Keep Max disabled by default
7. Use native execution by default
8. Use delegate only when allowed
9. Pass context through handoff files
10. Perform independent review
11. Fix one critical review cycle
12. Produce final status
```

---

## 37. Product Positioning

Weak positioning:

> A skill that plans and reviews code.

Better:

> Adaptive multi-agent orchestration for coding tasks.

Best concise positioning:

> Give one coding task to Adaptive Orchestrator. It routes each phase to the right agent, model, and reasoning effort automatically.

---

## 38. One-Line Description

> **One task in. The right agents take it from there.**

---

## 39. Core Differentiator

The main differentiator is NOT:

```text
Sub-agents
```

and NOT:

```text
Plan → Implement → Review
```

The differentiator is:

```text
Adaptive routing across:
Agent
+
Model
+
Effort
+
Execution mode
```

while respecting:

```text
User overrides
Delegate lanes
Capability registry
Budget policy
```

---

## 40. Final MVP Flow

```text
User Task
↓
Read Config
↓
Discover Available Agents
↓
Initial Task Classification
↓
Load Routing Rules
↓
Resolve Agent + Model + Effort
↓
Plan
↓
Handoff
↓
Implement
↓
Handoff
↓
Independent Review
↓
Critical?
├── Yes → Fix → Re-review
└── No
↓
Verify
↓
Final Report
```

---

## 41. Final Rule

Adaptive Orchestrator should remain:

> **Skill-first, deterministic where possible, agent-driven where reasoning is required.**

That is the MVP.
