---
max_turns: 10
allowed_tools: [Skill, Read, Glob, Grep]
---

Check that this plugin and its dependencies are reachable through their plugin namespaces. Do not launch any agent.

1. Use the Skill tool to load `engineering-paved-path:onion-architecture`.
2. Use the Skill tool to load `sdd-engineering:mermaid-diagram`.
3. List every subagent type available to you whose name starts with `sdd-engineering:`, `research-tools:` or `architecture-review:`.

Answer with three short sections, one per step. For steps 1 and 2 say "loaded" or "failed" and quote the first heading of the skill text you received. For step 3 list the names exactly as you see them.
