"""Set up the isolated test environment of report section 4.6 (and take it down again).

  python3 test_stack.py up        # siet46-app / -roadmap / -quiz on the siettest-* databases
  IT46_PW=... IT46_ADMIN_PW=... python3 test_stack.py accounts   # it46.admin, it46.teacher, it46.student1-3
  IT46_PW=... python3 test_stack.py corpus    # course IT46-201 + the three PDFs in corpus/, prints the ids
  python3 test_stack.py down      # remove the siet46-* containers

`up` copies the environment of the running siettest-app container (database hosts, keys) into a
temporary env file that is deleted right after `docker run`, so no secret is written to the repo.
The app runs the same image as production (kmitlai/open-notebook:local) and never touches the
production databases. Passwords for the test accounts come from your environment.
"""

from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import tempfile
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
API = os.environ.get("SIET_API", "http://localhost:25055")
SKIP = {"PATH", "HOME", "LANG", "GPG_KEY", "PYTHON_VERSION", "PYTHON_SHA256", "HOSTNAME", "TERM", "LC_ALL",
        "VIRTUAL_ENV", "UV_NO_SYNC", "TIKTOKEN_CACHE_DIR"}
OVERRIDE = {
    "API_URL": "http://localhost:28502", "NEXT_PUBLIC_API_URL": "http://localhost:28502",
    "FRONTEND_URL": "http://localhost:28502",
    "CORS_ORIGINS": "http://localhost:28502,http://localhost:23001,http://localhost:23002",
    "AI_ROADMAP_URL": "http://localhost:23002/roadmap", "MY_AI_QUIZ_URL": "http://localhost:23001/quiz",
}


def sh(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def container_env(name: str) -> dict:
    env = json.loads(sh("docker", "inspect", name))[0]["Config"]["Env"]
    return dict(e.split("=", 1) for e in env)


def up() -> None:
    base = container_env("siettest-app")
    prod = container_env("kmitl_open_notebook_api")
    for key in ("ADMIN_EMAILS", "TEACHER_EMAILS", "KMITL_FACULTY_CODE"):  # added after siettest was made
        base.setdefault(key, prod.get(key, ""))
    data_dir = next(m["Source"] for m in json.loads(sh("docker", "inspect", "siettest-app"))[0]["Mounts"] if m["Destination"] == "/app/data")
    fd, env_file = tempfile.mkstemp(prefix="siet46-", suffix=".env")
    try:
        with os.fdopen(fd, "w") as f:
            for k, v in base.items():
                if k not in SKIP:
                    f.write(f"{k}={OVERRIDE.get(k, v)}\n")
        sh("docker", "run", "-d", "--name", "siet46-app", "--network", "siettest-net", "-p", "25055:5055", "-p", "28502:8502",
           "--env-file", env_file, "-v", f"{data_dir}:/app/data",
           "-v", f"{ROOT}/docker/open-notebook/supervisord.conf:/etc/supervisor/conf.d/supervisord.conf:ro",
           "-v", f"{ROOT}/open-notebook/prompts:/app/prompts:ro", "kmitlai/open-notebook:local")
    finally:
        os.remove(env_file)
    for name, port, image in [("siet46-roadmap", 23002, "kmitlai/ai-roadmap-generator:local"), ("siet46-quiz", 23001, "kmitlai/my-ai-quiz:local")]:
        sh("docker", "run", "-d", "--name", name, "--network", "siettest-net", "-p", f"{port}:3000",
           "-e", "OPEN_NOTEBOOK_API_URL=http://siet46-app:5055", "-e", "NODE_ENV=production",
           "-e", "NEXT_TELEMETRY_DISABLED=1", "-e", "PORT=3000", image)
    for _ in range(100):
        try:
            if requests.get(f"{API}/health", timeout=3).ok:
                print("siet46 stack is up: API :25055, web :28502, roadmap :23002, quiz :23001")
                return
        except requests.RequestException:
            pass
        time.sleep(3)
    sys.exit("the API did not come up; see `docker logs siet46-app`")


def down() -> None:
    for name in ("siet46-app", "siet46-roadmap", "siet46-quiz"):
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    print("removed the siet46-* containers (the siettest databases are untouched)")


def login(username: str, password: str) -> dict:
    r = requests.post(f"{API}/api/users/login", json={"username": username, "password": password}, timeout=30)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def accounts() -> None:
    admin_pw, pw = os.environ["IT46_ADMIN_PW"], os.environ["IT46_PW"]
    # The first admin cannot be made through the API, so create it with the app's own code.
    code = ("import asyncio, os\nfrom siet_platform.users import create, UserAlreadyExists\n"
            "async def main():\n    try:\n        await create('it46.admin', os.environ['PW'], display_name='IT46 Test Admin', role='admin')\n"
            "    except UserAlreadyExists:\n        pass\nasyncio.run(main())\n")
    subprocess.run(["docker", "exec", "-e", f"PW={admin_pw}", "siet46-app", "/app/.venv/bin/python", "-c", code], capture_output=True)
    h = login("it46.admin", admin_pw)
    for name, role, disp in [("it46.teacher", "teacher", "IT46 ผู้สอนทดสอบ"), ("it46.student1", "student", "IT46 นักศึกษาทดสอบ 1"),
                             ("it46.student2", "student", "IT46 นักศึกษาทดสอบ 2"), ("it46.student3", "student", "IT46 นักศึกษาทดสอบ 3")]:
        r = requests.post(f"{API}/api/admin/users", headers=h, json={"username": name, "password": pw, "display_name": disp, "role": role}, timeout=30)
        print(name, r.status_code)


def corpus() -> None:
    pw = os.environ["IT46_PW"]
    t = login("it46.teacher", pw)
    r = requests.post(f"{API}/api/community/courses", headers=t, timeout=30, json={
        "code": "IT46-201", "name": "การพัฒนาเว็บแอปพลิเคชัน (ทดสอบระบบ 4.6)", "description": "ห้องวิชาสำหรับการทดสอบหัวข้อ 4.6",
        "term": "2/2569", "join_code": "IT46JOIN"})
    cid = r.json()["id"]
    for s in ("it46.student1", "it46.student2", "it46.student3"):
        requests.post(f"{API}/api/community/courses/{cid}/join", headers=login(s, pw), json={"code": "IT46JOIN"}, timeout=30)
    ids = {}
    for path in sorted(glob.glob(os.path.join(HERE, "corpus", "*.pdf"))):
        with open(path, "rb") as f:
            u = requests.post(f"{API}/api/community/library", headers=t, data={"scope": "course", "course_id": str(cid)},
                              files={"file": (os.path.basename(path), f, "application/pdf")}, timeout=120)
        ids[os.path.basename(path)] = u.json()["document"]["id"]
        time.sleep(16)  # library upload cooldown
    for doc_id in ids.values():
        for _ in range(100):
            d = requests.get(f"{API}/api/community/library/{doc_id}", headers=t, timeout=30).json()
            if (d.get("document") or d)["status"] != "processing":
                break
            time.sleep(3)
    key = {"IT46-201": "syllabus", "IT46-DS": "ds", "IT46-ค": "intern"}
    docs = ",".join(f"{next(v for k, v in key.items() if name.startswith(k))}={i}" for name, i in ids.items())
    print(f"course {cid}; use: --course {cid} --docs {docs}")


if __name__ == "__main__":
    {"up": up, "down": down, "accounts": accounts, "corpus": corpus}[sys.argv[1]]()
