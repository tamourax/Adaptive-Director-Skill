# Example: Critical Fix Cycle Walkthrough

This example illustrates how **Adaptive Director Skill** handles a detected security flaw during Independent Review, executing an automated 1-cycle targeted fix before verification.

---

## 1. User Request
```text
Use $adaptive-director-skill to add Stripe webhook processing endpoint.
```

## 2. Director Initialization
- **Classification:** `medium`
- **Budget:** `balanced`
- **Phases:** `plan` → `implement` → `review` → `[fix if critical]` → `verify`

---

## 3. Review Detects a Critical Security Flaw
After Codex completes initial implementation of `src/routes/webhook.js`:

Independent Reviewer (Claude) audits the diff and reports:
```text
[CRITICAL] Missing raw body parsing on Stripe webhook endpoint
File: src/routes/webhook.js:14
Description: stripe.webhooks.constructEvent requires the unparsed Buffer of the request body. Using JSON.parse or express.json() alters whitespace and causes signature verification to consistently fail in production.
```

The Director parses the output:
- Critical findings: `1`
- Triggers: Automated Fix Cycle (Cycle 1 of 1 max)

```bash
node scripts/run-state.mjs write-phase \
  --run-id run-4f92c1 \
  --phase review \
  --status needs_fix \
  --summary "Found 1 critical signature verification issue" \
  --findings-json '[{"severity":"critical","title":"Missing raw body parsing","file":"src/routes/webhook.js"}]'
```

---

## 4. Automated 1-Cycle Targeted Fix
- **Agent Assigned:** Codex (Medium Effort)
- **Brief:** Handed `brief-fix.md` generated from `templates/fix-brief.md` containing strictly the single CRITICAL finding.
- **Strict Boundary:** Codex is prohibited from redesigning other routes.
- **Resolution:** Codex configures `express.raw({ type: 'application/json' })` exclusively for the webhook route in `src/app.js`.

```bash
node scripts/run-state.mjs write-phase \
  --run-id run-4f92c1 \
  --phase fix \
  --status completed \
  --summary "Applied express.raw parser for Stripe endpoint"
```

---

## 5. Re-Review
- **Agent Assigned:** Claude (Independent Reviewer)
- **Result:** Confirms webhook endpoint correctly receives raw payload buffer and signature check passes with mock payload.
- **Critical findings remaining:** `0`

---

## 6. Verification & Completion
- **Test:** Runs `npm test tests/webhook.test.js` → `Pass (4/4)`
- **Status:** `STATUS: VERIFIED`
- All changes cleanly staged in workspace without automatic commits.
