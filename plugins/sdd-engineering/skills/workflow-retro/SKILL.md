---
name: workflow-retro
description: >-
  MANUAL ONLY — runs only when the user types /workflow-retro. Retrospective of
  a multi-agent workflow or subagent-heavy session: per-agent metrics table,
  totals, launch order, critical path, what went well / what was wasted,
  concrete proposals; prints to chat and appends to a ledger file (default docs/retro/ledger.md). Add
  `deep` to read transcripts from disk.
disable-model-invocation: true
---

# Workflow Retro

**Manual only.** Never start this on your own: not after a Workflow run, not at
session end, not from another skill or agent. If the user hasn't typed
`/workflow-retro`, don't run it (you may *mention* it exists, once).

Usage: `/workflow-retro [deep] [--ledger <path>]` — in-context by default, `deep` adds transcripts;
`--ledger` sets the ledger file (default `docs/retro/ledger.md`, or the path the project's `AGENTS.md` names).
Answer in the user's language.

## 1. Gather data

**Default — in context.** Use only what this conversation already contains:
Workflow results and `<task-notification>` blocks (`subagent_tokens`,
`tool_uses`, `duration_ms`), the agents' hand-back reports, launch order. Label
every figure "from context". Known limits of this mode:
- `subagent_tokens` is **not** the transcript token sum (checked: 150,917 vs
  307,693 fresh / 1.68M total for the same agent) — show it as its own column,
  never mix it with `deep` numbers.
- `tool_uses` and `duration_ms` are per run segment; add segments of a resumed
  agent. Waiting time (user answers, resumes) is not separated.
- No in/out/cache split, no hit%, no active vs idle. Write `n/a`; never guess.

**`deep` — from disk.** Run:

```bash
python3 -I "${CLAUDE_SKILL_DIR}/scripts/collect.py" [--session <id>] [--since <ISO ts>] [--idle-gap <s>] > /tmp/retro.json
```

No `--session` = newest transcript of this project (the session id is the
`.jsonl` name under `~/.claude/projects/<slug>/`, not the `/tmp/claude-*/` dir).
`--since` when the session was resumed or `/clear`ed. Output:
- per agent: `type`, `depth`, `parent` (`main` or an agent id), `tokens`
  (input / cache_write / cache_read / output), `hit_pct`, `tools`, `tool_errors`,
  `span_s`, `active_s`, `idle_s`, `idle_gaps` (waits above `--idle-gap`, default
  60 s — usually a `SendMessage` resume or a user answer), `phase`,
  `overlaps_previous`, `repeated_bash`;
- `totals`: `agents`, tokens, `cache_hit_pct`, `tools`, `wall_s` (first start →
  last end, can span days), `busy_s` (time with ≥1 agent running),
  `parallelism` (= Σ span / `busy_s`), `launch_order` (groups; `parallel` when
  starts are within 30 s; `t_plus_s` offset from first start), `critical_path`;
- `duplicate_reads`, `workflows` (journal counts).

Then skim transcripts of agents with errors, retries, large `idle_s` or top
token spend. If the script fails, say so and fall back to in-context mode.

## 2. Report (chat; this shape, scannable)

1. **Header** — `Workflow Retro — <name>`, then a Run line: chain (e.g.
   `spec-creator → 4×researcher`), N agents, mode `single | fan-out | chain`,
   data `in-context | deep`.
2. **Metrics table** — one row per agent, children indented with `└`:
   agent id (first 6) · role · depth · in · out · cache-read · hit% · tools · span.
   In-context mode: replace in/out/cache/hit% with the `subagent_tokens` column.
   **No cost / dollars** — tokens only.
3. **Totals** line — in · out · cache-read · cache hit % · tools · wall ·
   parallelism (deep); from-context sums otherwise.
4. **Launch order** line — `a → (b, c ‖) → … → d (+8 min, during a resume)`;
   flag sequential chains with no data dependency. **Critical path** line — the
   longest agent. **Caveat** line when `idle_s` is a big share of span: give
   active vs idle (span alone overstates the work).
5. **What went well** — with evidence (cache hit, correct delegation, clean runs).
6. **What was hard or wasted** — with evidence (agent, file path, error text):
   tool errors and retries, long idle waits, content read by several agents
   (`duplicate_reads`), repeated commands, overlapping findings, plan/spec items
   no report covers, checks nobody ran.
7. **Proposals** — up to 5, ordered by expected saving. Each is concrete and
   ready to adopt: the exact change (prompt wording, agent split/merge, step to
   parallelize, shared context to pre-load, verification to add), the file it
   touches, the expected effect. **Propose, don't apply** — edit those files
   only if the user then says so.

## 3. Ledger — `docs/retro/ledger.md` (or `--ledger <path>`)

Append one entry per run; create the file with a `# Retro ledger` header if it
doesn't exist. **Append-only**: add at the end, never rewrite, reorder or
"tidy" earlier entries. Read the tail first; if the same run is already logged,
skip it.

```markdown
## <YYYY-MM-DD> — <workflow or task name> (<in-context|deep>)
- Run: <session/run id or "this session"> · <N agents> · <tokens> · <wall/busy> · parallelism <x> · cache hit <y>% (deep only)
- Order: <phase: agent → agent || agent …>
- Module insights:
  - `<module or area tag>`: <insight, actionable cold, evidence>
- Proposals: <one line each> — status: open
```

Module insights live **here**, grouped by a free-form module or area tag — do not write them to
any `INSIGHTS.md` from this skill. Keep to insights a future run would act on;
skip anything any reader of the code would already know.

## Rules

- Every claim cites a number or a quote from the data. No evidence → omit it,
  and never invent a table cell (`n/a`).
- Separate "this run" facts from "in general" advice; never present a guess as a
  measurement.
- Tokens only. No dollars, no price table.
- Clean run → say so in two lines; don't pad.
- The only file this skill writes is the ledger file.
