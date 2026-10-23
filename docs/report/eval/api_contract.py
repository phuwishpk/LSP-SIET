"""Static API contract check for report section 4.6.1.

Collects every API call written in the frontend code (main app + SIET packages, the roadmap app
and the quiz app) and matches it, method and path, against the live OpenAPI document. A call with
no matching route is a broken link between frontend and backend; a route with no caller is an
endpoint no screen uses.

  curl -s http://localhost:25055/openapi.json -o results/openapi.json
  python3 api_contract.py            # writes results/api_contract.json and prints the summary
"""

from __future__ import annotations

import json
import os
import re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SCAN = {
    "main app": ["open-notebook/frontend/src", "siet-platform/frontend/src", "kmitl-rag/frontend/src",
                 "community/frontend/src", "shared"],
    "roadmap app": ["ai-roadmap-generator/src"],
    "quiz app": ["My-ai-quiz/app"],
}
EXT = (".ts", ".tsx", ".js", ".jsx")
SKIP = re.compile(r"(node_modules|\.next|__tests__|\.test\.|\.spec\.|/test/|/tests/)")

API_CLIENT = re.compile(r"apiClient\.(get|post|put|patch|delete)\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*([`'\"])((?:(?!\2).)*)\2", re.S)
WS = re.compile(r"\bws\(\s*([`'\"])((?:(?!\1).)*)\1(.{0,240})", re.S)
LITERAL = re.compile(r"([`'\"])((?:(?!\1)[^\n])*?/api/(?:(?!\1)[^\n])*)\1")
METHOD_OPT = re.compile(r"method\s*:\s*['\"](GET|POST|PUT|PATCH|DELETE)['\"]", re.I)
WRAPPER = re.compile(r"\b(postJson|getJson|putJson|patchJson|deleteJson)\s*(?:<[^>]*>)?\s*\(\s*$")


def norm(path: str) -> str:
    """`${id}` after a slash becomes {p}; a `${...}` glued to text (a query suffix) ends the path."""
    out, i = "", 0
    while i < len(path):
        if path.startswith("${", i):
            depth, j = 0, i
            while j < len(path):
                depth += {"{": 1, "}": -1}.get(path[j], 0)
                if depth == 0 and path[j] == "}":
                    break
                j += 1
            if not out.endswith("/"):
                break
            out += "{p}"
            i = j + 1
        else:
            out += path[i]
            i += 1
    out = out.split("?")[0].split("#")[0]
    out = re.sub(r"/+", "/", out)
    return out.rstrip("/") or "/"


def route_handler_method(text: str) -> str | None:
    """A Next.js route handler forwards with the method it exports (POST, GET ...)."""
    found = re.findall(r"export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b", text)
    return found[0] if len(found) == 1 else None


def collect() -> list[dict]:
    calls = []
    for app, dirs in SCAN.items():
        for d in dirs:
            base = os.path.join(ROOT, d)
            for dirpath, _, files in os.walk(base):
                if SKIP.search(dirpath + "/"):
                    continue
                for name in files:
                    if not name.endswith(EXT) or SKIP.search(name):
                        continue
                    path = os.path.join(dirpath, name)
                    text = open(path, encoding="utf-8", errors="ignore").read()
                    rel = os.path.relpath(path, ROOT)

                    def line(pos: int) -> int:
                        return text.count("\n", 0, pos) + 1

                    seen = set()
                    for m in API_CLIENT.finditer(text):
                        seen.add(m.start(3))
                        raw = m.group(3)
                        tail = text[m.end(): m.end() + 3]
                        if raw.endswith("/") and tail.lstrip().startswith("+"):
                            raw += "{p}"
                        calls.append({"app": app, "file": rel, "line": line(m.start()), "method": m.group(1).upper(),
                                      "path": norm("/api/" + raw.lstrip("/")), "via": "apiClient"})
                    for m in WS.finditer(text):
                        if "/api/" in m.group(2) or "community/" not in m.group(2) and "users/" not in m.group(2):
                            continue
                        opt = METHOD_OPT.search(m.group(3))
                        calls.append({"app": app, "file": rel, "line": line(m.start()), "method": (opt.group(1).upper() if opt else "GET"),
                                      "path": norm("/api/" + m.group(2).lstrip("/")), "via": "ws proxy"})
                    handler = route_handler_method(text) if "/app/api/" in rel else None
                    for m in LITERAL.finditer(text):
                        if m.start(2) in seen:
                            continue
                        raw = m.group(2)
                        line_start = text.rfind("\n", 0, m.start()) + 1
                        prefix = text[line_start: m.start()]
                        if "//" in prefix or prefix.lstrip().startswith("*"):
                            continue  # inside a comment
                        if re.search(r"(from|import|require)\s*\(?\s*$", prefix) or raw.startswith(("@/", ".")):
                            continue  # a module import such as '@/lib/api/client'
                        if "://" in raw:
                            continue  # an absolute URL to another service (e.g. OpenRouter)
                        idx = raw.find("/api/")
                        path = norm(raw[idx:])
                        if path.startswith("/api/ws") or "/quiz/api/" in raw or "/roadmap/api/" in raw \
                                or "<" in path or "{p}{p}" in path or path in ("/api", "/api/{p}"):
                            continue  # the apps' own route handlers / proxy plumbing, not a SIET endpoint
                        before = text[max(0, m.start() - 60): m.start()]
                        after = text[m.end(): m.end() + 300]
                        w = WRAPPER.search(before)
                        opt = METHOD_OPT.search(after)
                        method = (w.group(1)[:-4].upper() if w else
                                  handler or (opt.group(1).upper() if opt else "GET"))
                        calls.append({"app": app, "file": rel, "line": line(m.start()), "method": method,
                                      "path": path, "via": "fetch"})
    return calls


def match(path: str, template: str) -> bool:
    a, b = path.strip("/").split("/"), template.strip("/").split("/")
    if len(a) != len(b):
        return False
    # A variable in the client only fills a path parameter, never a fixed word such as "defaults".
    return all(x == y or (y.startswith("{") and x != "") for x, y in zip(a, b))


def module_of(path: str) -> str:
    seg = path.split("/")
    return "/".join(seg[:3]) if len(seg) > 2 else path


def main() -> None:
    spec = json.load(open(os.path.join(HERE, "results", "openapi.json"), encoding="utf-8"))
    routes = [(m.upper(), p) for p, ops in spec["paths"].items() for m in ops
              if m in ("get", "post", "put", "patch", "delete") and p.startswith("/api/")]
    calls = collect()
    used = defaultdict(list)
    broken = []
    for c in calls:
        hits = [r for r in routes if r[0] == c["method"] and match(c["path"], r[1])]
        if hits:
            for r in hits:
                used[r].append(f"{c['file']}:{c['line']}")
            c["route"] = hits[0][1]
        else:
            same_path = [r for r in routes if match(c["path"], r[1])]
            c["problem"] = "method mismatch" if same_path else "no such route"
            broken.append(c)

    unique_calls = {(c["method"], c["path"]) for c in calls}
    per_module = defaultdict(lambda: {"routes": 0, "used": 0})
    for r in routes:
        mod = module_of(r[1])
        per_module[mod]["routes"] += 1
        per_module[mod]["used"] += 1 if r in used else 0
    per_app = defaultdict(lambda: {"calls": 0, "unique": set(), "broken": 0})
    for c in calls:
        per_app[c["app"]]["calls"] += 1
        per_app[c["app"]]["unique"].add((c["method"], c["path"]))
        per_app[c["app"]]["broken"] += 1 if "problem" in c else 0

    broken_unique = {}
    for c in broken:
        broken_unique.setdefault((c["method"], c["path"]), c)
    summary = {
        "openapi_operations": len(routes),
        "client_call_sites": len(calls),
        "client_unique_calls": len(unique_calls),
        "routes_used_by_frontend": len(used),
        "routes_without_caller": len(routes) - len(used),
        "broken_unique_calls": len(broken_unique),
        "per_app": {k: {"call_sites": v["calls"], "unique": len(v["unique"]), "broken_sites": v["broken"]} for k, v in per_app.items()},
    }
    out = {
        "summary": summary,
        "per_module": dict(sorted(per_module.items())),
        "broken": [{k: c[k] for k in ("app", "file", "line", "method", "path", "problem")} for c in broken_unique.values()],
        "unused_routes": sorted(f"{m} {p}" for m, p in routes if (m, p) not in used),
        "calls": calls,
    }
    with open(os.path.join(HERE, "results", "api_contract.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    print("\nper module (routes / used by a screen):")
    for mod, v in sorted(per_module.items()):
        print(f"  {mod:28} {v['routes']:3} / {v['used']:3}")
    print("\ncalls with no matching route:")
    for b in out["broken"]:
        print(f"  {b['method']:6} {b['path']:55} {b['problem']:16} {b['file']}:{b['line']}")
    print(f"\nroutes without a caller ({len(out['unused_routes'])}):")
    for r in out["unused_routes"]:
        print("  ", r)


if __name__ == "__main__":
    main()
