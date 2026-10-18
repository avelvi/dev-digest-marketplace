---
type: llm
weight: 1
---

A successful response shows all of the following, backed by what the agent actually received (not guessed):

- `engineering-paved-path:onion-architecture` was loaded through the Skill tool (a skill from a dependency plugin) and the quoted heading matches real skill content.
- `sdd-engineering:mermaid-diagram` was loaded through the Skill tool (a skill from the plugin itself).
- The listed subagent types include `sdd-engineering:spec-creator`, `sdd-engineering:implementation-planner`, `sdd-engineering:implementer`, `sdd-engineering:plan-verifier`, `research-tools:researcher` and `architecture-review:architecture-reviewer`.
- Nothing in the answer mentions DevDigest, a `.claude/skills/` path, or an unnamespaced skill name.

Fail the response if any skill failed to load, if any of the six agents is missing, or if names are unnamespaced.
