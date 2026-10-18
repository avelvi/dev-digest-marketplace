#!/usr/bin/env bash
#
# Tracks which files an SDD run changed, even in a working tree that already
# had unrelated uncommitted edits (a plain `git diff` would include those).
# Operates on the git repository of the current working directory.
#
# Usage:
#   sdd-manifest.sh snapshot <dir>          record HEAD + content hash of every dirty/untracked file
#   sdd-manifest.sh changed  <dir>          print files whose content differs from the snapshot
#   sdd-manifest.sh changed  <dir> <prefix> same, restricted to one path prefix (e.g. a module dir)
#
# <dir> is the run state directory (default used by run-plan: .claude/sdd-runs/<slug>/),
# relative to the repository root (or absolute); the snapshot lives in <dir>/baseline.txt. Paths under .claude/sdd-runs/ and
# .claude/worktrees/ are never reported.
# Bash 3.2 compatible.

set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not inside a git repository" >&2; exit 2; }
cd "$ROOT"

sub="${1:-}"; dir="${2:-}"; mod="${3:-}"
[ -n "$dir" ] || { sed -n '3,14p' "$0"; exit 2; }
mkdir -p "$dir"
BASE="$dir/baseline.txt"

hash_of() { if [ -f "$1" ]; then git hash-object "$1"; else echo DELETED; fi; }

dirty_now() { { git ls-files -m; git ls-files -o --exclude-standard; git ls-files -d; } | sort -u; }

case "$sub" in
  snapshot)
    { echo "HEAD $(git rev-parse HEAD)"
      dirty_now | while IFS= read -r f; do [ -n "$f" ] && echo "F $(hash_of "$f") $f"; done
    } > "$BASE"
    echo "snapshot: $(grep -c '^F ' "$BASE") dirty files at $(git rev-parse --short HEAD) -> $BASE"
    ;;
  changed)
    [ -f "$BASE" ] || { echo "no snapshot at $BASE" >&2; exit 2; }
    snap_head="$(awk '/^HEAD /{print $2}' "$BASE")"
    { dirty_now; git diff --name-only "$snap_head" HEAD; } | sort -u | while IFS= read -r f; do
      [ -z "$f" ] && continue
      case "$f" in .claude/sdd-runs/*|.claude/worktrees/*) continue ;; esac
      [ -n "$mod" ] && case "$f" in "$mod"/*) ;; *) continue ;; esac
      cur="$(hash_of "$f")"
      old="$(grep -F " $f" "$BASE" | awk -v p="$f" '$3==p{print $2; exit}')"
      if [ -z "$old" ]; then
        old="$(git rev-parse -q --verify "$snap_head:$f" 2>/dev/null || echo NONE)"
      fi
      [ "$cur" != "$old" ] && echo "$f"
    done
    ;;
  *) sed -n '3,14p' "$0"; exit 2 ;;
esac
