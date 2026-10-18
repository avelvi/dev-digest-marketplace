A small set of tools for checking changes before they reach `main`.

## What's inside

- `code-review` skill: finds bugs, unclear code and missing tests in a diff
- `/review-pr` command: checks the current branch against a base branch
- `PostToolUse` hook: runs Prettier after every edit

See the [hook config](hooks/hooks.json) and the [contributing guide](../../CONTRIBUTING.md).

![diagram](docs/diagram.png)

## Requirements

The hook expects Prettier in the project. Install it with `npm i -D prettier`.
