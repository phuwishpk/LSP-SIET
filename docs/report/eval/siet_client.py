"""Small HTTP client shared by the section 4.6 test scripts.

Every call is timed and kept, so a script can print a summary table and dump
the raw log to results/*.json for the report.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

import requests

DEFAULT_BASE = os.environ.get("SIET_API", "http://localhost:25055")


@dataclass
class Call:
    module: str
    step: str
    method: str
    path: str
    role: str
    expected: list[int]
    status: int
    ms: float
    ok: bool
    note: str = ""


@dataclass
class Session:
    base: str
    role: str
    username: str
    token: Optional[str] = None
    user: dict = field(default_factory=dict)

    @property
    def headers(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}


class Recorder:
    def __init__(self, base: str = DEFAULT_BASE):
        self.base = base.rstrip("/")
        self.calls: list[Call] = []

    def login(self, username: str, password: str, role: str) -> Session:
        r = requests.post(
            f"{self.base}/api/users/login",
            json={"username": username, "password": password},
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        return Session(self.base, role, username, data["access_token"], data.get("user") or {})

    def call(
        self,
        module: str,
        step: str,
        s: Optional[Session],
        method: str,
        path: str,
        expect: int | list[int] = 200,
        note: str = "",
        timeout: float = 120,
        **kw: Any,
    ) -> requests.Response:
        expected = [expect] if isinstance(expect, int) else list(expect)
        headers = dict(kw.pop("headers", {}) or {})
        if s is not None:
            headers.update(s.headers)
        t0 = time.perf_counter()
        r = requests.request(method, f"{self.base}{path}", headers=headers, timeout=timeout, **kw)
        ms = (time.perf_counter() - t0) * 1000
        ok = r.status_code in expected
        if not ok and not note:
            note = r.text[:200]
        shown = re.sub(r"token=[^&]+", "token=<jwt>", path)  # never keep a JWT in the results
        self.calls.append(
            Call(module, step, method, shown, s.role if s else "anonymous", expected, r.status_code, round(ms, 1), ok, note)
        )
        mark = "PASS" if ok else "FAIL"
        print(f"{mark} {r.status_code} {ms:7.0f}ms [{module}] {step}")
        return r

    def dump(self, path: str, extra: Optional[dict] = None) -> None:
        payload = {"base": self.base, "calls": [asdict(c) for c in self.calls]}
        if extra:
            payload.update(extra)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=1)


def wait_for(fn, timeout: float = 300, every: float = 3.0):
    """Poll ``fn`` until it returns something truthy or the timeout passes."""
    end = time.time() + timeout
    while time.time() < end:
        value = fn()
        if value:
            return value
        time.sleep(every)
    return None
