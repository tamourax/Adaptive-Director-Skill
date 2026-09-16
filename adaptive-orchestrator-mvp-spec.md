# Adaptive Orchestrator

> An adaptive multi-agent execution layer for coding agents that automatically chooses the right agent, model, reasoning effort, and execution path for each phase of a task.

---

## 1. Overview

**Adaptive Orchestrator** is a CLI + agent skill designed to manage complex coding tasks through multiple agents and execution phases.

Instead of running an entire task using:

- one agent,
- one model,
- one reasoning effort,
- and one fixed workflow,

Adaptive Orchestrator dynamically decides:

- who should orchestrate,
- which agents should be used,
- which model should handle each phase,
- which reasoning effort should be used,
- whether native sub-agents are enough,
- whether external delegation is allowed,
- when to review,
- when to fix,
- and when to stop.

The user provides the task once.

Example:

```bash
adaptive-orchestrator "Implement Stripe in Flutter"
```

The orchestrator handles the execution strategy automatically.

---

# 2. The Problem

Coding agents are becoming more powerful, but execution is still commonly inefficient.

A typical workflow looks like this:

```text
User Task
↓
One Agent
↓
Same Model
↓
Same Reasoning Effort
↓
Plan
↓
Implement
↓
Review
```

This creates several problems.

## 2.1 Same model for everything

Planning, coding, reviewing, and verification do not always require the same model.

Example:

```text
Planning
→ strong reasoning model

Implementation
→ coding-focused model

Review
→ strong independent reasoning model
```

Using the strongest model everywhere can waste usage.

Using a weak model everywhere can reduce quality.

---

## 2.2 Same reasoning effort for everything

A simple file edit may only require low effort.

A payment architecture review may require high effort.

Running everything on `high` or `max` wastes tokens and usage.

Running everything on `low` may produce weak plans or incomplete reviews.

---

## 2.3 The current agent may be too weak

A user may accidentally start Adaptive Orchestrator from:

```text
Weak Model
+
Low Effort
```

while stronger models or agents are already available in the environment.

If the weak parent agent tries to:

- plan,
- classify,
- review,
- and verify

by itself, it may make the wrong decisions before stronger agents are ever used.

Adaptive Orchestrator therefore must evaluate its **own capability first**.

---

## 2.4 Manual orchestration is repetitive

Without orchestration, users often manually write:

```text
Plan first.

Now implement.

Now review the implementation.

Fix the issues.

Review again.
```

The user should not need to manually manage every phase.

---

## 2.5 Review should be independent

The same agent that implemented a solution may miss its own mistakes.

Important tasks benefit from an independent reviewer.

---

## 2.6 Strong reasoning can consume unexpected usage

If an orchestrator decides that many stages require `high` or `max`, the user may consume far more usage than expected.

Therefore:

- usage must influence routing,
- `max` must never be enabled silently,
- and expensive reasoning should be reserved for phases that actually need it.

---

# 3. The Solution

Adaptive Orchestrator acts as a decision and execution layer above coding agents.

Core flow:

```text
Task
↓
Self Capability Check
↓
Choose Orchestrator Role
↓
Inspect Available Agents
↓
Check Usage Constraints
↓
Classify Task
↓
Choose Agents
↓
Choose Model + Effort Per Phase
↓
Plan
↓
Implement
↓
Independent Review
↓
Fix if needed
↓
Re-review
↓
Final Verification
↓
Result
```

---

# 4. Core MVP Philosophy

The MVP should remain small.

Adaptive Orchestrator is **not** initially intended to be:

- a huge autonomous agent framework,
- a self-learning routing engine,
- a full workflow platform,
- a distributed agent cloud,
- or a complex cost optimizer.

The MVP focuses on one problem:

> Given one coding task, automatically assign the right agent, model, and reasoning effort to planning, implementation, review, fixing, and verification.

---

# 5. Core MVP Features

## 5.1 Self Capability Check

Before planning anything, the current agent evaluates whether it is capable of acting as the orchestrator.

The current agent asks:

```text
What is my role?
→ Orchestrator

What are my critical responsibilities?
→ Planning
→ Reviewing
→ Final verification

Can I reliably perform these responsibilities
with my current model and effort?
```

Possible outcomes:

### Full Orchestrator

```text
Planning: capable
Review: capable
Coordination: capable
```

Result:

```text
Role = Full Orchestrator
```

The current agent can plan, coordinate, and review.

---

### Partial Orchestrator

Example:

```text
Planning: capable
Implementation: better candidate available
Review: capable
```

Result:

```text
Role = Partial Orchestrator
```

Example routing:

```text
Plan → Self
Implement → Coding Agent
Review → Self
```

---

### Coordinator Only

Example:

```text
Planning: insufficient
Review: insufficient
Coordination: sufficient
```

Result:

```text
Role = Coordinator Only
```

The current agent must not make critical planning or review decisions.

Instead:

```text
Weak Parent
↓
Strong Planner
↓
Implementer
↓
Strong Reviewer
↓
Strong Verifier
↓
Weak Parent receives final result
```

The weak parent only:

- dispatches tasks,
- receives results,
- passes outputs between agents,
- and reports the final status.

---

# 6. Capability Bootstrap

The orchestrator should not blindly trust the model that invoked it.

Before execution:

```text
Current Agent
↓
Capability Check
↓
Is current capability sufficient?
├── Yes → Continue
└── No → Escalate critical phases
```

A stronger available agent may become the effective planner or reviewer.

This prevents the system from failing simply because the user launched it from a weak model.

---

# 7. Task Classification

For the MVP, classification stays simple.

```text
Small
Medium
Large
```

No complex scoring system is required initially.

Examples:

## Small

```text
Rename button text
Fix minor UI issue
Update one validation condition
```

## Medium

```text
Implement password reset
Add Stripe payment flow
Add new API integration
Refactor one application module
```

## Large

```text
Refactor payment architecture
Implement authentication architecture
Large database migration
Multi-module feature
Cross-platform architecture change
```

The classification may change after repository inspection.

Example:

```text
Initial classification: Medium

Repository inspection discovers:
- custom backend
- webhooks
- refunds
- saved cards
- Apple Pay

Updated classification: Large
```

Adaptive Orchestrator must allow **reclassification**.

---

# 8. Phase-Based Routing

The main execution phases are:

```text
Plan
Implement
Review
Fix
Verify
```

For each phase, Adaptive Orchestrator selects:

```text
Agent
+
Model
+
Reasoning Effort
```

Example:

```text
Plan
→ Strong Reasoning Agent
→ High

Implement
→ Coding Agent
→ Medium

Review
→ Independent Strong Agent
→ High

Fix
→ Coding Agent
→ Medium

Verify
→ Strong Agent
→ Medium
```

---

# 9. Native Sub-Agents

Native sub-agents are part of the default MVP.

Default architecture:

```text
Main Adaptive Orchestrator
│
├── Planner Agent
│
├── Implementer Agent
│
├── Reviewer Agent
│
└── Verifier Agent
```

Not every task needs all four agents.

For a small task:

```text
Implementer
+
Reviewer
```

may be enough.

For a large task:

```text
Planner
+
Implementer
+
Reviewer
+
Verifier
```

may be required.

The goal is not to spawn the maximum number of agents.

The goal is:

> Use the minimum number of agents required to achieve reliable execution.

---

# 10. Reasoning Effort Policy

Supported conceptual effort levels:

```text
Low
Medium
High
Max
```

However:

## Max is disabled by default.

Default allowed efforts:

```text
Low
Medium
High
```

Max can only be used when the user explicitly enables it.

Example:

```bash
adaptive-orchestrator --allow-max "Refactor payment architecture"
```

Even when enabled, Max is only **allowed**, not required.

The orchestrator may still choose:

```text
Plan → High
Implement → Medium
Review → High
Verify → Medium
```

If Max is actually justified:

```text
Review → Max
```

could be selected.

---

# 11. Minimum Capability Floors

Critical phases must not silently run below an acceptable capability level.

Example policy:

```text
Planning
→ Never below Medium unless task is clearly trivial

Implementation
→ Can use Low when appropriate

Review
→ Never below High for medium/large tasks

Final Verification
→ Never below Medium
```

These floors are safety boundaries.

They should still remain adaptive based on the capabilities of each model/provider.

---

# 12. Usage-Aware Routing

Adaptive Orchestrator must not use expensive reasoning without considering usage.

The MVP uses three usage states:

```text
Healthy
Constrained
Critical
```

## Healthy

Normal routing.

Example:

```text
Plan → High
Implement → Medium
Review → High
Verify → Medium
```

---

## Constrained

Reduce usage where safe.

Example:

```text
Plan → Medium
Implement → Medium
Review → High
Verify → Medium
```

Strong reasoning is preserved for review.

---

## Critical

Minimize non-essential usage.

Example:

```text
Plan → Medium
Implement → Low/Medium
Review → High
Verify → Medium
```

The orchestrator should prefer preserving review quality rather than spending high effort everywhere.

---

# 13. Usage Principle

Adaptive Orchestrator should follow this principle:

> Use the lowest capability that can reliably complete each phase.

Not:

> Always use the strongest model available.

And not:

> Always use the cheapest model available.

The goal is adaptive balance.

---

# 14. Review Workflow

The standard MVP workflow:

```text
Plan
↓
Implement
↓
Independent Review
↓
Issues?
├── No
│   ↓
│   Final Verify
│   ↓
│   Done
│
└── Yes
    ↓
    Fix
    ↓
    Re-review
    ↓
    Final Verify
```

---

# 15. Review Loop Limit

The MVP should not create infinite review loops.

Initial rule:

```text
Maximum automatic fix/re-review cycles: 1
```

Example:

```text
Implementation
↓
Review failed
↓
Fix
↓
Re-review failed
```

Result:

```text
Status: Blocked

Automatic review limit reached.
Remaining issues are reported to the user.
```

Later versions may support configurable review rounds.

---

# 16. Independent Review

The reviewer should ideally not be the exact same execution context that produced the implementation.

Preferred:

```text
Implementer Agent
↓
Independent Reviewer Agent
```

This helps reduce self-review blind spots.

---

# 17. Final Verification

After review passes, a final verification phase confirms:

```text
Requirements satisfied?
Tests passed?
Build successful?
Critical findings resolved?
Implementation matches plan?
```

The verifier should not simply trust the implementer.

---

# 18. Delegate Support

Delegate is optional.

It is **not enabled by default**.

Default:

```bash
adaptive-orchestrator "Implement Stripe in Flutter"
```

uses native agents/sub-agents.

Delegate-enabled mode:

```bash
adaptive-orchestrator --delegate "Implement Stripe in Flutter"
```

means:

> Adaptive Orchestrator is allowed to use an external delegated executor when useful.

It does not mean delegation must always happen.

---

# 19. Delegate Architecture

Example:

```text
Adaptive Orchestrator
│
├── Planner → Native Agent
│
├── Implementer → Delegate → Codex
│
├── Reviewer → Native Agent
│
└── Verifier → Native Agent
```

Adaptive Orchestrator remains the top-level controller.

Delegate is an execution channel.

---

# 20. Delegate Rules

For MVP:

```text
Adaptive Orchestrator = top-level controller
Delegate = optional executor
```

The delegate should receive a focused brief.

Example:

```text
Implement the approved Stripe integration plan.

Constraints:
- Do not redesign unrelated modules.
- Stay inside approved scope.

Return:
- changed files
- implementation notes
- test results
- known limitations
```

---

# 21. Delegate Must Not Become the Main Orchestrator

The external delegate should not take ownership of the entire orchestration process unless explicitly designed for that behavior later.

Preferred MVP:

```text
Orchestrator
↓
Delegate focused implementation task
↓
Receive implementation
↓
Independent review
```

Avoid uncontrolled nested orchestration.

---

# 22. Multiple External Agents

Future versions may support:

```text
Adaptive Orchestrator
│
├── Delegate → Codex
├── Delegate → Claude
└── Reviewer
```

But the MVP should prefer:

```text
One delegated executor per phase
```

This keeps routing predictable and avoids unnecessary complexity.

---

# 23. Setup Flow

The package should include an initial setup command.

Example:

```bash
adaptive-orchestrator setup
```

The setup performs environment discovery.

---

# 24. Agent Discovery

During setup, Adaptive Orchestrator checks which agent tools are available.

Possible detections:

```text
Codex
Claude Code
Gemini CLI
OpenCode
Other supported coding agents
```

For each discovered agent, it should attempt to determine:

```text
Installed?
Authenticated?
Executable?
Available models?
Supported reasoning efforts?
Native sub-agents?
External delegation support?
```

Not every provider exposes all of this information.

If a capability cannot be detected, it should be marked as:

```text
Unknown
```

rather than guessed.

---

# 25. Subscription Detection

Adaptive Orchestrator should not assume a user's subscription tier.

Example:

```text
Codex CLI installed ✅
```

does not automatically mean:

```text
All Codex models available ✅
```

Detection should rely on actual provider/CLI capabilities.

Possible checks:

```text
CLI installed?
Authentication valid?
Configured model?
Can model be invoked?
Can supported models be listed?
```

If the provider does not expose model inventory, Adaptive Orchestrator stores only what can be verified.

---

# 26. Local Capability Registry

After setup, Adaptive Orchestrator builds a local registry.

Example:

```json
{
  "agents": {
    "codex": {
      "available": true,
      "authenticated": true,
      "models": ["detected-model-a"],
      "efforts": ["low", "medium", "high"],
      "subagents": true,
      "delegate": true
    },
    "claude": {
      "available": true,
      "authenticated": true,
      "models": ["detected-model-b"],
      "efforts": ["low", "medium", "high"],
      "subagents": true,
      "delegate": false
    }
  }
}
```

The actual schema may evolve.

---

# 27. Capability Profiles

The registry may also contain basic role suitability.

Example:

```text
Planner candidates:
- Claude
- Strong GPT reasoning model

Implementer candidates:
- Codex
- Claude

Reviewer candidates:
- Strong GPT reasoning model
- Claude

Fast candidates:
- lower-cost supported models
```

These should not be hardcoded permanently.

They should be derived from supported configurations and explicit project rules.

---

# 28. Setup: Delegate Detection

During setup:

```text
Delegate Skills detected?
├── Yes → Register capability
└── No → Offer installation
```

Example UX:

```text
Delegate Skills not detected.

Install delegate support now?

[Y] Yes
[N] No
```

No dependency should be installed silently.

---

# 29. Setup Completion Example

```text
Adaptive Orchestrator Setup

Detected:

✓ Codex
  Authenticated
  Sub-agent support available

✓ Claude Code
  Authenticated

✓ Delegate Skills
  Installed

✗ Gemini CLI
  Not installed

Policies:

✓ Native sub-agents enabled
✓ Delegate disabled by default
✓ Max reasoning disabled by default
✓ Usage-aware routing enabled

Setup complete.
```

---

# 30. Refresh

A refresh command can update the environment inventory.

```bash
adaptive-orchestrator refresh
```

Use cases:

```text
New agent installed
New CLI authenticated
Subscription changed
Model availability changed
Delegate installed later
```

---

# 31. Main CLI Commands

## Setup

```bash
adaptive-orchestrator setup
```

---

## Refresh

```bash
adaptive-orchestrator refresh
```

---

## Standard Execution

```bash
adaptive-orchestrator "Implement Stripe in Flutter"
```

---

## Allow Delegate

```bash
adaptive-orchestrator --delegate "Implement Stripe in Flutter"
```

---

## Allow Max Reasoning

```bash
adaptive-orchestrator --allow-max "Refactor payment architecture"
```

---

## Delegate + Max

```bash
adaptive-orchestrator --delegate --allow-max "Refactor payment architecture"
```

---

# 32. Default Policies

Default behavior:

```text
Native sub-agents: Enabled
Delegate: Disabled
Max reasoning: Disabled
Usage-aware routing: Enabled
Independent review: Enabled
Review/fix cycle: Maximum 1
```

---

# 33. Example: Implement Stripe in Flutter

User:

```bash
adaptive-orchestrator "Implement Stripe in Flutter"
```

Possible assessment:

```text
Task Size: Medium
Usage: Healthy
Delegate: Disabled
Max: Disabled
```

Routing:

```text
Plan
→ Strong Agent
→ High

Implement
→ Coding Agent
→ Medium

Review
→ Independent Strong Agent
→ High

Verify
→ Strong Agent
→ Medium
```

---

# 34. Example: Strong Parent Agent

Self-check:

```text
Planning: capable
Review: capable
Coordination: capable

Role:
Full Orchestrator
```

Execution:

```text
Parent
├── Plan itself
├── Spawn coding sub-agent
├── Spawn independent reviewer
└── Final verify
```

---

# 35. Example: Weak Parent Agent

Current environment:

```text
Parent Model: Weak
Parent Effort: Low
```

Self-check:

```text
Planning: insufficient
Review: insufficient
Coordination: sufficient
```

Result:

```text
Role:
Coordinator Only
```

Routing:

```text
Weak Parent
│
├── Strong Planner / High
├── Coding Implementer / Medium
├── Strong Reviewer / High
└── Strong Verifier / Medium
```

The weak parent does not approve the final implementation by itself.

---

# 36. Example: Partial Orchestrator

Self-check:

```text
Planning: capable
Coding: weaker than available alternative
Review: capable
```

Routing:

```text
Plan → Self
Implement → Coding Agent
Review → Self
Verify → Self
```

---

# 37. Example: Task Reclassification

User:

```text
Implement Stripe in Flutter
```

Initial:

```text
Task Size: Medium
```

Repository inspection finds:

```text
Custom backend
Saved cards
Refunds
Webhooks
Apple Pay
Complex payment state
```

Adaptive Orchestrator updates:

```text
Task Size:
Medium → Large
```

Then increases planning/review strength while attempting to keep implementation cost controlled.

---

# 38. Example: Usage Constrained

Environment:

```text
Usage State: Constrained
```

Routing:

```text
Plan → Medium
Implement → Medium
Review → High
Verify → Medium
```

The orchestrator reserves stronger reasoning for review.

---

# 39. Example: Max Enabled

User:

```bash
adaptive-orchestrator --allow-max "Implement Stripe in Flutter"
```

Possible routing:

```text
Plan → High
Implement → Medium
Review → Max
Verify → High
```

Max is only selected because it was explicitly permitted.

The orchestrator is still free to avoid Max.

---

# 40. Example: Review Finds an Issue

Implementation completes.

Reviewer reports:

```text
Blocking issue:
PaymentIntent may be confirmed twice.
```

Flow:

```text
Review
↓
Issue
↓
Focused Fix
↓
Re-review
↓
Final Verify
```

Possible output:

```text
Review found 1 blocking issue.

Fix applied.

Re-review passed.

Final verification passed.
```

---

# 41. Example: Review Still Fails

Flow:

```text
Implementation
↓
Review Failed
↓
Fix
↓
Re-review Failed
```

Output:

```text
Status: Blocked

Automatic review limit reached.

Remaining issue:
Payment state is still inconsistent.

No additional automatic review rounds started.
```

---

# 42. Example: Delegate Enabled

User:

```bash
adaptive-orchestrator --delegate "Implement Stripe in Flutter"
```

Possible routing:

```text
Plan
→ Native Strong Agent / High

Implement
→ External Delegate / Medium

Review
→ Native Independent Reviewer / High

Verify
→ Native Agent / Medium
```

---

# 43. Example: Delegate Enabled but Not Needed

`--delegate` grants permission.

It does not force delegation.

Adaptive Orchestrator may decide:

```text
Delegate available but not required.

Using native agents for this task.
```

---

# 44. Example: Weak Parent + Delegate

User runs:

```bash
adaptive-orchestrator --delegate "Implement Stripe in Flutter"
```

from a weak parent.

Routing:

```text
Weak Parent
↓
Coordinator Only
│
├── Strong Native Planner / High
├── External Delegate Implementer / Medium
├── Strong Native Reviewer / High
└── Strong Native Verifier / Medium
```

This is an important showcase of Adaptive Orchestrator.

---

# 45. User-Facing Runtime Output

The CLI should avoid overwhelming the user with internal details.

Recommended output:

```text
Adaptive Orchestrator

Task
Implement Stripe in Flutter

Assessment
- Size: Medium
- Current role: Coordinator only
- Usage: Healthy
- Max: Disabled
- Delegate: Enabled

Routing
- Plan → Strong Agent / High
- Implement → Delegate / Medium
- Review → Strong Agent / High
- Verify → Strong Agent / Medium

Execution
✓ Plan completed
✓ Implementation completed
⚠ Review found 1 issue
✓ Fix completed
✓ Re-review passed
✓ Final verification passed

Result
Verified
```

---

# 46. Internal vs User-Facing Information

Internally, Adaptive Orchestrator may track:

```text
Provider
Model
Reasoning effort
Agent identity
Execution method
Context
Usage state
Retry state
Review findings
```

The user-facing output should stay concise unless verbose/debug mode is later added.

---

# 47. Core Decision Model

The MVP decision can be summarized as:

```text
Task
+
Current Agent Capability
+
Available Agents
+
Available Models
+
Supported Efforts
+
Usage State
+
User Flags
=
Routing Decision
```

---

# 48. Routing Principles

Adaptive Orchestrator should follow these rules:

1. Do not assume the current agent is capable enough.
2. Do not use the strongest model everywhere.
3. Do not use the cheapest model everywhere.
4. Prefer independent review.
5. Preserve review quality when usage becomes constrained.
6. Never use Max unless explicitly enabled.
7. Use native sub-agents by default.
8. Use external delegates only when permitted.
9. Keep Adaptive Orchestrator as the top-level controller.
10. Avoid infinite review loops.
11. Do not guess unavailable provider capabilities.
12. Reclassify tasks when repository inspection changes the scope.

---

# 49. MVP Scope

Included:

```text
✓ CLI setup
✓ Agent discovery
✓ Capability registry
✓ Self capability check
✓ Full / Partial / Coordinator-only roles
✓ Small / Medium / Large classification
✓ Model selection per phase
✓ Effort selection per phase
✓ Native sub-agents
✓ Independent review
✓ One fix/re-review loop
✓ Final verification
✓ Usage-aware routing
✓ Max disabled by default
✓ --allow-max
✓ Delegate discovery
✓ Optional delegate installation during setup
✓ --delegate
✓ Refresh command
✓ Concise execution report
```

---

# 50. Not in MVP

Deferred:

```text
✗ Self-learning routing
✗ Historical performance optimization
✗ Complex token prediction
✗ Multi-delegate voting
✗ Agent marketplace
✗ Cloud dashboard
✗ Distributed execution
✗ Automatic rollback
✗ Multiple review rounds
✗ Advanced risk scoring
✗ Persistent project intelligence
✗ Automatic benchmark learning
```

These can be future versions.

---

# 51. Future Ideas

Possible future features:

## Smart Budget Modes

```text
Economy
Balanced
Quality
Maximum
```

---

## Multi-Agent Parallel Execution

```text
Agent A → implementation
Agent B → alternative approach
Agent C → review
```

---

## Specialized Reviewers

```text
Security Reviewer
Architecture Reviewer
Performance Reviewer
Database Reviewer
Flutter Reviewer
```

---

## Historical Learning

Example:

```text
Flutter state-management bugs
usually fail at Low effort
↓
Start at Medium next time
```

---

## Dynamic Context Management

Send only relevant context to each agent.

---

## Automated Benchmarking

Compare:

```text
Normal agent execution
vs
Adaptive Orchestrator
```

on:

```text
Cost
Token usage
Time
Review findings
Failure rate
Quality
```

---

# 52. Product Positioning

Weak positioning:

> A skill that plans, implements, and reviews code.

This is too generic.

Better positioning:

> Adaptive multi-agent orchestration for coding tasks.

Stronger positioning:

> Give Adaptive Orchestrator one coding task. It automatically chooses the right agent, model, and reasoning effort for every execution phase.

Potential short description:

> Adaptive Orchestrator dynamically routes planning, implementation, review, fixing, and verification across the best available coding agents while controlling reasoning usage.

---

# 53. Main Differentiator

The main differentiator is not:

```text
Sub-agents
```

because sub-agents already exist.

It is not:

```text
Plan → Implement → Review
```

because structured workflows already exist.

The key differentiator is:

```text
Adaptive Routing
```

Specifically:

```text
Who should do the phase?
+
Which model?
+
Which reasoning effort?
+
Should the current agent do it?
+
Should a stronger agent take over?
+
Should an external delegate be used?
+
Can usage afford stronger reasoning?
```

---

# 54. MVP Value Proposition

Adaptive Orchestrator aims to provide:

```text
Better quality than weak single-agent execution
+
Lower waste than using maximum reasoning everywhere
+
Less manual orchestration
+
Independent review
+
Automatic use of available agent capabilities
```

---

# 55. Success Metrics

The product should eventually be tested against normal coding-agent workflows.

Possible metrics:

```text
Token usage
Cost
Execution time
Number of failed attempts
Review issues found
Build/test success
Task completion rate
User intervention count
```

Example benchmark:

```text
Normal Agent

Usage: X
Review misses: Y
Manual interventions: Z
```

versus:

```text
Adaptive Orchestrator

Usage: lower/similar
Review quality: equal or better
Manual interventions: lower
```

The product becomes much stronger if these improvements can be demonstrated.

---

# 56. Proposed Package Experience

Installation:

```bash
npm install -g adaptive-orchestrator
```

Setup:

```bash
adaptive-orchestrator setup
```

Run:

```bash
adaptive-orchestrator "Implement Stripe in Flutter"
```

Optional external delegate:

```bash
adaptive-orchestrator --delegate "Implement Stripe in Flutter"
```

Allow Max reasoning:

```bash
adaptive-orchestrator --allow-max "Refactor payment architecture"
```

Refresh environment:

```bash
adaptive-orchestrator refresh
```

---

# 57. Final MVP Architecture

```text
                       ┌──────────────────────┐
                       │      User Task       │
                       └──────────┬───────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────┐
                  │ Self Capability Assessment   │
                  └──────────────┬───────────────┘
                                 │
              ┌──────────────────┼───────────────────┐
              ▼                  ▼                   ▼
      Full Orchestrator   Partial Orchestrator   Coordinator Only
              │                  │                   │
              └──────────────────┴───────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Agent Capability Registry    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Usage + User Policy Check    │
                  │ Delegate? Max Allowed?       │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Task Classification          │
                  │ Small / Medium / Large       │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Adaptive Phase Routing       │
                  │ Agent + Model + Effort       │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Plan                         │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Implement                    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Independent Review           │
                  └──────────────┬───────────────┘
                                 │
                         ┌───────┴───────┐
                         │               │
                     Issues? No      Issues? Yes
                         │               │
                         │               ▼
                         │        ┌──────────────┐
                         │        │ Focused Fix  │
                         │        └──────┬───────┘
                         │               │
                         │               ▼
                         │        ┌──────────────┐
                         │        │ Re-review    │
                         │        └──────┬───────┘
                         │               │
                         └───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Final Verification           │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │ Final Result / Report        │
                  └──────────────────────────────┘
```

---

# 58. MVP Definition

Adaptive Orchestrator MVP:

> A CLI-based coding orchestration layer that discovers the user's available coding agents, evaluates whether the current agent is capable of orchestrating the task, then dynamically assigns planning, implementation, review, fixing, and verification to the most appropriate available agents using adaptive model and reasoning-effort selection.

Default behavior:

```text
Native sub-agents
Adaptive model routing
Adaptive effort routing
Independent review
Usage-aware execution
Max disabled
Delegate disabled
```

Optional:

```text
--delegate
--allow-max
```

---

# 59. One-Line Product Description

> **Adaptive Orchestrator gives one coding task to the right agents, models, and reasoning levels automatically.**

---

# 60. Short Technical Description

> Adaptive Orchestrator is an adaptive multi-agent execution layer that discovers available coding agents, assesses orchestration capability, routes each development phase to the most suitable agent/model/effort combination, performs independent review and verification, and optionally integrates external delegate executors.

---

# 61. MVP Development Goal

The first implementation should prove three things:

1. Adaptive routing actually works.
2. Weak parent agents can safely escalate critical work.
3. The system can improve quality and/or reduce unnecessary reasoning usage compared with a fixed single-agent workflow.

Everything else can evolve after that proof.
