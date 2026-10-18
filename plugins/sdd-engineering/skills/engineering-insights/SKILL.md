---
name: engineering-insights
description: >-
      Captures non-obvious engineering insights — patterns, antipatterns, 
      codebase/tool quirks, decisions, recurring errors, open questions — 
      into the touched module's INSIGHTS.md (when the project keeps one), after checking they aren't 
      already recorded. Use when starting work in a module 
      (read its INSIGHTS.md first), and at the end of any task or session 
      where something non-obvious was learned; skip only for genuinely 
      trivial edits. Triggers: "/engineering-insights", "insights", 
      "INSIGHTS.md", "wrap up", "what did we learn", "record this", 
      "lesson learned", "retro", "session review".
---

# Engineering Insights

- [ ] Read the module's `INSIGHTS.md` before starting work here — skim it, don't just load it
- [ ] At session end: would a future session change its behavior, or save real
      time, because of this? If not, write nothing
- [ ] Check the matching section first — already recorded → skip; changed or
      contradicted → add a new dated note, don't rewrite the old entry
- [ ] Edit by INSERTING the new entry only (right under the section heading,
      above existing entries) — never regenerate or rewrite the file; every
      existing line stays byte-for-byte as it was

**Non-negotiable:** additive edits only. Never read the whole file and write
back a "cleaned up" version — that's how existing entries get silently lost.

Rubrics = the module's `INSIGHTS.md` section headers: What Works, What
Doesn't Work, Codebase Patterns, Tool & Library Notes, Recurring Errors &
Fixes, Session Notes, Open Questions. **What Doesn't Work is the one most
often skipped and the highest-signal — don't skip it.**

Destination = the `INSIGHTS.md` of whichever module the session's changes actually
touched (module layout comes from the project's `AGENTS.md` or its top-level
directories); multiple modules touched → append to each. If the project has no
`INSIGHTS.md` convention (no such file in the touched module or at the root), write
nothing and say so; do not create the convention on your own.

Cap it: at most a couple of entries per session, not everything that
happened. Anti-vague bar: actionable cold, with a `file:line` pointer — if any
reader of the code would already know it, don't write it.
