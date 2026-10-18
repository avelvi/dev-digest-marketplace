#!/usr/bin/env python3
"""Collect run metrics for a Claude Code session: tokens, agent tree, order, active vs idle time, tool errors, duplicate reads.

Usage: python3 -I collect.py [--session <id>] [--project-dir <dir>] [--since <ISO ts>] [--idle-gap <s>]
Prints one JSON document to stdout. Read-only.
"""
import argparse, collections, glob, json, os, re, sys
from datetime import datetime

PARALLEL_WINDOW_S = 30


def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")) if s else None


def project_dir(explicit):
    if explicit:
        return explicit
    slug = re.sub(r"[^A-Za-z0-9]", "-", os.getcwd())
    return os.path.expanduser(f"~/.claude/projects/{slug}")


def read_jsonl(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            try:
                yield json.loads(line)
            except ValueError:
                continue


def hit_pct(tok):
    denom = tok.get("input", 0) + tok.get("cache_write", 0) + tok.get("cache_read", 0)
    return round(100 * tok.get("cache_read", 0) / denom) if denom else None


def summarize(path, since, idle_gap):
    """Fold one transcript into usage, tool counts, errors, reads and active/idle time."""
    usage_by_msg = {}
    tools = collections.Counter()
    reads = collections.Counter()
    cmds = collections.Counter()
    errors = []
    tool_names = {}
    times = []
    model = None
    for d in read_jsonl(path):
        t = ts(d.get("timestamp"))
        if t and since and t < since:
            continue
        if t:
            times.append(t)
        m = d.get("message")
        if not isinstance(m, dict):
            continue
        content = m.get("content")
        if d.get("type") == "assistant":
            model = m.get("model") or model
            if m.get("usage"):
                usage_by_msg[m.get("id") or d.get("uuid")] = m["usage"]
            for b in content if isinstance(content, list) else []:
                if b.get("type") == "tool_use":
                    tools[b["name"]] += 1
                    tool_names[b["id"]] = b["name"]
                    inp = b.get("input") or {}
                    if b["name"] == "Read" and inp.get("file_path"):
                        reads[inp["file_path"]] += 1
                    if b["name"] == "Bash" and inp.get("command"):
                        cmds[inp["command"][:120]] += 1
        elif d.get("type") == "user":
            for b in content if isinstance(content, list) else []:
                if b.get("type") == "tool_result" and b.get("is_error"):
                    body = b.get("content")
                    if isinstance(body, list):
                        body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                    errors.append({"tool": tool_names.get(b.get("tool_use_id"), "?"),
                                   "error": (body or "")[:200].replace("\n", " ")})
    tok = collections.Counter()
    for u in usage_by_msg.values():
        tok["input"] += u.get("input_tokens", 0)
        tok["cache_write"] += u.get("cache_creation_input_tokens", 0)
        tok["cache_read"] += u.get("cache_read_input_tokens", 0)
        tok["output"] += u.get("output_tokens", 0)

    times.sort()
    active = 0.0
    idle_gaps = []
    for a, b in zip(times, times[1:]):
        gap = (b - a).total_seconds()
        if gap <= idle_gap:
            active += gap
        else:
            idle_gaps.append({"after": a.isoformat(), "seconds": round(gap, 1)})
    span = (times[-1] - times[0]).total_seconds() if times else None
    return {
        "model": model,
        "start": times[0].isoformat() if times else None,
        "end": times[-1].isoformat() if times else None,
        "span_s": round(span, 1) if span is not None else None,
        "active_s": round(active, 1),
        "idle_s": round(max(span - active, 0.0), 1) if span is not None else None,
        "idle_gaps": idle_gaps,
        "turns": len(usage_by_msg),
        "tokens": dict(tok),
        "hit_pct": hit_pct(tok),
        "tools": sum(tools.values()),
        "tool_calls": dict(tools),
        "tool_errors": errors,
        "reads": dict(reads),
        "repeated_bash": {k: v for k, v in cmds.items() if v > 1},
        "_tool_use_ids": set(tool_names),
    }


def busy_seconds(agents):
    """Length of the union of agent [start, end] intervals (time with >=1 agent running)."""
    total, cur_start, cur_end = 0.0, None, None
    for s, e in sorted((ts(x["start"]), ts(x["end"])) for x in agents):
        if cur_end is None or s > cur_end:
            if cur_end is not None:
                total += (cur_end - cur_start).total_seconds()
            cur_start, cur_end = s, e
        elif e > cur_end:
            cur_end = e
    return total + ((cur_end - cur_start).total_seconds() if cur_end is not None else 0.0)


def launch_groups(agents, wall_start):
    """Group agents whose starts fall within PARALLEL_WINDOW_S of the group's first start."""
    groups = []
    for x in agents:
        t = ts(x["start"])
        if groups and (t - groups[-1]["_t0"]).total_seconds() <= PARALLEL_WINDOW_S:
            groups[-1]["agents"].append(x["id"])
        else:
            groups.append({"_t0": t, "agents": [x["id"]]})
    return [{"t_plus_s": round((g["_t0"] - wall_start).total_seconds()),
             "parallel": len(g["agents"]) > 1, "agents": g["agents"]} for g in groups]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session")
    ap.add_argument("--project-dir")
    ap.add_argument("--since", help="ISO timestamp; ignore earlier events (for /clear'd or resumed sessions)")
    ap.add_argument("--idle-gap", type=float, default=60.0,
                    help="gaps between events longer than this many seconds count as idle (default 60)")
    a = ap.parse_args()
    pdir = project_dir(a.project_dir)
    since = ts(a.since)
    if a.session:
        main_jsonl = os.path.join(pdir, f"{a.session}.jsonl")
    else:
        files = glob.glob(os.path.join(pdir, "*.jsonl"))
        if not files:
            sys.exit(f"no transcripts in {pdir}")
        main_jsonl = max(files, key=os.path.getmtime)
    sid = os.path.basename(main_jsonl)[:-6]
    sdir = os.path.join(pdir, sid, "subagents")

    out = {"session": sid, "main": summarize(main_jsonl, since, a.idle_gap), "agents": [], "workflows": []}
    owner = {tid: "main" for tid in out["main"]["_tool_use_ids"]}

    for jl in glob.glob(os.path.join(sdir, "**", "agent-*.jsonl"), recursive=True):
        meta_path = jl[:-6] + ".meta.json"
        meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
        s = summarize(jl, since, a.idle_gap)
        if s["start"] is None:
            continue
        aid = os.path.basename(jl)[6:-6]
        for tid in s["_tool_use_ids"]:
            owner[tid] = aid
        run = re.search(r"workflows/(wf_[\w-]+)/", jl)
        out["agents"].append({"id": aid, "type": meta.get("agentType"),
                              "description": meta.get("description"),
                              "phase": meta.get("workflowPhase"),
                              "depth": meta.get("spawnDepth"),
                              "_spawned_by": meta.get("toolUseId"),
                              "workflow_run": run.group(1) if run else None, **s})
    out["agents"].sort(key=lambda x: x["start"])
    for x in out["agents"]:
        x["parent"] = owner.get(x.pop("_spawned_by"))

    for j in glob.glob(os.path.join(sdir, "workflows", "*", "journal.jsonl")):
        events = list(read_jsonl(j))
        out["workflows"].append({"run": os.path.basename(os.path.dirname(j)),
                                 "started": sum(e.get("type") == "started" for e in events),
                                 "results": sum(e.get("type") == "result" for e in events),
                                 "other_events": dict(collections.Counter(
                                     e.get("type") for e in events
                                     if e.get("type") not in ("started", "result", "launched")))})

    readers = collections.defaultdict(list)
    for who, blob in [("main", out["main"])] + [(x["id"], x) for x in out["agents"]]:
        for p, n in blob["reads"].items():
            readers[p].append((who, n))
    out["duplicate_reads"] = sorted(
        ({"path": p, "readers": len(r), "total_reads": sum(n for _, n in r)}
         for p, r in readers.items() if len(r) > 1 or sum(n for _, n in r) > 2),
        key=lambda x: -x["total_reads"])[:25]

    prev_end = None
    for x in out["agents"]:
        x["overlaps_previous"] = bool(prev_end and ts(x["start"]) < prev_end)
        e = ts(x["end"])
        prev_end = max(prev_end, e) if prev_end else e

    total = collections.Counter(out["main"]["tokens"])
    tools = out["main"]["tools"]
    for x in out["agents"]:
        total.update(x["tokens"])
        tools += x["tools"]
    totals = {"agents": len(out["agents"]), **dict(total), "cache_hit_pct": hit_pct(total), "tools": tools,
              "by_agent_type": dict(collections.Counter(x["type"] for x in out["agents"]))}
    if out["agents"]:
        wall_start = min(ts(x["start"]) for x in out["agents"])
        wall = (max(ts(x["end"]) for x in out["agents"]) - wall_start).total_seconds()
        busy = busy_seconds(out["agents"])
        totals["wall_s"] = round(wall, 1)
        totals["busy_s"] = round(busy, 1)
        totals["parallelism"] = round(sum(x["span_s"] for x in out["agents"]) / busy, 2) if busy else None
        totals["launch_order"] = launch_groups(out["agents"], wall_start)
        cp = max(out["agents"], key=lambda x: x["span_s"])
        totals["critical_path"] = {k: cp[k] for k in ("id", "type", "span_s", "active_s", "idle_s")}
    out["totals"] = totals

    for x in out["agents"] + [out["main"]]:
        x.pop("reads", None)
        x.pop("_tool_use_ids", None)
    json.dump(out, sys.stdout, indent=1, default=str)


if __name__ == "__main__":
    main()
