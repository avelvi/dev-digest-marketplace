---
type: llm
weight: 1
---

A successful response shows that both files were really written (paths are listed and the agent read them back or reported them), and that:

- the spec is under `specs/`, uses numbered acceptance criteria (`AC-1`, `AC-2`, ...) in EARS style, and covers the empty-list case and the column set;
- the plan is under `docs/plans/`, contains numbered Work Items each with module, dependencies, files and acceptance criteria, and every `AC-n` of the spec is covered by at least one Work Item;
- the plan chose single-agent mode as instructed;
- no source code or test files were written;
- nothing refers to DevDigest or to fixed project paths other than the two directories named in the prompt.

Fail the response if either file is missing, if an `AC-n` is untraced, or if code was written.
