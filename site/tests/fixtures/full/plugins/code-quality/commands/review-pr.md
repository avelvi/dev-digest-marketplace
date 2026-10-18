---
description: Checks the current branch against a base branch and prints findings grouped by severity.
argument-hint: "[base-branch]"
allowed-tools: Bash(git:*), Read
---

Compares the current branch with `$ARGUMENTS` (default `main`).

Prints findings grouped by severity, then a one-line verdict.
