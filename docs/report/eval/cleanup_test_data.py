"""Remove the data the section 4.6 tests leave in the test stack.

  python3 cleanup_test_data.py              # leftovers of interrupted integration runs
  python3 cleanup_test_data.py --all        # everything: the IT46-201 course, its library and the it46.* accounts

Only touches records created by the 4.6 scripts (it46.* accounts, rooms named for the test,
mock Google accounts 650x9901@kmitl.ac.th). Needs IT46_ADMIN_PW (and IT46_PW for --all).
"""

from __future__ import annotations

import argparse
import os

import requests

from siet_client import DEFAULT_BASE

MOCK_EMAILS = ("65039901@kmitl.ac.th", "65019901@kmitl.ac.th")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=DEFAULT_BASE)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    api = args.base.rstrip("/") + "/api"
    tok = requests.post(f"{api}/users/login", json={"username": "it46.admin", "password": os.environ["IT46_ADMIN_PW"]}, timeout=30).json()["access_token"]
    admin = {"Authorization": f"Bearer {tok}"}

    # Rooms opened by the integration test (and, with --all, the IT46-201 course itself).
    rooms = requests.get(f"{api}/admin/courses", headers=admin, params={"q": "IT46", "limit": 200}, timeout=30).json()
    for room in rooms.get("items", rooms if isinstance(rooms, list) else []):
        name, code = room.get("name") or "", room.get("code") or ""
        if "ห้องทดสอบการบูรณาการ 4.6" in name or (args.all and code == "IT46-201" and "ทดสอบระบบ 4.6" in name):
            r = requests.delete(f"{api}/community/courses/{room['id']}", headers=admin, timeout=60)
            print("room", room["id"], code, r.status_code)

    # The integration test's pasted-text document (kept by an interrupted run).
    for room in rooms.get("items", []):
        if room.get("code") == "IT46-201":
            lib = requests.get(f"{api}/community/library", headers=admin, params={"course_id": room["id"]}, timeout=30).json()
            for d in lib.get("items", lib.get("documents", [])):
                if (d.get("title") or "").startswith("IT46 บันทึกการทดสอบการบูรณาการ"):
                    print("document", d["id"], requests.delete(f"{api}/community/library/{d['id']}", headers=admin, timeout=60).status_code)

    # Posts and documents written by the test accounts in earlier, interrupted runs.
    users = requests.get(f"{api}/admin/users", headers=admin, params={"q": "it46", "limit": 50}, timeout=30).json()
    users = users.get("items", users if isinstance(users, list) else [])
    for u in users:
        if not str(u.get("username", "")).startswith("it46."):
            continue
        posts = requests.get(f"{api}/admin/posts", headers=admin, params={"author_id": u["id"], "limit": 100}, timeout=30).json()
        for p in posts.get("items", []):
            if "4.6" in (p.get("title") or "") or args.all:
                print("post", p["id"], requests.delete(f"{api}/admin/posts/{p['id']}", headers=admin, timeout=30).status_code)

    # Mock Google accounts made by the RBAC steps.
    found = requests.get(f"{api}/admin/users", headers=admin, params={"q": "6503990", "limit": 20}, timeout=30).json()
    found = found.get("items", []) + requests.get(f"{api}/admin/users", headers=admin, params={"q": "6501990", "limit": 20}, timeout=30).json().get("items", [])
    for u in found:
        if (u.get("email") or "") in MOCK_EMAILS:
            print("mock user", u["id"], requests.delete(f"{api}/admin/users/{u['id']}", headers=admin, timeout=30).status_code)

    if args.all:
        # Library documents of the test teacher, then the accounts (deleting an account purges its data).
        for u in users:
            name = str(u.get("username", ""))
            if name.startswith("it46.") and name != "it46.admin":
                print("user", name, requests.delete(f"{api}/admin/users/{u['id']}", headers=admin, timeout=60).status_code)
        print("it46.admin is left for last: delete it from another admin account or the database.")


if __name__ == "__main__":
    main()
