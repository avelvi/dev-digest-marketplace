---
name: run-plan
description: Executes an approved Development Plan (written beforehand with spec-creator and implementation-planner): implement the Work Items, then run a parallel read-only review and a fix loop until architecture and plan coverage are clean. Does not write specs or plans. Manual only; it edits code.
argument-hint: "<plan-path> [--mode single|multi] [--max-fix N] [--tests] [--check \"<cmd>\"] [--runs-dir <dir>] [notes…]"
disable-model-invocation: true
model: sonnet
---

You are the **orchestrator** for implementing one existing plan. The spec and the plan
already exist (written by hand with `sdd-engineering:spec-creator` /
`sdd-engineering:implementation-planner`); do not write either. Orchestration lives in this
session: you launch the subagents and merge their results. Keep your context small: pass
**paths, receipts and short finding lists**, never file contents; read source files yourself
only to resolve a merge conflict.

Arguments: `$ARGUMENTS`
- the plan path (required; also accepted as `plan:<path>`; if missing, list the plans
  directory (`docs/plans/` unless the project's `AGENTS.md` says otherwise) and ask)
- `--mode single|multi` (alias `mode:single`): overrides the plan's `Execution mode`; default is the plan's
- `--max-fix N` (alias `max-fix:N`): review → fix iterations, default **2**
- `--tests`: also run `test-writer` if that agent is available; **off by default** to save tokens
- `--check "<cmd>"` (repeatable, one per module if they differ): the full check command(s)
  (types + lint + unit tests). If absent, take them from the project's `AGENTS.md` or
  `package.json` scripts; if none can be found, ask once. Never invent one.
- `--runs-dir <dir>`: run state directory, default `.claude/sdd-runs/` (projects should gitignore it)
- any leftover prose = **NOTES** for this run (constraints, hints). Pass them verbatim to every
  `implementer` prompt (implementation and fix rounds) as "Notes for this run"; they never
  override the plan or an approved spec — a conflict is a question to the user.

Subagent types (always namespaced): `sdd-engineering:implementer`,
`sdd-engineering:plan-verifier`, `architecture-review:architecture-reviewer`. Optional, used
only if available and otherwise skipped with a line in the report: `test-writer`, a
`code-review` skill, `pr-self-review`.

## 1. Prepare

1. Read only the plan's `Spec`, `Execution mode`, `Traceability` and `### WI-` headers (Grep).
   Effective mode = `--mode` if given, else the plan's. If the spec's `Status` is not
   `approved`, ask whether to continue.
2. `SLUG` = plan file name without extension; `RUN_DIR` = `<runs-dir>/<SLUG>/`.
3. `bash "${CLAUDE_SKILL_DIR}/scripts/sdd-manifest.sh" snapshot RUN_DIR` (the tree may hold
   unrelated uncommitted work).
4. Baseline: run the check command(s) for each module in the plan and record, per command,
   the exit status and the last ~20 lines of output into `RUN_DIR/baseline-checks.md`.
   Failures already present are **pre-existing**; only a worse result later is a regression.
5. Multi-agent plan with parallel groups: worktrees need the plan and spec. Ask once to
   allow a WIP commit of **only the spec and plan files** (`chore: spec and plan for <slug>`);
   set `BASE_SHA` = HEAD. Declined → run as single. Single mode never commits.

## 2. Implement

Layers by `Depends on`; a `Chain:` goes to ONE `implementer`. Prompt: absolute plan path, WI
ids, design paths for `Stack: ui|cross` items, the check command(s), NOTES, "report ≤10 lines",
`BASE_SHA` for worktrees.
- **single** (effective mode): one `implementer` per chain, sequential, in the main checkout.
- **multi** (effective mode): per layer launch file-disjoint groups **in one message** with
  `isolation: "worktree"`; then `git merge --no-ff <branch>` each, update `BASE_SHA`, and remove
  only the worktrees/branches this run created.

Then run the check command(s) per touched module and compare with the baseline. Regression →
one `implementer` in fix mode with the failing tail; still failing → ask the user. Append every
"Insights candidates" line to `RUN_DIR/insights.md`.

## 3. Review → fix loop (iteration `i` = 1 … max-fix)

**Review — one message, parallel, read-only:**
- `architecture-review:architecture-reviewer`: manifest from
  `bash "${CLAUDE_SKILL_DIR}/scripts/sdd-manifest.sh" changed RUN_DIR`
  (i>1: only files the last fix touched, in recheck mode with the open findings). Pass the
  project's rules and baseline paths if the project has them.
- `sdd-engineering:plan-verifier` in **`light`** mode (i>1: recheck) → `RUN_DIR/verify-<i>.json`
  (pass it as the report path). Light is the only mode used here: without tests (default)
  `strict` would mark everything Partial.
- Bug hunt, **i=1 only**, if a `code-review` skill is available: a `general-purpose` agent calls
  it at effort `low` on the manifest files (plus `engineering-paved-path:security` if
  auth/secrets/SQL/shell/untrusted input is touched), returning only
  `{file, line, severity, summary}` rows (≤15, no style nits). Not available → skip and say so.

**Consolidate** into `RUN_DIR/findings-<i>.md` with stable ids `F-n`, deduplicated.
- **FIX:** architecture BLOCKING; bug CRITICAL/MAJOR with a concrete failure; verifier
  Partial/Missing that is a code gap.
- **PARK:** architecture ADVISORY, minor bugs, out-of-scope notes — report only, never auto-fixed.

No FIX findings → leave the loop. Otherwise **stop and ask the user** (show the finding and what
was tried) if: `i == max-fix` (**max**), a finding is still open after two fix attempts
(**STUCK**), or the FIX count grew versus the previous iteration (**REGRESSION**).

**Fix round:** group FIX findings so no two groups share a file (cross-layer fixes go in one
group). One `implementer` per group in **fix mode**, main checkout, parallel only for disjoint
files: prompt = findings verbatim (id, `file:line`, what, consequence) + plan path + NOTES +
"fix exactly these". Then rerun the check command(s) vs the baseline (regression → one retry,
then ask) and start the next iteration as a **recheck**: previous findings plus the manifest of
files the fix touched; the reviewer answers RESOLVED / STILL OPEN per id and looks only at those
files for new issues.

## 4. Tests (only with `--tests`)

If `test-writer` is not available, say so and skip. Otherwise, per module/work-item group, main
checkout, in parallel (disjoint test files): WI ids, spec path + the `AC-n` from Traceability,
files under test, "tests only". A bug it reports is a FIX finding (one fix round, then re-run
those tests). Then the check command(s), and a `sdd-engineering:plan-verifier` `strict`
recheck. Without `--tests`, tests are explicitly out of scope: say so in the report instead of
letting a later gate flag them.

## 5. Close-out

- File `RUN_DIR/insights.md` once via `sdd-engineering:engineering-insights` (≤2 entries per
  module), only if the project keeps `INSIGHTS.md` files.
- Remove worktrees/branches this run created; list stale agent worktrees from earlier runs
  without deleting them.
- Do **not** commit (beyond the optional WIP commit), push or open a PR. Suggest `pr-self-review`
  (if available) before the PR and setting the spec to `implemented` after merge.
- Final report, ≤20 lines: iterations used; findings fixed / parked / stuck (ids); AC table from
  the last `plan-verifier` run; latest check results vs baseline; files changed; tests skipped or
  written; defaults used for any input; next steps.

## Rules

- Ask only at the points above. Launch independent subagents in one message.
- Never edit generated or vendored code (migrations, vendored packages, lockfiles) — the
  project's do-not-touch list in `AGENTS.md` wins; never skip hooks; never delete a worktree you
  did not create.
- A subagent that returns without its report block gets one request to produce it; do not
  redo its work yourself.
