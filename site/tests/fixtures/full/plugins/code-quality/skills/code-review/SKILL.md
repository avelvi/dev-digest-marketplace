---
name: code-review
description: "Code review for a diff, branch or pull request: finds bugs, unclear code and missing tests. Use before merging or when asked for a review."
keywords: [review, code review, PR, diff, pull request]
allowed-tools: Read, Grep, Glob, Bash(git diff:*)
argument-hint: "[branch | PR number]"
---

## When to use

Use before merging, or when the user asks for a review of a diff, branch or pull request.

## Steps

- Get the diff with `git diff <base>...HEAD`
- Read every changed file in full, not only the hunks
- Check for bugs, unclear names, missing error handling and missing tests
- Group findings by severity: blocking, should fix, nit

## Output

```
### Blocking
- src/auth.ts:42  token is written to the log

### Should fix
- src/api/users.ts:88  no test for the 404 branch
```
