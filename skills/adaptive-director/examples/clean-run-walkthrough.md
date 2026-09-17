# Example: Clean Run Walkthrough

This example illustrates a standard, happy-path execution of **Adaptive Director Skill** with no critical review findings.

---

## 1. User Request
```text
Use $adaptive-director-skill to add JWT authentication middleware to our Express API.
```

## 2. Director Initialization
- **Classification:** `medium` (New API middleware feature)
- **Budget:** `balanced`
- **Phases:** `plan` → `implement` → `review` → `verify`

```bash
# Director queries routing engine
node scripts/route.mjs --input '{"taskSize":"medium","phase":"plan","budget":"balanced"}'
# → {"agent":"claude","model":"claude-sonnet-4-5","effort":"high","execution":"native"}

node scripts/route.mjs --input '{"taskSize":"medium","phase":"implement","budget":"balanced"}'
# → {"agent":"codex","model":"codex-default","effort":"medium","execution":"native"}

node scripts/route.mjs --input '{"taskSize":"medium","phase":"review","budget":"balanced"}'
# → {"agent":"claude","model":"claude-sonnet-4-5","effort":"high","execution":"native"}

# Director initializes isolated run workspace on disk
node scripts/run-state.mjs init --task "Add JWT authentication middleware" --size medium --budget balanced
# → {"runId":"run-8a3f1b","workspacePath":".adaptive-director/runs/run-8a3f1b"}
```

---

## 3. Phase 1: Planning
- **Agent Assigned:** Claude (High Effort)
- **Brief:** Director generates `.adaptive-director/runs/run-8a3f1b/brief-plan.md` using `templates/plan-brief.md`.
- **Output:** Planner specifies creating `src/middleware/auth.js` and updating `src/routes/api.js`. Planner confirms task size remains `medium`.

```bash
node scripts/run-state.mjs write-phase --run-id run-8a3f1b --phase plan --status completed --summary "Created plan for JWT middleware"
```

---

## 4. Phase 2: Implementation
- **Agent Assigned:** Codex (Medium Effort)
- **Brief:** Handed `brief-implement.md` containing plan and non-goals.
- **Output:** Codex creates `src/middleware/auth.js` and writes unit tests in `tests/auth.test.js`. Leaves changes uncommitted.

```bash
node scripts/run-state.mjs write-phase --run-id run-8a3f1b --phase implement --status completed --summary "Implemented JWT middleware and test suite"
```

---

## 5. Phase 3: Independent Review
- **Agent Assigned:** Claude (High Effort — new independent session)
- **Brief:** Handed `brief-review.md` containing diff and acceptance criteria.
- **Findings:**
  - `[WARNING] JWT secret fallback in development mode`
  - `[SUGGESTION] Consider extracting token verification logic to helper`
  - Critical findings: `0`

```bash
node scripts/run-state.mjs write-phase --run-id run-8a3f1b --phase review --status completed --summary "Review passed with 0 critical issues"
```

---

## 6. Phase 4: Final Verification
- **Automated Verification:** Runs `npm test`
- **Result:** All 14 tests passing (including 3 new auth tests).
- **Verdict:** `STATUS: VERIFIED`

```bash
node scripts/run-state.mjs update --run-id run-8a3f1b --status completed
```

---

## 7. Delivery
Director outputs final task report with list of changed files, warning notes, and uncommitted git state ready for developer review.
