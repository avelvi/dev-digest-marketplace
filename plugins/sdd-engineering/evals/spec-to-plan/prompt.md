---
max_turns: 40
allowed_tools: [Read, Write, Glob, Grep, Skill, Agent, AskUserQuestion]
---

I have no design documents, only this description. Do not ask me questions: every open point has a stated answer below, so use them and proceed.

Feature: "export a list of invoices as CSV". Context: a small project with no existing code. Decisions: one module, specs directory `specs/`, plans directory `docs/plans/`, single-agent execution mode, no UI beyond a single "Export CSV" button, columns are id, customer, amount, issued_at, the file is named `invoices.csv`, an empty list produces a header-only file, there are no authentication requirements, and the spec may be marked approved.

Step 1: use the `sdd-engineering:spec-creator` agent to write the spec.
Step 2: use the `sdd-engineering:implementation-planner` agent to write a plan from that spec.
Finish by listing the two files that were written and the acceptance criteria ids each Work Item covers.
